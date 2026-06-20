---
title: 'Keep the service generic — no per-domain endpoints'
category: backend-events
summary: 'Build domain-agnostic infrastructure: a generic event log with denormalised parent refs so every view is a single indexed find; producers POST to a generic /events endpoint.'
principle: 'Build domain-agnostic infrastructure: a generic event log with denormalised parent refs so every view is a single indexed find; new producers own their data + an outbox, run the relay, and POST to a generic /events — no bespoke endpoints per domain.'
severity: preferred
tags: [backend-events, generic, event-log, denormalisation, architecture]
sources:
  - project: 'an event-sourcing service'
    date: 2026-05-12
    note: 'generic event log; denormalised refs; single indexed find; producers POST /events'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - typescript/validate-at-the-boundary
order: 5
updated: 2026-05-12
---

An infrastructure service that grows a bespoke endpoint for each domain it serves stops
being infrastructure and turns into a feature repository. Every new domain adds an endpoint,
every domain change ripples into the service, and the team that owns the service ends up
gating every other team that wants to emit events. The event-sourcing service went the
other way: a single generic `/events` endpoint that any producer can POST to, backed by a
storage model that keeps every consumer query efficient without aggregation.

## Why this matters

The design from 2026-05-12 states the intent plainly:

> Domain-agnostic event log. Each event carries a denormalised parent chain (refs) so
> every "view" is a single indexed find by a ref tag — no aggregation, no projections.

Consider the alternative: a service with endpoints like `/order-events`, `/payment-events`,
and `/shipment-events`. Each new event source then needs a schema migration, a new handler,
and a deploy. Worse, that style tends to pull domain-specific query logic into the service,
coupling the infrastructure ever tighter to the domain model.

The generic model flips this around. The infrastructure service stays stable and closed to
change, producers own their own schemas and validation, and the event service never needs to
know what an "order" or a "payment" actually is.

The denormalised `refs` field is what makes it work. Rather than asking the consumer to join
or aggregate across collections to answer "all events related to order `ord_123`", the
producer embeds the full parent chain in every event at write time, and the consumer reads it
back with a single indexed find.

## How to apply

### Event schema — generic with denormalised refs

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

### Index strategy — attribute pattern, DocumentDB-portable

The `refs` array uses the attribute pattern for indexing, so any `{k, v}` pair is reachable
through one compound index. This stays portable to DocumentDB, which does not support every
MongoDB index type.

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

Every consumer view is a single indexed find:

```ts
// Find all events related to a specific order — no aggregation, no join.
const findEventsByOrder = (db: Db) => (orderId: string) =>
  db
    .collection<ChangeEvent>('change_events')
    .find({ 'refs.k': 'orderId', 'refs.v': orderId })
    .sort({ occurredAt: -1 })
    .toArray();
```

### Generic /events endpoint — validate at the boundary

The service accepts any event shape at the HTTP boundary but validates the envelope structure
before enqueuing. Payload content stays opaque: the service records it without inspecting it.
See [validate at the boundary](/kb/typescript/validate-at-the-boundary).

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

The endpoint never changes. A new producer can POST to it on day one without touching the
service at all.

### Producer side — build refs at write time

The producer embeds the full parent chain in the event. The event service never derives or
enriches refs; whatever the producer writes is exactly what gets stored.

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

A consumer that wants every event for `tenantId: 'tenant_xyz'` gets them in one query
regardless of event type, and a consumer that only cares about the order lifecycle queries
`topic: 'order.*'` and `refs.k: 'orderId'`, which is still one find.

### Role-based deployment — api / worker / all

The same Docker image runs in three modes via the `SERVICE_ROLE` environment variable:

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

You can scale the worker horizontally without adding API instances, or run both in a single
process during development. There is no code duplication between the two paths.

## Anti-patterns

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

The bespoke-endpoint pattern couples the infrastructure to every domain change. Pushing
domain logic into the service turns infrastructure into a feature service. And normalised
storage throws away the single-query guarantee, dragging aggregation back into every read.

## See also

The outbox and relay pattern that producers use to POST reliably to `/events` is in
[Transactional outbox + idempotent consumer](/kb/backend-events/transactional-outbox-idempotent-consumer).
Validating the event envelope at the HTTP boundary without inspecting payload internals is
covered in [validate at the boundary](/kb/typescript/validate-at-the-boundary).
