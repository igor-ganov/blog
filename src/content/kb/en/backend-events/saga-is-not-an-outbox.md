---
title: 'A saga is not an outbox'
category: backend-events
summary: 'Saga is a workflow-level multi-step transaction with compensations; the outbox is a transport-level reliability mechanism — they are different layers.'
principle: "Saga is a workflow-level multi-step transaction with compensations; the outbox is a transport-level reliability mechanism. They are different layers — don't propose a saga as an outbox substitute."
severity: strong
tags: [backend-events, saga, outbox, architecture, distributed-systems]
sources:
  - project: 'an event-sourcing service'
    date: 2026-05-14
    note: 'saga rejected for single-step ingestion; saga is workflow layer, outbox is transport'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - backend-events/storage-in-service-db-per-engine-adapters
order: 3
updated: 2026-05-14
---

"Why not use a saga?" comes up in every design discussion that touches distributed
transactions. Sagas do handle multi-service consistency, so the question sounds
reasonable, but it conflates two problems that live at two different layers. The
confusion costs real time. Teams debate the pattern and prototype compensation logic,
then come back to an outbox anyway, because the reliability problem was never about
workflow management.

An event-sourcing service answered this explicitly on 2026-05-14, so there is a
concrete decision to point at rather than reasoning in the abstract.

## Why this matters

When the event-sourcing service was being designed, the question of saga vs outbox arose
because both involve multiple services and eventual consistency. The decision note:

> Saga deliberately rejected for the event-sourcing service. Ingestion is one step: the
> producer writes a ChangeEvent and the service records it. There is no multi-step
> business workflow to coordinate. No workflow means no saga.

That is the minimal framing. The fuller argument needs you to know what each pattern
actually does.

**A saga is a workflow-level construct.** It models a long-running business process that
spans multiple services as a sequence of local transactions, each one publishing an
event or command to trigger the next step. When a step fails, the saga runs
compensating transactions to undo the prior steps. The canonical example is an e-commerce
order that reserves inventory, charges a card, then schedules shipping: three separate
services, three local commits, and a defined set of compensations for when a step fails
after others have committed.

**An outbox is a transport-level construct.** It solves one problem. It guarantees
that a message is published to a broker exactly once relative to a local database commit,
even if the process crashes between the write and the publish. It has no concept of
workflow steps, compensation, or cross-service coordination. It only makes sure the message
leaves the service reliably.

The two operate at different layers:

```
Workflow layer:  [ Saga — coordinates steps, triggers compensations ]
                        │                        │
                        │  publishes events       │  receives commands
                        ▼                        ▼
Transport layer: [ Outbox + relay ]       [ Inbox + idempotent consumer ]
```

A saga _needs_ an outbox underneath. If a saga step publishes to a broker without an
outbox, that publish can be lost on a crash. A saga without reliable transport silently
skips steps, which is arguably worse than having no saga at all.

### Why the confusion happens

The confusion arises because sagas and outboxes share surface-level features: both
involve events, both cross service boundaries, both respond to partial failures. What
separates them is what "failure" means in each case.

- Saga failure: a **business step** fails (payment declined, inventory insufficient).
  The response is compensation: reverse prior steps to restore business-level consistency.
- Outbox failure: a **message delivery** fails (broker unavailable, process crash).
  The response is retry: re-attempt the same delivery until it succeeds.

Compensation logic and retry logic are not interchangeable. You cannot "retry" a payment
that was declined; you cancel the reservation instead. And you cannot "compensate" for a
broker being down, you queue the message and try again.

## How to apply

### When to reach for a saga

Use a saga when all three of these are true:

1. The operation spans **multiple services**, each with its own local transaction.
2. There is **business-meaningful failure** at one or more steps that cannot be simply
   retried (payment declined, stock exhausted, external API returns a business error).
3. Prior committed steps need to be **explicitly reversed** when a later step fails.

```ts
// Saga coordinator sketch — orchestration style
type SagaStep<TContext> = {
  readonly execute: (ctx: TContext) => Promise<TContext>;
  readonly compensate: (ctx: TContext) => Promise<void>;
};

const runSaga = async <TContext>(
  steps: readonly SagaStep<TContext>[],
  initial: TContext,
): Promise<TContext> => {
  const committed: SagaStep<TContext>[] = [];
  let ctx = initial;

  for (const step of steps) {
    try {
      ctx = await step.execute(ctx);
      committed.push(step);
    } catch (err) {
      // compensate in reverse order
      for (const done of [...committed].reverse()) {
        await done.compensate(ctx).catch(console.error);
      }
      throw err;
    }
  }

  return ctx;
};
```

Each step still publishes events via an outbox. The saga coordinates the workflow;
the outbox guarantees each publish reaches the broker.

### When an outbox alone is sufficient

Use only an outbox when:

- The operation is **a single local transaction** that needs to notify other services.
- Failure means "message not delivered" — retrying is the correct response.
- There are no prior steps to compensate.

This ingestion pattern is this case. The producer writes one ChangeEvent in its own
transaction, and the event-sourcing service records it. If the record fails, the message is
redelivered. There is nothing to compensate, since either the event is recorded or it is not.

```ts
// Not a saga. One step. Retry on failure. Outbox handles reliability.
export const handleInboundEvent = async (event: InboundEvent): Promise<void> => {
  await changeEventsCollection.insertOne({
    _id: event.eventId,   // idempotent insert — see transactional-outbox-idempotent-consumer
    ...mapToRecord(event),
  });
};
```

## Anti-patterns

```ts
// Bad: proposing a saga to solve a delivery-reliability problem.
// The saga here adds compensation overhead for a problem that needs retry, not reversal.

const ingestEventSaga: SagaStep<IngestContext>[] = [
  {
    execute: async (ctx) => {
      await changeEventsCollection.insertOne(ctx.record);
      return ctx;
    },
    compensate: async (ctx) => {
      // What does it mean to "undo" recording a change event?
      // Deleting it introduces a different consistency problem.
      await changeEventsCollection.deleteOne({ _id: ctx.record._id });
    },
  },
];
// This is a retry problem. Use an outbox and an idempotent consumer.


// Bad: a saga that does not use an outbox for its step publications.
// Step publishes are fire-and-forget — silently lost on crash.
const reserveInventoryStep: SagaStep<OrderContext> = {
  execute: async (ctx) => {
    await inventoryDb.reserve(ctx.orderId, ctx.items);
    await broker.publish('inventory.reserved', ctx); // no outbox — unreliable
    return ctx;
  },
  compensate: async (ctx) => {
    await inventoryDb.release(ctx.orderId);
    await broker.publish('inventory.released', ctx); // also unreliable
  },
};
// Each broker publish here needs its own outbox to be reliable.
```

The first anti-pattern wastes design effort on compensation logic that is semantically
meaningless for the actual failure mode. The second builds a saga on a transport that
silently loses messages, so the workflow it is supposed to guarantee never holds.

## See also

The full outbox implementation that saga steps should be built on is in
[Transactional outbox + idempotent consumer](/kb/backend-events/transactional-outbox-idempotent-consumer).
The per-engine adapter design that makes the outbox portable across a mixed-engine fleet
is in [Outbox in the service's own DB; per-engine adapters, never 2PC](/kb/backend-events/storage-in-service-db-per-engine-adapters).
