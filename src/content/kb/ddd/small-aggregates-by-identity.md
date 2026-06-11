---
title: 'Small aggregates, referenced by identity, eventually consistent'
category: ddd
summary: "Vernon's four aggregate rules are not guidelines — they are the load-bearing constraints that keep a domain model operationally safe and evolvable."
principle: 'Model true invariants in consistency boundaries, keep aggregates small, reference other aggregates by identity, and use eventual consistency across boundaries.'
severity: context
tags: [ddd, aggregate, tactical-design, eventual-consistency, domain-events]
sources:
  - project: 'Vernon, Implementing DDD'
    date: 2026-05-27
    note: 'four aggregate rules: invariants, small, by identity, eventual consistency'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - ddd/bounded-contexts-not-crud-features
order: 5
updated: 2026-06-11
---

## Why this matters

**When this earns its keep.** This is tactical DDD, and it presupposes you are modelling aggregates at all — which is justified only on a large system with genuinely complex, invariant-rich domain logic. On a small or simple project, formal aggregate boundaries and eventual-consistency plumbing are overhead: a plain table with a transaction does the job, and the ceremony costs more than it returns. Apply the rules below once the domain is complex enough that consistency boundaries are a real design question. Feature-based structure and layer separation, by contrast, hold at every size (see [folder-by-usage](/kb/functional-architecture/one-function-per-file-folder-by-usage)).

Vaughn Vernon codified four rules for aggregate design in Implementing DDD (Vernon, 2013, ISBN 978-0321834577). They are stated in order of precedence, and the ordering matters:

1. **Model true invariants in consistency boundaries.** An Aggregate is a cluster of domain objects that must be kept consistent with each other by a single transactional boundary. Only the invariants that genuinely require simultaneous enforcement belong inside the same aggregate.
2. **Design small aggregates.** Vernon is direct: "limit the Aggregate to just the Root Entity and a minimal number of attributes and/or Value-typed properties." Small aggregates reduce lock contention, reduce the blast radius of failures, and reduce the cognitive load of reasoning about consistency.
3. **Reference other aggregates by identity.** An aggregate holds only the identifier of another aggregate — a `TenantId`, an `OrderId`, a `CustomerId` — never a direct object reference. This prevents cascading loads and cascading consistency requirements.
4. **Use eventual consistency outside the boundary.** Changes that span multiple aggregates or multiple bounded contexts are coordinated through domain events, not through distributed transactions. Consistency across boundaries is eventual, not immediate.

These four rules are not style preferences. They are load-bearing constraints. Violating rule 2 (aggregates that span many entities) produces aggregates that require full-object-graph locks for every write, causing contention at scale. Violating rule 3 (holding direct object references across aggregate boundaries) produces cascading load behaviour and makes the boundary meaningless — if Aggregate A holds a direct reference to Aggregate B, they share a consistency boundary in practice regardless of what the code says. Violating rule 4 (using distributed transactions across context boundaries) produces the operational fragility of a distributed monolith: a failure in one service rolls back work in another, coupling their availability.

The Aggregate is a tactical pattern; its correct design depends on the strategic work having been done first. As Evans states in the DDD Reference (https://www.domainlanguage.com/ddd/reference/), "each Aggregate has a root and a boundary. The boundary defines what is inside the Aggregate. The root is a single, specific Entity contained in the Aggregate." The root is the only entry point for external callers. The boundary enforces the invariants. The identity of the root is the only thing that crosses aggregate boundaries.

## How to apply

**Step 1 — Identify the true invariants.**

An invariant is a business rule that must always hold. Not "would be nice to hold" — must always hold, verified atomically. Examples:

- "A Subscription cannot be Active if its Plan has been deleted." — This is a consistency rule between Subscription and Plan; it must be verified at write time.
- "An Invoice total must equal the sum of its line items." — This is an internal rule within the Invoice aggregate; it must hold after every mutation.
- "Two Tenants cannot share the same email address." — This is a uniqueness constraint; it requires a set-membership check, which is often better enforced at the infrastructure level (unique index) than inside an aggregate.

The discipline is to distinguish true invariants from eventual-consistency rules. "An Anomaly Alert should be sent when an AnomalyEvent is created" is not an invariant — it is a reaction that can happen asynchronously. Making it an invariant (by putting AnomalyAlert creation inside the AnomalyEvent aggregate transaction) makes the aggregate responsible for notification infrastructure, which violates the single-responsibility principle and makes the aggregate harder to test.

**Step 2 — Draw the aggregate boundary around the minimum objects required to enforce the invariant.**

Start with one Entity (the root) and zero Value Objects. Add a Value Object or child Entity only when the invariant cannot be expressed without it. Apply Vernon's rule: if you are adding an object because it is "related" or "convenient", stop. Relation and convenience are not invariants.

A concrete example in the Subscription & Billing context:

```
// Aggregate: Subscription
// Root entity: Subscription
// Internal Value Objects: SubscriptionStatus, BillingPeriod
// Internal child Entity: none needed for core invariants
// Referenced by identity only: PlanId, TenantId

class Subscription {
  readonly id: SubscriptionId;
  readonly tenantId: TenantId;      // identity reference — not the Tenant object
  readonly planId: PlanId;          // identity reference — not the Plan object
  readonly status: SubscriptionStatus;
  readonly billingPeriod: BillingPeriod;

  suspend(reason: SuspensionReason): SubscriptionSuspended {
    // invariant: can only suspend an Active subscription
    if (this.status !== SubscriptionStatus.Active) {
      throw new DomainError('Subscription is not active');
    }
    return new SubscriptionSuspended(this.id, reason, new Date());
  }
}
```

The `Subscription` aggregate does not hold a `Tenant` object or a `Plan` object. It holds their identities. When the application service needs to enforce a cross-aggregate rule (e.g., "cannot subscribe to a Plan that has been archived"), it loads both aggregates independently, checks the rule in the application layer, and proceeds. The rule is not inside either aggregate; it is a coordination policy in the application service.

**Step 3 — Emit domain events at aggregate boundaries, consume them across context boundaries.**

When a mutation succeeds inside an aggregate, the aggregate records a domain event describing what happened. The event is not published immediately; it is stored with the aggregate's state in the same transaction (the Transactional Outbox pattern; see `/kb/backend-events/transactional-outbox-idempotent-consumer`). A relay process reads the outbox and publishes the events to downstream consumers asynchronously.

This is Vernon's fourth rule in mechanical form. The Subscription aggregate's `suspend()` method returns a `SubscriptionSuspended` event. The application service persists the updated aggregate and the event atomically. The notification service, the analytics service, and the dashboard projection each receive the event independently and react in their own time. No distributed transaction. No coupling through shared writes.

```
// Application service — coordinates across aggregates, owns no domain logic
async function suspendSubscription(
  subscriptionId: SubscriptionId,
  reason: SuspensionReason,
  repo: SubscriptionRepository,
  outbox: DomainEventOutbox
): Promise<void> {
  const subscription = await repo.findById(subscriptionId);
  const event = subscription.suspend(reason);

  // Atomic: aggregate state + event, same DB transaction
  await repo.saveWithEvent(subscription, event);
  // Relay picks up the event from the outbox asynchronously
}
```

**Step 4 — Enforce identity-only references at the type level.**

Reference leakage (holding an object reference where an identity reference is required) is the most common aggregate-design mistake. It is invisible in a codebase that uses an ORM with lazy loading, because the ORM makes cross-aggregate object traversal look free. It is not free — it loads the entire referenced aggregate graph, often without the caller's knowledge.

Enforce the boundary at the type level: the only type that may cross an aggregate boundary in a domain model is an identity wrapper (`TenantId`, `PlanId`, `SubscriptionId`). Domain types (`Tenant`, `Plan`, `Subscription`) never appear as fields on another aggregate. Code review and, where possible, lint rules enforce this. In TypeScript, a branded type for each aggregate identity makes the distinction explicit:

```
// Branded identity types — these cross boundaries
type SubscriptionId = string & { readonly _brand: 'SubscriptionId' };
type TenantId       = string & { readonly _brand: 'TenantId' };
type PlanId         = string & { readonly _brand: 'PlanId' };

// These do NOT cross aggregate boundaries as field types
// class Tenant { ... }
// class Plan { ... }
```

## Anti-patterns

**Anti-pattern 1: The "god aggregate" that owns everything related.**

Symptom: A `Tenant` aggregate contains a list of `Subscription` objects, each of which contains a list of `Invoice` objects, each of which contains a list of `LineItem` objects and a list of `PaymentAttempt` objects. Updating any tenant-related data locks the entire graph. Adding a new invoice line requires loading the entire tenant, all subscriptions, and all invoices.

The correct decomposition: `Tenant`, `Subscription`, `Invoice`, and `LineItem` are separate aggregate roots. They reference each other by identity. An `Invoice` holds a `SubscriptionId` and a `TenantId`, not the `Subscription` or `Tenant` objects.

**Anti-pattern 2: Using direct object references across aggregate boundaries.**

Symptom: The `Subscription` class has a field of type `Tenant`. ORM annotations eagerly or lazily load the `Tenant` whenever a `Subscription` is loaded. A bug in the `Tenant` aggregate causes all subscription writes to fail. A `Tenant` schema migration breaks all subscription tests.

The boundary is meaningless if objects cross it. Replace `tenant: Tenant` with `tenantId: TenantId` and load the `Tenant` separately when needed.

**Anti-pattern 3: Compensating transactions as a substitute for eventual consistency.**

Symptom: When a `Subscription` is created, the application service attempts to create a `Tenant` record, a `BillingProfile` record, and a notification record inside a single distributed transaction. If the notification service is down, the entire subscription creation rolls back.

Distributed transactions couple the availability of every participant. The correct design: create the `Subscription` aggregate, emit a `SubscriptionCreated` event, and let the downstream services (Billing, Notification) react asynchronously via the outbox relay. If the notification service is temporarily unavailable, it will process the event when it recovers. The `Subscription` was created successfully; notification delivery is a separate concern with its own retry semantics.

**Anti-pattern 4: Encoding process state inside a single aggregate.**

Symptom: A `Subscription` aggregate accumulates fields and status values that represent the state of a multi-step business process: `isOnboardingComplete`, `isBillingProfileCreated`, `isWelcomeEmailSent`. The aggregate is becoming a process manager.

A multi-step process that coordinates actions across multiple aggregates or services is a Saga (or Process Manager). It is a separate object with its own identity and its own state machine. It reacts to domain events from the participating aggregates and issues commands in response. The `Subscription` aggregate should contain only the invariants that belong to the subscription concept; the onboarding process state belongs in an `OnboardingProcess` aggregate or process manager.

## See also

The Transactional Outbox and Idempotent Consumer patterns (see `/kb/backend-events/transactional-outbox-idempotent-consumer`) are the concrete mechanisms that implement Vernon's fourth rule. Eventual consistency across aggregate and context boundaries is only safe when events are delivered reliably (outbox) and consumers handle duplicate delivery (idempotency).

The DDD Reference (Evans, CC-BY 4.0, https://www.domainlanguage.com/ddd/reference/) covers Aggregates, Entities, Value Objects, Domain Events, Repositories, and Factories as a set. The tactical patterns are designed to work together; understanding each pattern in isolation misses the structural role each plays in the whole.
