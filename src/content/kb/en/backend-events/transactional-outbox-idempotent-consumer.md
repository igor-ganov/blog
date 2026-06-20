---
title: 'Transactional outbox + idempotent consumer'
category: backend-events
summary: 'Guarantee at-least-once delivery under scaling with a transactional outbox on the producer and an idempotent consumer on the worker.'
principle: 'Guarantee at-least-once delivery under scaling with a transactional outbox on the producer and an idempotent consumer on the worker; dedupe by inserting with _id = eventId.'
severity: strong
tags: [backend-events, outbox, idempotency, reliability, messaging]
sources:
  - project: 'an event-sourcing service'
    date: 2026-05-12
    note: 'outbox on producer + idempotent consumer; _id=eventId dedupe; runRelay → POST /events → SQS'
related:
  - backend-events/storage-in-service-db-per-engine-adapters
  - backend-events/retry-and-dlq-first-class
  - ddd/small-aggregates-by-identity
order: 1
updated: 2026-05-12
---

Distributed systems fail in the middle of writes. A producer commits a business row and
then the process crashes before it can publish the event. Maybe the broker is briefly
unavailable, maybe the pod scales down mid-request. The naive pattern of writing business
state and then publishing to a broker in two separate operations cannot survive any of
that. The transactional outbox + idempotent consumer pair is the smallest reliable fix I
know of. It turns the dual-write problem into a database concern and keeps broker
interaction out of the hot path.

## Why this matters

An event-sourcing service (2026-05-12) routes all ingestion through SQS instead of
accepting direct HTTP writes from producers at the moment of the business transaction.
The design note spells it out:

> Ingestion is queue-based and guaranteed under scaling: transactional outbox on the
> producer, idempotent consumer on the consumer worker (insert with `_id = eventId` →
> duplicate deliveries are no-ops).

Skip the outbox and the failure shows up fast. A producer that writes its business row
and then tries to POST to `/events` in the same request handler loses the event whenever
the HTTP call fails, the process restarts, or a second pod races in. The service ends up
with gaps: change events missing from the log, and no error to point at, because from the
caller's perspective the gap is a non-event.

The idempotent consumer on the other end handles the complementary failure. SQS delivers
a message at least once, so the same event can arrive twice, usually after a network retry
or a visibility-timeout expiry. Inserting with `_id = eventId` turns a duplicate delivery
into a no-op. MongoDB's unique index on `_id` rejects the second insert, the worker
catches the duplicate-key error, and it acks normally.

Put the two halves together and the application sees exactly-once semantics end to end,
even though the transport underneath is at-least-once.

## How to apply

### Step 1 — atomic dual-write on the producer

In the same database transaction that commits the business change, insert a row into the
outbox table. Both rows commit together or neither does.

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

The business handler never touches the broker. All it does is write rows.

### Step 2 — relay drains the outbox

A background process (`runRelay`) polls the outbox for unpublished rows and POSTs each one
to the event-sourcing service's `/events` endpoint. It marks the row as published only
after a successful response (2xx).

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

Keeping the relay separate from the business path is deliberate. You can restart it, scale
it on its own, and let it retry without any of that touching the producer's write latency.

### Step 3 — idempotent insert on the consumer

The event-sourcing service worker receives events from SQS and inserts them with
`_id = eventId`. The unique index on `_id` makes the second delivery of the same event a
silent no-op.

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

When the insert throws a duplicate-key error, the handler returns normally, the SQS
message is acknowledged, and the duplicate is discarded. Any other error propagates and
leaves the message in the queue for redelivery.

### End-to-end trace across three services

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

A single OpenTelemetry trace carries the `traceparent` header through the POST and into
the SQS message attributes, so the three spans land in one trace in the OTLP viewer. See
[telemetry must never crash the app](/kb/backend-events/telemetry-never-crashes).

## Anti-patterns

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

The first two break delivery guarantees. The third breaks the error-handling contract,
since only `code === 11000` is a legitimate no-op and everything else has to propagate.

## Enforcement

- Enforce outbox presence in code review with an architecture test that asserts no service
  module imports a broker client directly from a business command handler.
- The `publishedAt: null` query in the relay doubles as an operational health signal. A
  growing backlog there means the relay has stalled or the event-sourcing service endpoint
  is down.
- Add an alert on `outbox.pending_count > threshold` to catch relay failures before they
  turn into data loss.

## See also

The per-engine adapter strategy that makes the outbox fit any database is covered in
[Outbox in the service's own DB; per-engine adapters, never 2PC](/kb/backend-events/storage-in-service-db-per-engine-adapters).
Retry and dead-letter handling for the relay lives in
[Retry and dead-letter are first-class library concerns](/kb/backend-events/retry-and-dlq-first-class).
