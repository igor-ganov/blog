---
title: 'Transactional outbox + consumer idempotente'
category: backend-events
summary: 'Garantire la consegna at-least-once sotto scaling con un transactional outbox sul producer e un consumer idempotente sul worker.'
principle: 'Garantire la consegna at-least-once sotto scaling con un transactional outbox sul producer e un consumer idempotente sul worker; deduplica inserendo con _id = eventId.'
severity: strong
tags: [backend-events, outbox, idempotency, reliability, messaging]
sources:
  - project: 'un servizio di event sourcing'
    date: 2026-05-12
    note: 'outbox sul producer + consumer idempotente; deduplica _id=eventId; runRelay → POST /events → SQS'
related:
  - backend-events/storage-in-service-db-per-engine-adapters
  - backend-events/retry-and-dlq-first-class
  - ddd/small-aggregates-by-identity
order: 1
updated: 2026-05-12
---

I sistemi distribuiti vanno in errore nel mezzo di una scrittura. Un producer fa il commit
di una riga di business e poi il processo crasha prima di riuscire a pubblicare l'evento.
Magari il broker è momentaneamente irraggiungibile, magari il pod fa scale down a metà
della richiesta. Lo schema ingenuo, che scrive lo stato di business e poi pubblica sul
broker in due operazioni separate, non sopravvive a niente di tutto questo. La coppia
transactional outbox + consumer idempotente è la correzione affidabile più piccola che
conosca. Trasforma il problema della doppia scrittura in una questione di database e tiene
l'interazione con il broker fuori dal percorso caldo.

## Perché conta

Un servizio di event sourcing (2026-05-12) instrada tutta l'ingestione attraverso SQS
invece di accettare scritture HTTP dirette dai producer nel momento della transazione di
business. La nota di design lo dice chiaro:

> L'ingestione è basata su coda e garantita sotto scaling: transactional outbox sul
> producer, consumer idempotente sul worker consumatore (insert con `_id = eventId` → le
> consegne duplicate sono no-op).

Salta l'outbox e l'errore salta fuori in fretta. Un producer che scrive la sua riga di
business e poi prova a fare POST su `/events` nello stesso handler perde l'evento ogni
volta che la chiamata HTTP fallisce, il processo riparte, o un secondo pod si infila in una
race. Il servizio finisce con dei buchi: eventi di cambiamento mancanti dal log, e nessun
errore da indicare, perché dal punto di vista del chiamante il buco è un non-evento.

Il consumer idempotente all'altro capo gestisce l'errore complementare. SQS consegna un
messaggio almeno una volta, quindi lo stesso evento può arrivare due volte, di solito dopo
un retry di rete o la scadenza di un visibility timeout. Inserire con `_id = eventId`
trasforma una consegna duplicata in un no-op. L'indice unico di MongoDB su `_id` rifiuta il
secondo insert, il worker intercetta l'errore di chiave duplicata e fa l'ack normalmente.

Metti insieme le due metà e l'applicazione vede una semantica exactly-once dall'inizio alla
fine, anche se il trasporto sottostante è at-least-once.

## Come applicarlo

### Passo 1 — doppia scrittura atomica sul producer

Nella stessa transazione di database che fa il commit del cambiamento di business, inserisci
una riga nella tabella outbox. Entrambe le righe vengono committate insieme oppure nessuna
delle due.

```ts
// producer-service/src/orders/create-order.ts

import { ClientSession } from 'mongodb';
import { ordersCollection, outboxCollection } from '../db';
import type { Order, OutboxMessage } from '../types';

const createOrder = async (
  payload: CreateOrderPayload,
  session: ClientSession,
): Promise<Order> =>
  session.withTransaction(async () => {
    const order: Order = {
      _id: crypto.randomUUID(),
      ...payload,
      createdAt: new Date(),
    };

    await ordersCollection.insertOne(order, { session });

    const outboxMessage: OutboxMessage = {
      _id: crypto.randomUUID(),           // outbox row id — internal
      eventId: crypto.randomUUID(),       // stable event identity carried downstream
      topic: 'order.created',
      payload: order,
      createdAt: new Date(),
      publishedAt: null,
    };

    await outboxCollection.insertOne(outboxMessage, { session });

    return order;
  });
```

L'handler di business non tocca mai il broker. Tutto quello che fa è scrivere righe.

### Passo 2 — il relay svuota l'outbox

Un processo in background (`runRelay`) interroga l'outbox per le righe non pubblicate e fa
POST di ciascuna verso l'endpoint `/events` del servizio di event sourcing. Marca la riga
come pubblicata solo dopo una risposta andata a buon fine (2xx).

```ts
// producer-service/src/relay/run-relay.ts

import type { OutboxMessage } from '../types';
import { outboxCollection } from '../db';

type RelayConfig = {
  readonly pollingIntervalMs: number;
  readonly eventServiceUrl: string;
};

const publishToEventService = async (
  msg: OutboxMessage,
  baseUrl: string,
): Promise<void> => {
  const res = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: msg.eventId,
      topic: msg.topic,
      payload: msg.payload,
      occurredAt: msg.createdAt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Event service rejected event ${msg.eventId}: ${res.status}`);
  }
};

const drainOnce = async (eventServiceUrl: string): Promise<void> => {
  const pending = await outboxCollection
    .find({ publishedAt: null })
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray();

  for (const msg of pending) {
    await publishToEventService(msg, eventServiceUrl);
    await outboxCollection.updateOne(
      { _id: msg._id },
      { $set: { publishedAt: new Date() } },
    );
  }
};

export const runRelay = (config: RelayConfig): NodeJS.Timeout =>
  setInterval(
    () => void drainOnce(config.eventServiceUrl).catch(console.error),
    config.pollingIntervalMs,
  );
```

Tenere il relay separato dal percorso di business è una scelta voluta. Puoi riavviarlo,
scalarlo per conto suo e lasciargli fare i retry senza che nulla di tutto ciò tocchi la
latenza di scrittura del producer.

### Passo 3 — insert idempotente sul consumer

Il worker del servizio di event sourcing riceve gli eventi da SQS e li inserisce con
`_id = eventId`. L'indice unico su `_id` rende la seconda consegna dello stesso evento un
no-op silenzioso.

```ts
// event-service/src/worker/handle-event.ts

import { MongoServerError } from 'mongodb';
import { changeEventsCollection } from '../db';
import type { InboundEvent, ChangeEvent } from '../types';

const DUPLICATE_KEY_CODE = 11000;

const isDuplicateKey = (err: unknown): boolean =>
  err instanceof MongoServerError && err.code === DUPLICATE_KEY_CODE;

export const handleEvent = async (event: InboundEvent): Promise<void> => {
  const record: ChangeEvent = {
    _id: event.eventId,      // _id = eventId — the deduplication key
    topic: event.topic,
    payload: event.payload,
    occurredAt: new Date(event.occurredAt),
    receivedAt: new Date(),
  };

  try {
    await changeEventsCollection.insertOne(record);
  } catch (err) {
    if (isDuplicateKey(err)) {
      // Second delivery of the same event — already recorded. Ack and move on.
      return;
    }
    throw err;
  }
};
```

Quando l'insert lancia un errore di chiave duplicata, l'handler ritorna normalmente, il
messaggio SQS viene confermato e il duplicato viene scartato. Qualsiasi altro errore si
propaga e lascia il messaggio in coda per la riconsegna.

### Traccia end-to-end attraverso tre servizi

```
Producer service          Event service /events     Event service worker
─────────────────         ─────────────────────     ────────────────────
BEGIN tx
  INSERT orders
  INSERT outbox
COMMIT
          │
          │  (relay polls, finds unpublished)
          │
          └──► POST /events {eventId, topic, ...}
                         │
                         ├── enqueue to SQS ──────►  receive message
                         └── 202 Accepted            INSERT change_events
                                                        _id = eventId
                                                      (dup-key → no-op)
                                                      ack message
```

Un'unica traccia OpenTelemetry porta l'header `traceparent` attraverso la POST e fin dentro
gli attributi del messaggio SQS, così i tre span finiscono in un'unica traccia nel viewer
OTLP. Vedi [la telemetria non deve mai far crashare l'app](/principles/backend-events/telemetry-never-crashes).

## Anti-pattern

```ts
// Bad: write business data and publish in the same handler, no outbox.
// A crash between the two steps loses the event silently.
const createOrder = async (payload: CreateOrderPayload): Promise<Order> => {
  const order = await ordersCollection.insertOne(mapToOrder(payload));
  await broker.publish('order.created', order); // can fail; event lost
  return order;
};

// Bad: use a separate DB transaction for the outbox row.
// If the business transaction commits and the outbox transaction rolls back,
// the event is lost just as surely as the example above.
const createOrder = async (payload: CreateOrderPayload): Promise<Order> => {
  const order = await ordersCollection.insertOne(mapToOrder(payload));
  await outboxDb.insertOne(buildOutboxRow(order)); // different connection
  return order;
};

// Bad: ignore duplicate-key errors unconditionally.
// Swallowing all insert errors hides schema violations and data bugs.
try {
  await changeEventsCollection.insertOne(record);
} catch {
  // silently swallowed — see error-handling/never-swallow-errors
}
```

I primi due rompono le garanzie di consegna. Il terzo rompe il contratto di gestione degli
errori, dato che solo `code === 11000` è un no-op legittimo e tutto il resto deve propagarsi.

## Enforcement

- Imponi la presenza dell'outbox in code review con un test di architettura che afferma che
  nessun modulo di servizio importa un client del broker direttamente da un command handler
  di business.
- La query `publishedAt: null` nel relay funge anche da segnale operativo di salute. Un
  arretrato che cresce lì significa che il relay si è bloccato o che l'endpoint del servizio
  di event sourcing è giù.
- Aggiungi un alert su `outbox.pending_count > threshold` per intercettare i guasti del
  relay prima che si trasformino in perdita di dati.

## Vedi anche

La strategia di adapter per-engine che fa entrare l'outbox in qualsiasi database è trattata
in [Outbox nel DB del servizio stesso; adapter per-engine, mai 2PC](/principles/backend-events/storage-in-service-db-per-engine-adapters).
La gestione di retry e dead-letter per il relay vive in
[Retry e dead-letter sono concern di prima classe della libreria](/principles/backend-events/retry-and-dlq-first-class).
