---
title: 'A CRUD feature is not a bounded context'
category: ddd
summary: 'Entity clusters and CRUD screens are necessary starting points but they are not bounded contexts until a formalized Ubiquitous Language and explicit inter-context contracts exist.'
principle: 'Entity clusters and CRUD features are not bounded contexts until they have a formalized Ubiquitous Language and explicit contracts between them; consolidate many CRUD features into a few bounded contexts and treat client/read apps as projections.'
severity: context
tags: [ddd, bounded-context, strategic-design, ubiquitous-language]
sources:
  - project: 'a multi-product company (DDD case study)'
    date: 2026-05-27
    note: '27 CRUD features vs 4 macro-areas; neither follows BC boundaries; consolidate to 5-7 BCs, client as projection'
related:
  - ddd/ubiquitous-language-first
  - ddd/conway-and-team-topologies
  - ddd/strategic-ddd-core-supporting-generic
order: 1
updated: 2026-06-11
---

## Why this matters

**When this earns its keep.** Domain-Driven Design is a response to scale and complexity, not a default posture. Drawing bounded contexts and context maps pays off on a large system with genuinely complex domain logic and more than one team. On a small or simple project the same apparatus is overhead: boundaries and contracts that cost more than they return, where a plain CRUD-per-entity split would have shipped the feature. Organizing the codebase by feature and separating its layers, on the other hand, is not size-dependent. That is house style at every scale (see [folder-by-usage](/principles/functional-architecture/one-function-per-file-folder-by-usage)). Everything below assumes a domain large enough to justify the apparatus.

Eric Evans defines a Bounded Context as "a defined part of software where particular terms, definitions and rules apply in a consistent way" (Evans, DDD Europe 2019). The boundary is not drawn around a database table or an admin screen. It is drawn around a coherent vocabulary and a set of business rules that only make sense as a unit. Martin Fowler reinforces this: "Total unification of the domain model for a large system will not be feasible or cost-effective" (Fowler, https://martinfowler.com/bliki/BoundedContext.html). So breaking a system into arbitrarily small pieces, one feature per entity, creates as many problems as the big-ball-of-mud at the other extreme.

A multi-product company (audited 2026-05-27) made that opposite mistake. Its admin panel contained 27 CRUD-style features, organized roughly as one entity equals one feature: Users, Roles, Products, Subscriptions, Invoices, Webhooks, and so on. The dashboard-user-facing application then aggregated those same concepts into four macro-areas. Neither decomposition followed bounded-context boundaries. There was no formalized Ubiquitous Language per area, no published contract between areas, and no explicit ownership. What followed was a triple mismatch: 12 commercial products did not correspond to 8 technical services, which did not correspond to 5 Jira platforms, which were operated by 2 teams. Every initiative that crossed more than one CRUD feature required implicit coordination across all three mismatched layers at once.

Vaughn Vernon names the underlying error: "Subdomains live in the problem space, bounded contexts in the solution space" (Vernon, Implementing DDD, 2013, ISBN 978-0321834577; also Evans, DDD Europe 2019, https://www.infoq.com/news/2019/06/bounded-context-eric-evans/). A CRUD feature is a solution-space artifact, a screen or a repository or a table. Until you have answered "what language does this area speak, and what is the contract it exposes to others?", you have a candidate context rather than a context.

The cost of mistaking CRUD features for bounded contexts is concrete:

- Shared models silently absorb meaning from multiple areas. The concept `User` in an Access Management context means "a principal with roles and permissions". In a Billing context, the same word means "a payer with a payment method and invoice history". When both meanings live in one model without a boundary, every change to one meaning degrades the other.
- Cross-feature changes require touching many files at once, because no area owns its own language. Developers work around this with boolean flags, discriminated status columns, and comment-driven conventions, each of which signals that a boundary is missing.
- Read applications (dashboards, mobile apps) import the write model directly. When the read shape changes for business reasons, the write model changes too, coupling unrelated concerns.

## How to apply

**Step 1 — Audit candidate clusters, not individual entities.**

List every concept your system manages. Group them by the question: "would a domain expert use a different word for this concept when talking about [area A] versus [area B]?" Each cluster where the answer is "yes" marks a candidate bounded context boundary. The DDD Crew Bounded Context Canvas (https://github.com/ddd-crew/bounded-context-canvas) provides a structured worksheet: name, purpose, strategic classification, inbound/outbound dependencies, and the Ubiquitous Language glossary.

For the case study, the 27 CRUD features collapsed into roughly five to seven candidate bounded contexts under this lens:

```
Candidate BC           Entities included (from the 27-feature list)
─────────────────────  ──────────────────────────────────────────────
Identity & Access      User, Role, Permission, Session, ApiKey
Product Catalogue      Product, ProductVariant, Feature, FeatureFlag
Subscription & Billing Subscription, Plan, Invoice, PaymentMethod, Coupon
Tenant Onboarding      Tenant, TenantSettings, OnboardingStep, Contract
Anomaly Detection      AnomalyRule, AnomalyEvent, Alert, Threshold, Detector
```

Five contexts instead of 27 features. Each cluster carries a name a domain expert would use, not one a database administrator would reach for.

**Step 2 — Formalize the Ubiquitous Language before writing code.**

For each candidate context, produce a glossary: term, definition, what it is NOT (homonym disambiguation), and example usage in a sentence a domain expert would say. Until this glossary exists and has been reviewed by at least one domain expert, the boundary is provisional. See `/principles/ddd/ubiquitous-language-first` for the full process.

**Step 3 — Define inter-context contracts explicitly.**

Every dependency between two contexts must cross a published interface. The DDD Context Mapping patterns (Evans, DDD Reference, https://www.domainlanguage.com/ddd/reference/) give the vocabulary: Customer/Supplier, Conformist, Anti-Corruption Layer (ACL), Open Host Service (OHS), Published Language. At minimum, document: which context is upstream, which is downstream, what translation (if any) occurs at the boundary, and who owns breaking changes.

In the case study, the dashboard-user application acted as a direct consumer of multiple upstream write models with no translation layer. Treat the dashboard instead as a read model: a projection (or Backend for Frontend, BFF) that subscribes to domain events from the upstream contexts and materializes a read-optimized shape. The dashboard has no write responsibilities. It issues commands back to the owning context via an OHS.

```
Write side                    Read side
─────────────────────────     ──────────────────────────────
Subscription BC ──events──►  Dashboard BFF (projection)
Anomaly Detection BC ─────►  (aggregates events, builds
Tenant Onboarding BC ──────►   read model for UI queries)
```

This separation is not cosmetic. When the read shape needs to change for a new UI feature, you rebuild the projection and the write model is untouched. When a write-side rule changes, you emit a new event version and the projection adapts via its own ACL. Neither side forces a change on the other.

**Step 4 — Apply the Inverse Conway Maneuver.**

After the logical context map is drawn, align team ownership to it. One team owns one or more bounded contexts; no context is shared across teams without a formal interface. See `/principles/ddd/conway-and-team-topologies` for the full treatment.

## Anti-patterns

**Anti-pattern 1: One repository class per entity = one bounded context.**

Symptom: You have 27 services/repositories and 27 corresponding "modules" or "features", each named after a database table. No module has a glossary. Changing the meaning of `status` on the `Subscription` table requires searching every other module for references.

The entity is not the context. An Aggregate Root (Evans, DDD Reference) is the consistency boundary for a cluster of objects. It sits inside a bounded context, smaller than one, never synonymous with it.

**Anti-pattern 2: The dashboard imports the domain model directly.**

Symptom: The user-facing app imports types, DTOs, or even repositories from the write-side service. A change to the write-side model breaks the UI compilation.

This collapses two separate concerns, command processing and query serving, into a single model. Read models should be purpose-built projections, as described above.

**Anti-pattern 3: Shared kernel by default.**

Symptom: A `common` or `shared` package contains domain types that are imported by every other module. The package grows without ownership and becomes a hidden coupling point. Any change to a shared type requires a cross-system audit.

The Shared Kernel pattern (Evans, DDD Reference) is legitimate but narrow: it is "a subset of the domain model that two teams agree to share" with explicit co-ownership and a formal change process. It is not a dumping ground for anything that happens to be used in two places.

**Anti-pattern 4: Naming contexts after infrastructure layers.**

Symptom: Bounded contexts named `api`, `database`, `frontend`, `backend`. These are deployment concerns, not domain concerns. A context named `api` has no Ubiquitous Language because "api" does not correspond to any business concept.

Context names must be drawn from the domain vocabulary: Billing, Fulfillment, Identity, Catalogue, Anomaly Detection.

## See also

The DDD Crew Context Mapping reference (https://github.com/ddd-crew/context-mapping) provides a printable card set for all nine Context Map patterns. Use it in workshop settings to make inter-context dependencies visible before they are coded.

EventStorming (Alberto Brandolini; DDD Crew glossary https://github.com/ddd-crew/eventstorming-glossary-cheat-sheet) is the recommended discovery technique for identifying context boundaries from domain events rather than from existing data models. It surfaces the language boundaries that entity-centric analysis misses.
