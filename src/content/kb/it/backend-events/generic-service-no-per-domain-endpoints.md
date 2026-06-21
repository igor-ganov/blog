---
title: 'Mantieni il servizio generico — niente endpoint per dominio'
category: backend-events
summary: 'Costruisci infrastruttura agnostica rispetto al dominio: un log eventi generico con riferimenti al genitore denormalizzati, così ogni vista è una singola find indicizzata; i producer fanno POST su un endpoint generico /events.'
principle: 'Costruisci infrastruttura agnostica rispetto al dominio: un log eventi generico con riferimenti al genitore denormalizzati, così ogni vista è una singola find indicizzata; i nuovi producer possiedono i propri dati + un outbox, eseguono il relay e fanno POST su un endpoint generico /events — niente endpoint su misura per dominio.'
severity: preferred
tags: [backend-events, generic, event-log, denormalisation, architecture]
sources:
  - project: 'un servizio di event sourcing'
    date: 2026-05-12
    note: 'log eventi generico; riferimenti denormalizzati; singola find indicizzata; i producer fanno POST /events'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - typescript/validate-at-the-boundary
order: 5
updated: 2026-05-12
---

Un servizio infrastrutturale che fa crescere un endpoint su misura per ogni dominio che serve
smette di essere infrastruttura e diventa un repository di funzionalità. Ogni nuovo dominio aggiunge un endpoint,
ogni modifica di dominio si propaga nel servizio, e il team che possiede il servizio finisce per
fare da collo di bottiglia per ogni altro team che vuole emettere eventi. Il servizio di event sourcing ha preso
la strada opposta: un singolo endpoint generico `/events` su cui qualunque producer può fare POST, sostenuto da un
modello di storage che mantiene efficiente ogni query dei consumer senza aggregazione.

## Perché conta

Il design del 2026-05-12 dichiara l'intento senza giri di parole:

> Log eventi agnostico rispetto al dominio. Ogni evento porta con sé una catena di genitori denormalizzata (refs) così che
> ogni "vista" sia una singola find indicizzata tramite un tag ref — niente aggregazione, niente proiezioni.

Considera l'alternativa: un servizio con endpoint come `/order-events`, `/payment-events`
e `/shipment-events`. Ogni nuova sorgente di eventi richiede allora una migrazione di schema, un nuovo handler
e un deploy. Peggio ancora, questo stile tende a tirare dentro il servizio la logica di query specifica del dominio,
accoppiando l'infrastruttura sempre più strettamente al modello di dominio.

Il modello generico ribalta la situazione. Il servizio infrastrutturale resta stabile e chiuso alle
modifiche, i producer possiedono i propri schemi e la propria validazione, e il servizio eventi non ha mai bisogno di
sapere cosa sia davvero un "ordine" o un "pagamento".

Il campo `refs` denormalizzato è ciò che lo fa funzionare. Invece di chiedere al consumer di fare join
o aggregazione tra collezioni per rispondere a "tutti gli eventi relativi all'ordine `ord_123`", il
producer incorpora l'intera catena di genitori in ogni evento al momento della scrittura, e il consumer la rilegge
con una singola find indicizzata.

## Come applicarlo

### Schema dell'evento — generico con refs denormalizzati

```ts
// event-service/src/events/types.ts

export type RefTag = {
  readonly k: string;   // key, e.g. 'orderId', 'customerId', 'tenantId'
  readonly v: string;   // value, e.g. 'ord_abc123'
};

// The stored ChangeEvent is structurally generic.
// The service does not know what 'payload' contains.
export type ChangeEvent = {
  readonly _id: string;              // eventId — the deduplication key
  readonly topic: string;            // e.g. 'order.created', 'payment.captured'
  readonly payload: Record<string, unknown>; // validated at boundary, opaque inside
  readonly refs: readonly RefTag[];  // denormalised parent chain
  readonly occurredAt: Date;
  readonly receivedAt: Date;
};
```

### Strategia di indicizzazione — attribute pattern, portabile su DocumentDB

L'array `refs` usa l'attribute pattern per l'indicizzazione, così qualsiasi coppia `{k, v}` è raggiungibile
tramite un unico indice composto. Questo resta portabile su DocumentDB, che non supporta ogni
tipo di indice di MongoDB.

```ts
// event-service/src/db/indexes.ts

import type { Db } from 'mongodb';

export const ensureIndexes = async (db: Db): Promise<void> => {
  const col = db.collection('change_events');

  // Compound index on the attribute-pattern refs array.
  // Supports: find({ 'refs.k': 'orderId', 'refs.v': 'ord_abc123' })
  await col.createIndex({ 'refs.k': 1, 'refs.v': 1 });

  // Topic + time for event-stream queries.
  await col.createIndex({ topic: 1, occurredAt: -1 });

  // _id is the deduplication key — MongoDB indexes this automatically.
};
```

Ogni vista del consumer è una singola find indicizzata:

```ts
// Find all events related to a specific order — no aggregation, no join.
const findEventsByOrder = (db: Db) => (orderId: string) =>
  db
    .collection<ChangeEvent>('change_events')
    .find({ 'refs.k': 'orderId', 'refs.v': orderId })
    .sort({ occurredAt: -1 })
    .toArray();
```

### Endpoint /events generico — valida al confine

Il servizio accetta qualsiasi forma di evento al confine HTTP ma valida la struttura dell'envelope
prima di accodarla. Il contenuto del payload resta opaco: il servizio lo registra senza ispezionarlo.
Vedi [valida al confine](/kb/typescript/validate-at-the-boundary).

```ts
// event-service/src/api/ingest-event.ts

import { z } from 'zod';

const RefTagSchema = z.object({
  k: z.string().min(1),
  v: z.string().min(1),
});

// The envelope is fully typed and validated.
// The payload is validated only as a non-null object — its shape is the producer's concern.
const InboundEventSchema = z.object({
  eventId: z.string().uuid(),
  topic: z.string().min(1),
  payload: z.record(z.unknown()),
  refs: z.array(RefTagSchema).min(1),
  occurredAt: z.string().datetime(),
});

export type InboundEvent = z.infer<typeof InboundEventSchema>;

export const parseInboundEvent = (raw: unknown): InboundEvent | undefined => {
  const result = InboundEventSchema.safeParse(raw);
  return result.success ? result.data : undefined;
};

// Route handler — generic for every domain
const handleIngestEvent = async (req: Request): Promise<Response> => {
  const body: unknown = await req.json();
  const event = parseInboundEvent(body);

  if (!event) {
    return new Response('Invalid event envelope', { status: 400 });
  }

  await sqsClient.sendMessage({
    QueueUrl: env.QUEUE_URL,
    MessageBody: JSON.stringify(event),
    MessageGroupId: event.topic,
    MessageDeduplicationId: event.eventId,
  });

  return new Response(null, { status: 202 });
};
```

L'endpoint non cambia mai. Un nuovo producer può farci POST dal primo giorno senza toccare per nulla
il servizio.

### Lato producer — costruisci i refs al momento della scrittura

Il producer incorpora l'intera catena di genitori nell'evento. Il servizio eventi non deriva né
arricchisce mai i refs; quello che il producer scrive è esattamente ciò che viene memorizzato.

```ts
// orders-service/src/orders/create-order.ts

const buildOrderCreatedEvent = (order: Order, customer: Customer): OutboxMessage => ({
  eventId: crypto.randomUUID(),
  topic: 'order.created',
  payload: {
    orderId: order._id,
    items: order.items,
    totalAmount: order.totalAmount,
  },
  refs: [
    { k: 'orderId', v: order._id },
    { k: 'customerId', v: customer._id },
    { k: 'tenantId', v: customer.tenantId },
  ],
  createdAt: new Date(),
  publishedAt: undefined,
});
```

Un consumer che vuole ogni evento per `tenantId: 'tenant_xyz'` li ottiene in una sola query
indipendentemente dal tipo di evento, e un consumer che si interessa solo al ciclo di vita dell'ordine interroga
`topic: 'order.*'` e `refs.k: 'orderId'`, che resta comunque una sola find.

### Deployment basato sui ruoli — api / worker / all

La stessa immagine Docker gira in tre modalità tramite la variabile d'ambiente `SERVICE_ROLE`:

```ts
// event-service/src/bootstrap.ts

type Role = 'api' | 'worker' | 'all';

const startForRole = (role: Role): void => {
  if (role === 'api' || role === 'all') {
    startHttpServer(); // serves generic /events
  }
  if (role === 'worker' || role === 'all') {
    startSqsConsumer(); // drains queue, inserts to change_events
  }
};

const role = (process.env['SERVICE_ROLE'] ?? 'all') as Role;
startForRole(role);
```

Puoi scalare il worker orizzontalmente senza aggiungere istanze API, oppure eseguire entrambi in un singolo
processo durante lo sviluppo. Non c'è duplicazione di codice tra i due percorsi.

## Anti-pattern

```ts
// Bad: per-domain endpoints. Each new event source requires a service change.
app.post('/order-events', handleOrderEvent);
app.post('/payment-events', handlePaymentEvent);
app.post('/shipment-events', handleShipmentEvent); // new producer = new endpoint = deploy

// Bad: domain logic in the infrastructure service.
// The event service now knows what a "cancelled order" means — it has become a domain service.
const handleOrderEvent = async (event: OrderEvent): Promise<void> => {
  if (event.type === 'order.cancelled' && event.payload.refundRequired) {
    await triggerRefundWorkflow(event.payload.orderId); // wrong layer
  }
  await storeEvent(event);
};

// Bad: normalised storage requiring aggregation for every consumer.
// Storing only the immediate parent means "all events for tenant X" requires
// joining across multiple collections or a multi-step aggregation.
type ChangeEvent = {
  _id: string;
  topic: string;
  parentId: string;       // only the direct parent — no chain
  parentType: string;
};
// Consumer: find orders by tenant → find events by orderId → two queries, no index coverage
```

Il pattern dell'endpoint su misura accoppia l'infrastruttura a ogni modifica di dominio. Spingere
la logica di dominio dentro il servizio trasforma l'infrastruttura in un servizio di funzionalità. E lo storage
normalizzato butta via la garanzia della singola query, trascinando di nuovo l'aggregazione dentro ogni lettura.

## Vedi anche

Il pattern outbox + relay che i producer usano per fare POST in modo affidabile su `/events` è in
[Outbox transazionale + consumer idempotente](/kb/backend-events/transactional-outbox-idempotent-consumer).
La validazione dell'envelope dell'evento al confine HTTP senza ispezionare gli interni del payload è
trattata in [valida al confine](/kb/typescript/validate-at-the-boundary).
