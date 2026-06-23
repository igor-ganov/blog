---
title: 'Retry e dead-letter sono responsabilità di prima classe della libreria'
category: backend-events
summary: 'Integra retry e code dead-letter dentro la libreria di delivery su entrambi i lati — relay del mittente e handler del ricevente — invece di lasciarli a ogni servizio che la adotta.'
principle: 'Integra retry (maxAttempts, backoff exponential/fixed) e code dead-letter dentro la libreria di delivery su entrambi i lati: il relay del mittente ritenta la publish e poi sposta su dlq_outbox; il ricevente ritenta tramite il visibility timeout del broker, poi fa ack e scrive su dlq_inbox.'
severity: strong
tags: [backend-events, retry, dlq, dead-letter, reliability, outbox]
sources:
  - project: 'un servizio di event sourcing'
    date: 2026-05-14
    note: 'configurazione retry + DLQ su entrambi i lati; facade createSender/createReceiver'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - error-handling/never-swallow-errors
order: 4
updated: 2026-05-14
---

Retry e gestione dead-letter non appartengono all'applicazione. Ogni servizio che pubblica
o consuma eventi ne ha bisogno, la forma è sempre la stessa e le modalità di fallimento si
ripetono da un servizio all'altro. Sposta quella logica dentro ogni servizio che la adotta
e finirà per divergere: uno limita i retry a tre, un altro a dieci, alcuni scelgono backoff
fisso e altri esponenziale, e quasi tutti dimenticano il percorso dead-letter. Poi un
messaggio fallisce per sempre e sparisce senza lasciare traccia.

Un servizio di event sourcing ha chiuso la questione il 2026-05-14 rendendo retry e DLQ
responsabilità della libreria stessa, configurati una volta per coppia sender/receiver
invece che per ogni adottante.

## Perché conta

Un messaggio che fallisce l'elaborazione ha bisogno di un destino definito. A ogni confine
di retry ci sono due esiti:

1. L'operazione alla fine riesce entro `maxAttempts` — percorso normale.
2. L'operazione esaurisce `maxAttempts` — il messaggio va conservato in uno store
   dead-letter, non scartato in silenzio.

Senza una garanzia di questo contratto a livello di libreria, l'esito 2 di solito degenera
in uno scarto silenzioso. Un `console.error` seguito da un return non è una coda
dead-letter. I messaggi persi sono perdita di dati invisibile: nessuna traccia che il
messaggio sia esistito, nessun modo di rieseguirlo, nessun alert che qualcosa sia andato
storto. Vedi
[non inghiottire mai gli errori](/principles/error-handling/never-swallow-errors) per capire perché
questo conta anche al di fuori del messaging.

I due lati del percorso di delivery usano meccanismi di retry diversi, quindi la libreria
deve gestirli entrambi:

- **Lato mittente** — il relay controlla il retry. Ritenta direttamente la chiamata
  HTTP/broker di publish e, all'esaurimento, sposta la riga dell'outbox su
  `dlq_outbox_<svc>`.
- **Lato ricevente** — il broker controlla il retry tramite il visibility timeout. Il
  consumer lascia che il messaggio torni in coda fino a `maxAttempts` volte. All'esaurimento
  fa ack del messaggio (rimuovendolo dalla coda) e scrive su `dlq_inbox_<svc>`.

## Come applicarlo

### Forma della configurazione di retry

```ts
// event-source/src/config/retry.ts

export type BackoffStrategy = 'exponential' | 'fixed';

export type RetryConfig = {
  readonly maxAttempts: number;
  readonly backoff: BackoffStrategy;
  readonly initialDelayMs: number;
  readonly deadLetter: DeadLetterConfig;
};

export type DeadLetterConfig = {
  readonly enabled: boolean;
  readonly collectionOrTable: string; // e.g. 'dlq_outbox_orders', 'dlq_inbox_payments'
};

const computeDelay = (attempt: number, config: RetryConfig): number =>
  config.backoff === 'exponential'
    ? config.initialDelayMs * 2 ** attempt
    : config.initialDelayMs;
```

### Lato mittente — relay con retry e dlq_outbox

```ts
// event-source/src/relay/run-relay.ts

import type { Outbox, OutboxMessage } from '../outbox/types';
import type { RetryConfig } from '../config/retry';

type RelayDeps = {
  readonly outbox: Outbox;
  readonly dlqOutbox: DlqStore;
  readonly publish: (msg: OutboxMessage) => Promise<void>;
  readonly retry: RetryConfig;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const publishWithRetry = async (
  msg: OutboxMessage,
  deps: RelayDeps,
): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < deps.retry.maxAttempts; attempt++) {
    try {
      await deps.publish(msg);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < deps.retry.maxAttempts - 1) {
        await sleep(computeDelay(attempt, deps.retry));
      }
    }
  }

  // Exhausted all attempts — move to DLQ, do not silently drop.
  if (deps.retry.deadLetter.enabled) {
    await deps.dlqOutbox.insert({
      originalEventId: msg.eventId,
      message: msg,
      failedAt: new Date(),
      reason: String(lastError),
    });
    await deps.outbox.markPublished(msg.eventId); // remove from pending to stop relay looping
  } else {
    throw lastError; // if DLQ is disabled, propagate — never swallow
  }
};

export const runRelay = (deps: RelayDeps): NodeJS.Timeout => {
  const drainOnce = async (): Promise<void> => {
    const pending = await deps.outbox.listPending(100);
    for (const msg of pending) {
      await publishWithRetry(msg, deps);
      await deps.outbox.markPublished(msg.eventId);
    }
  };

  return setInterval(
    () => void drainOnce().catch(console.error),
    5_000,
  );
};
```

Il relay non scarta mai un messaggio di nascosto. O la publish riesce, oppure il messaggio
finisce in `dlq_outbox_<svc>` con motivo del fallimento e timestamp.

### Lato ricevente — visibility timeout + dlq_inbox

SQS, come la maggior parte dei broker, fa retry lato server tramite il visibility timeout:
se il consumer non fa ack entro il timeout, il messaggio torna visibile e viene riconsegnato.
La libreria avvolge questo meccanismo leggendo il contatore di ricezioni dall'attributo del
messaggio, poi facendo ack e scrivendo sulla DLQ una volta raggiunto il limite.

```ts
// event-source/src/receiver/handle-message.ts

import type { SqsMessage } from '../transport/sqs';
import type { Inbox } from '../inbox/types';
import type { RetryConfig } from '../config/retry';

type HandlerDeps = {
  readonly inbox: Inbox;
  readonly dlqInbox: DlqStore;
  readonly retry: RetryConfig;
  readonly processEvent: (event: InboundEvent) => Promise<void>;
};

const getAttemptCount = (msg: SqsMessage): number =>
  Number(msg.attributes?.ApproximateReceiveCount ?? 1);

export const handleMessage =
  (deps: HandlerDeps) =>
  async (msg: SqsMessage): Promise<'ack' | 'nack'> => {
    const event = parseInboundEvent(msg.body);
    const attempt = getAttemptCount(msg);

    if (await deps.inbox.isDuplicate(event.eventId)) {
      return 'ack'; // idempotent — already processed
    }

    try {
      await deps.processEvent(event);
      await deps.inbox.markProcessed(event.eventId, undefined);
      return 'ack';
    } catch (err) {
      if (attempt >= deps.retry.maxAttempts) {
        // Exhausted retries — ack to remove from queue, write to DLQ.
        if (deps.retry.deadLetter.enabled) {
          await deps.dlqInbox.insert({
            originalEventId: event.eventId,
            message: msg,
            failedAt: new Date(),
            reason: String(err),
          });
        }
        return 'ack'; // must ack — message has been durably stored in DLQ
      }

      // Still within retry budget — nack so the broker redelivers after visibility timeout.
      return 'nack';
    }
  };
```

Il ricevente non inghiotte mai gli errori di nascosto. Prima che si raggiunga `maxAttempts`,
`nack` dice al broker di riconsegnare. Una volta esauriti i tentativi, il messaggio va in
`dlq_inbox_<svc>` e viene fatto ack.

### Facade di alto livello

La libreria esporta due factory function che collegano tutto. Gli adottanti lavorano
attraverso le facade invece che sui singoli componenti.

```ts
// event-source/src/index.ts

export type SenderConfig = {
  readonly outbox: Outbox;
  readonly transport: Transport;
  readonly retry: RetryConfig;
};

export type ReceiverConfig = {
  readonly inbox: Inbox;
  readonly transport: Transport;
  readonly retry: RetryConfig;
  readonly processEvent: (event: InboundEvent) => Promise<void>;
};

export const createSender = (config: SenderConfig): Sender => ({
  start: () =>
    runRelay({
      outbox: config.outbox,
      dlqOutbox: createDlqStore(config.retry.deadLetter),
      publish: config.transport.publish,
      retry: config.retry,
    }),
});

export const createReceiver = (config: ReceiverConfig): Receiver => ({
  start: () =>
    config.transport.subscribe(
      handleMessage({
        inbox: config.inbox,
        dlqInbox: createDlqStore(config.retry.deadLetter),
        retry: config.retry,
        processEvent: config.processEvent,
      }),
    ),
});
```

Un servizio che adotta la libreria la collega una sola volta all'avvio:

```ts
// orders-service/src/bootstrap.ts

const sender = createSender({
  outbox: createMongoOutbox({ db: ordersDb }),
  transport: createSqsTransport({ queueUrl: env.EVENT_QUEUE_URL }),
  retry: {
    maxAttempts: 5,
    backoff: 'exponential',
    initialDelayMs: 200,
    deadLetter: {
      enabled: true,
      collectionOrTable: 'dlq_outbox_orders',
    },
  },
});

sender.start();
```

I pezzi di basso livello (`createMongoOutbox`, `runRelay`, `createSqsTransport`) restano
esportati per i servizi che hanno bisogno di accesso diretto. Le facade ci sono per comodità
e non tagliano fuori nessuno dalle singole parti.

## Anti-pattern

```ts
// Bad: swallowing errors after exhausting retries on the sender side.
// The message disappears. No DLQ, no log that it existed.
const publishWithRetry = async (msg: OutboxMessage): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    try {
      await broker.publish(msg);
      return;
    } catch {
      // swallowed — third failure = silent discard
    }
  }
};


// Bad: fixed retry count hardcoded in each service.
// Services diverge; some retry 3 times, some 10, with no consistency.
// When you need to change the policy, you touch every service.
const MAX_RETRIES = 3; // in orders-service
const MAX_RETRIES = 10; // in payments-service — different, undocumented reason


// Bad: not writing to DLQ, just logging.
// A log entry is not replay-able. You cannot reprocess a log line.
} catch (err) {
  console.error('Message processing failed permanently', err);
  return 'ack'; // message is gone, no record in a durable store
}
```

Ognuno di questi casi produce perdita di messaggi invisibile e permanente. Senza una DLQ non
puoi sapere quanti messaggi sono andati persi, cosa contenevano o quando rieseguirli una
volta sistemato il problema sottostante.

## Enforcement

- Le facade `createSender` e `createReceiver` richiedono una `RetryConfig` che includa
  `deadLetter`. Non è opzionale, e il tipo TypeScript lo impone a compile time.
- L'alerting sulla crescita di `dlq_outbox_<svc>` e `dlq_inbox_<svc>` è il presidio
  operativo. Messaggi che compaiono in una delle due DLQ indicano un fallimento sistematico
  da indagare, non un retry transitorio.
- Code review: nessun blocco `catch` in un handler di messaggi può restituire `'ack'` o
  `undefined` senza scrivere su una DLQ o rilanciare l'errore.

## Vedi anche

L'outbox e il consumer idempotente contro cui gira il relay del mittente sono trattati in
[Transactional outbox + idempotent consumer](/principles/backend-events/transactional-outbox-idempotent-consumer).
La regola per cui gli errori non vanno mai inghiottiti vale anche qui:
[non inghiottire mai gli errori](/principles/error-handling/never-swallow-errors).
