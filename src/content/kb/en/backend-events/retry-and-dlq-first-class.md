---
title: 'Retry and dead-letter are first-class library concerns'
category: backend-events
summary: 'Bake retry and dead-letter queues into the delivery library on both sides — sender relay and receiver handler — rather than leaving them to each adopting service.'
principle: 'Bake retry (maxAttempts, backoff exponential/fixed) and dead-letter queues into the delivery library on both sides — sender relay retries publish then moves to dlq_outbox; receiver retries via broker visibility timeout then acks and writes to dlq_inbox.'
severity: strong
tags: [backend-events, retry, dlq, dead-letter, reliability, outbox]
sources:
  - project: 'an event-sourcing service'
    date: 2026-05-14
    note: 'retry config + DLQ both sides; createSender/createReceiver facades'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - error-handling/never-swallow-errors
order: 4
updated: 2026-05-14
---

Retry and dead-letter handling don't belong to the application. Every service that
publishes or consumes events needs them, the shape is always the same, and the failure
modes repeat across services. Push that logic into each adopting service and it drifts:
one caps retries at three, another at ten, some pick fixed backoff and some exponential,
and most forget the dead-letter path. Then a message fails for good and vanishes with no
record of it.

An event-sourcing service settled this on 2026-05-14 by making retry and DLQ concerns of
the library itself, configured once per sender/receiver pair instead of per adopter.

## Why this matters

A message that fails processing needs a defined fate. At each retry boundary there are
two outcomes:

1. The operation eventually succeeds within `maxAttempts` — normal path.
2. The operation exhausts `maxAttempts` — the message must be preserved in a dead-letter
   store, not silently dropped.

Without library-level enforcement of this contract, outcome 2 usually degrades into a
silent discard. A `console.error` followed by a return is not a dead-letter queue.
Dropped messages are invisible data loss: no record that the message existed, no way to
replay it, no alert that anything went wrong. See
[never swallow errors](/principles/error-handling/never-swallow-errors) for why this matters
beyond messaging.

The two sides of the delivery path use different retry mechanisms, so the library has to
handle both:

- **Sender side** — the relay controls retry. It retries the publish HTTP/broker call
  directly and, on exhaustion, moves the outbox row to `dlq_outbox_<svc>`.
- **Receiver side** — the broker controls retry through visibility timeout. The consumer
  lets the message return to the queue up to `maxAttempts` times. On exhaustion it acks
  the message (removing it from the queue) and writes to `dlq_inbox_<svc>`.

## How to apply

### Retry configuration shape

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

### Sender side — relay with retry and dlq_outbox

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

The relay never discards a message quietly. Either the publish succeeds or the message
lands in `dlq_outbox_<svc>` with a failure reason and timestamp.

### Receiver side — visibility timeout + dlq_inbox

SQS, like most brokers, does server-side retry through the visibility timeout: if the
consumer doesn't ack within the timeout, the message becomes visible again and gets
redelivered. The library wraps this by reading the receive count from the message
attribute, then acking and writing to the DLQ once the limit is reached.

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

The receiver never swallows errors quietly. Before `maxAttempts` is reached, `nack` tells
the broker to redeliver. Once attempts run out, the message goes to `dlq_inbox_<svc>` and
gets acked.

### High-level facades

The library exports two factory functions that wire everything together. Adopters work
through the facades rather than the individual components.

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

A service adopting the library wires it once at startup:

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

The low-level pieces (`createMongoOutbox`, `runRelay`, `createSqsTransport`) stay exported
for services that need direct access. The facades are there for convenience and don't lock
anyone out of the parts.

## Anti-patterns

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

Each of these produces invisible, permanent message loss. With no DLQ you can't tell how
many messages were lost, what they held, or when to replay them once the underlying issue
is fixed.

## Enforcement

- The `createSender` and `createReceiver` facades require a `RetryConfig` that includes
  `deadLetter`. It isn't optional, and the TypeScript type enforces it at compile time.
- Alerting on `dlq_outbox_<svc>` and `dlq_inbox_<svc>` growth is the operational gate.
  Messages appearing in either DLQ mean a systematic failure worth investigating, not a
  transient retry.
- Code review: no `catch` block in a message handler may return `'ack'` or `undefined`
  without either writing to a DLQ or rethrowing.

## See also

The outbox and idempotent consumer that the sender relay runs against are covered in
[Transactional outbox + idempotent consumer](/principles/backend-events/transactional-outbox-idempotent-consumer).
The rule that errors must never be swallowed applies here too:
[never swallow errors](/principles/error-handling/never-swallow-errors).
