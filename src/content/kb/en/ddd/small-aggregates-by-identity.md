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

**When this earns its keep.** This is tactical DDD, and it presupposes you are modelling aggregates at all, which is justified only on a large system with genuinely complex, invariant-rich domain logic. On a small or simple project, formal aggregate boundaries and eventual-consistency plumbing are pure overhead. A plain table with a transaction does the job, and the ceremony costs more than it returns. Apply the rules below once the domain is complex enough that consistency boundaries become a real design question. Feature-based structure and layer separation hold at every size regardless (see [folder-by-usage](/principles/functional-architecture/one-function-per-file-folder-by-usage)).

Vaughn Vernon codified four rules for aggregate design in Implementing DDD (Vernon, 2013, ISBN 978-0321834577). He states them in order of precedence, and that ordering carries weight:

1. **Model true invariants in consistency boundaries.** An Aggregate is a cluster of domain objects that must be kept consistent with each other by a single transactional boundary. Only the invariants that genuinely require simultaneous enforcement belong inside the same aggregate.
2. **Design small aggregates.** Vernon is direct: "limit the Aggregate to just the Root Entity and a minimal number of attributes and/or Value-typed properties." A small aggregate locks less, has a smaller blast radius when a write fails, and is far easier to reason about when you need to prove a consistency rule holds.
3. **Reference other aggregates by identity.** An aggregate holds only the identifier of another aggregate — a `TenantId`, an `OrderId`, a `CustomerId` — never a direct object reference. This prevents cascading loads and cascading consistency requirements.
4. **Use eventual consistency outside the boundary.** Changes that span multiple aggregates or multiple bounded contexts are coordinated through domain events, not through distributed transactions. Consistency across boundaries is eventual, not immediate.

These are not style preferences but load-bearing constraints, and each one breaks in a specific way. Break rule 2 and your aggregates span many entities, so every write needs a full-object-graph lock and you get contention at scale. Break rule 3 by holding direct object references across boundaries and you get cascading loads; worse, the boundary becomes meaningless, because if Aggregate A holds a direct reference to Aggregate B then they share a consistency boundary in practice no matter what the code claims. Break rule 4 with distributed transactions across context boundaries and you have built a distributed monolith, where a failure in one service rolls back work in another and couples their availability.

Aggregate is a tactical pattern, and designing it correctly depends on having done the strategic work first. As Evans states in the DDD Reference (https://www.domainlanguage.com/ddd/reference/), "each Aggregate has a root and a boundary. The boundary defines what is inside the Aggregate. The root is a single, specific Entity contained in the Aggregate." The root is the only entry point for external callers, the boundary enforces the invariants, and the root's identity is the only thing that ever crosses from one aggregate to another.

## How to apply

**Step 1 — Identify the true invariants.**

An invariant is a business rule that must always hold, not one that "would be nice to hold" but one verified atomically on every write. Some examples:

- "A Subscription cannot be Active if its Plan has been deleted." — This is a consistency rule between Subscription and Plan; it must be verified at write time.
- "An Invoice total must equal the sum of its line items." — This is an internal rule within the Invoice aggregate; it must hold after every mutation.
- "Two Tenants cannot share the same email address." — This is a uniqueness constraint; it requires a set-membership check, which is often better enforced at the infrastructure level (unique index) than inside an aggregate.

The discipline is telling true invariants apart from eventual-consistency rules. "An Anomaly Alert should be sent when an AnomalyEvent is created" is not an invariant. It is a reaction that can happen asynchronously, and forcing it to be an invariant (by putting AnomalyAlert creation inside the AnomalyEvent aggregate transaction) makes the aggregate responsible for notification infrastructure. That violates the single-responsibility principle and makes the aggregate harder to test.

**Step 2 — Draw the aggregate boundary around the minimum objects required to enforce the invariant.**

Start with one Entity (the root) and zero Value Objects. Add a Value Object or child Entity only when the invariant cannot be expressed without it. Vernon's rule is the test here: if you are adding an object because it is "related" or "convenient", stop. Neither relation nor convenience is an invariant.

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

The `Subscription` aggregate does not hold a `Tenant` object or a `Plan` object. It holds their identities. When the application service needs to enforce a cross-aggregate rule (e.g., "cannot subscribe to a Plan that has been archived"), it loads both aggregates independently, checks the rule in the application layer, and proceeds. That rule lives in neither aggregate. It is a coordination policy owned by the application service.

**Step 3 — Emit domain events at aggregate boundaries, consume them across context boundaries.**

When a mutation succeeds inside an aggregate, the aggregate records a domain event describing what happened. The event is not published right away. It is stored alongside the aggregate's state in the same transaction (the Transactional Outbox pattern; see `/principles/backend-events/transactional-outbox-idempotent-consumer`), and a relay process reads the outbox and publishes the events to downstream consumers asynchronously.

This is Vernon's fourth rule in mechanical form. The Subscription aggregate's `suspend()` method returns a `SubscriptionSuspended` event, and the application service persists the updated aggregate and the event atomically. From there the notification service, the analytics service, and the dashboard projection each receive the event independently and react in their own time. There is no distributed transaction and no coupling through shared writes.

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

Reference leakage (holding an object reference where an identity reference is required) is the most common aggregate-design mistake. It hides easily in a codebase that uses an ORM with lazy loading, because the ORM makes cross-aggregate object traversal look free. It is not. Each traversal loads the entire referenced aggregate graph, usually without the caller knowing it happened.

Enforce the boundary at the type level. In a domain model the only type allowed to cross an aggregate boundary is an identity wrapper (`TenantId`, `PlanId`, `SubscriptionId`), and domain types (`Tenant`, `Plan`, `Subscription`) never appear as fields on another aggregate. Code review enforces this, and lint rules enforce it where you can write them. In TypeScript, a branded type for each aggregate identity makes the distinction explicit:

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

Symptom: A `Tenant` aggregate contains a list of `Subscription` objects, each of which contains a list of `Invoice` objects, each of which contains a list of `LineItem` objects and a list of `PaymentAttempt` objects. Updating any tenant-related data locks the entire graph, and adding a single invoice line requires loading the whole tenant, all its subscriptions, and all its invoices.

The fix is to split it: `Tenant`, `Subscription`, `Invoice`, and `LineItem` are separate aggregate roots that reference each other by identity. An `Invoice` holds a `SubscriptionId` and a `TenantId`, not the `Subscription` or `Tenant` objects.

**Anti-pattern 2: Using direct object references across aggregate boundaries.**

Symptom: The `Subscription` class has a field of type `Tenant`, and ORM annotations load the `Tenant` (eagerly or lazily) whenever a `Subscription` is loaded. Now a bug in the `Tenant` aggregate fails every subscription write, and a `Tenant` schema migration breaks every subscription test.

Once objects cross the boundary, the boundary stops meaning anything. Replace `tenant: Tenant` with `tenantId: TenantId` and load the `Tenant` separately when you actually need it.

**Anti-pattern 3: Compensating transactions as a substitute for eventual consistency.**

Symptom: When a `Subscription` is created, the application service tries to create a `Tenant` record, a `BillingProfile` record, and a notification record inside a single distributed transaction. If the notification service is down, the entire subscription creation rolls back.

A distributed transaction ties the availability of every participant together. Instead, create the `Subscription` aggregate, emit a `SubscriptionCreated` event, and let the downstream services (Billing, Notification) react asynchronously through the outbox relay. If the notification service is temporarily unavailable, it processes the event once it recovers. The `Subscription` was created successfully, and notification delivery is a separate concern with its own retry semantics.

**Anti-pattern 4: Encoding process state inside a single aggregate.**

Symptom: A `Subscription` aggregate accumulates fields and status values that track the state of a multi-step business process, such as `isOnboardingComplete`, `isBillingProfileCreated`, and `isWelcomeEmailSent`. The aggregate is quietly turning into a process manager.

A multi-step process that coordinates actions across several aggregates or services is a Saga (or Process Manager): a separate object with its own identity and its own state machine, reacting to domain events from the participating aggregates and issuing commands in response. The `Subscription` aggregate should hold only the invariants that belong to the subscription concept, and the onboarding process state belongs in an `OnboardingProcess` aggregate or process manager.

## See also

The Transactional Outbox and Idempotent Consumer patterns (see `/principles/backend-events/transactional-outbox-idempotent-consumer`) are the concrete mechanisms behind Vernon's fourth rule. Eventual consistency across aggregate and context boundaries is only safe when events are delivered reliably (outbox) and consumers can absorb duplicate delivery (idempotency).

The DDD Reference (Evans, CC-BY 4.0, https://www.domainlanguage.com/ddd/reference/) covers Aggregates, Entities, Value Objects, Domain Events, Repositories, and Factories as one set. The tactical patterns are built to work together, and reading each pattern in isolation misses the structural role it plays in the whole.
