---
title: 'Invest where you differentiate: Core, Supporting, Generic'
category: ddd
summary: 'Not every part of your domain deserves custom engineering; classify subdomains as Core, Supporting, or Generic and concentrate scarce effort on the Core.'
principle: 'Classify subdomains as Core / Supporting / Generic and concentrate scarce engineering on the Core; buy or adopt Generic.'
severity: context
tags: [ddd, strategic-design, core-domain, subdomain, investment]
sources:
  - project: 'Evans / DDD Crew Core Domain Charts'
    date: 2026-05-27
    note: 'Core/Supporting/Generic; differentiation×complexity; concentrate on Core'
related:
  - ddd/bounded-contexts-not-crud-features
  - ddd/conway-and-team-topologies
order: 3
updated: 2026-06-11
---

## Why this matters

**When this earns its keep.** Classifying subdomains is an investment-allocation tool, and it only pays back when there is enough domain — and enough engineering scarcity — to allocate. On a large system with complex logic and competing priorities, the Core/Supporting/Generic split tells you where to concentrate your best people; on a small or simple project the whole domain is small enough that the exercise is ceremony. Apply it when the domain is big enough that "where do we *not* invest" is a real question. Independently of size, structure by feature and separate layers (see [folder-by-usage](/kb/functional-architecture/one-function-per-file-folder-by-usage)).

Evans introduced the subdomain classification as the primary tool for engineering investment decisions (Evans, Domain-Driven Design, 2003, Addison-Wesley, ISBN 978-0321125217; DDD Reference, https://www.domainlanguage.com/ddd/reference/). The classification has three tiers:

- **Core Domain**: the part of the domain where your organization has a unique competitive advantage. No off-the-shelf product solves this problem in a way that differentiates you. This is where the most skilled engineers must work and where the model must be most carefully designed.
- **Supporting Subdomain**: necessary for the Core to function but not itself differentiating. Custom software is often required, but it does not need to be built to the same quality standard as the Core.
- **Generic Subdomain**: solved problems that the industry has already addressed well. Authentication, email delivery, payment processing, observability infrastructure. Buy, adopt open source, or use a SaaS provider. Building these in-house is waste.

The classification is not permanent. A concept that is Generic today may become Core if the business decides to differentiate on it; conversely, a Core concept may become commoditized as the market catches up. The DDD Crew Core Domain Charts (https://github.com/ddd-crew/core-domain-charts) give a two-axis framework for this decision: **Business Differentiation** (how much competitive advantage does this area provide?) on the vertical axis against **Complexity** (how hard is it to build or operate?) on the horizontal. The four quadrants produce four investment strategies:

```
                    High Differentiation
                           |
          Invest heavily   |   Invest heavily
          (complex Core)   |   (simple Core —
                           |    protect this)
   Low ────────────────────┼──────────────── High
 Complexity                |                Complexity
          Buy or adopt     |   Partner or
          (Generic)        |   adopt carefully
                           |   (complex Generic)
                    Low Differentiation
```

This matters because engineering capacity is always scarce relative to the scope of a software system. Without an explicit classification, teams distribute effort proportionally to surface area: a Generic authentication module gets the same careful design attention as a Core anomaly-detection engine because both have the same number of files, the same sprint weight, and the same architectural review overhead. The result is that the Core is under-invested and the Generic is over-engineered.

A multi-product company (audited 2026-05-27) had a small engineering team responsible for many products. The 27 CRUD features consumed roughly uniform development effort. Among those features, authentication, role management, invoice generation, and email notification are textbook Generic subdomains — all are solved by mature SaaS providers (Auth0, Stripe, Sendgrid, and equivalents). Building and maintaining custom implementations of these consumed capacity that could have been directed at the features that actually differentiated the company commercially. The Core — Anomaly Detection, which produced alerts from telemetry data — had the same sprint weight as a CRUD role-management screen despite being the primary source of competitive value.

## How to apply

**Step 1 — List subdomains, not features.**

A subdomain is a coherent area of domain knowledge, not a module or a screen. The list should be produced in collaboration with business stakeholders, not derived from the codebase. Ask: "If you had to explain to a new employee what this company does, what are the five to ten areas of expertise that define the business?" Each area is a candidate subdomain.

For the case study, a first-pass list might look like:

```
Subdomain              Candidate classification   Reasoning
─────────────────────  ─────────────────────────  ────────────────────────────────────────
Anomaly Detection      Core                       Proprietary rule engine; product USP
Tenant Onboarding      Supporting                 Necessary; not differentiating
Subscription & Billing Supporting / Generic       Generic billing → Stripe; custom plans rules → Supporting
Identity & Access      Generic                    Auth0 or equivalent; no differentiation
Product Catalogue      Supporting                 Internal admin; no external competition
Notification Dispatch  Generic                    Sendgrid or equivalent
Reporting & Analytics  Supporting → Core          Could become Core if analytics is the USP
```

**Step 2 — Apply the Business Differentiation × Complexity axes.**

For each subdomain, score it on both axes. Use a simple three-point scale (Low / Medium / High) to keep the workshop moving. Place each subdomain on the Core Domain Chart. The output of this step is a visual that makes investment priorities immediately legible to non-technical stakeholders.

The DDD Crew Core Domain Charts template (https://github.com/ddd-crew/core-domain-charts) is the canonical artifact for this exercise. It is designed to be produced collaboratively in one to two hours.

**Step 3 — Match investment strategy to classification.**

The classification drives four concrete decisions:

1. **Core — build with your best people and highest design standards.** Apply the full tactical DDD toolkit: rich aggregates, domain events, careful invariant design. Prioritize the model's expressiveness over implementation speed. Evans: "The Core Domain is the part that makes your system worth building and worth using. It is the place where all the careful Domain-Driven Design work should be concentrated" (DDD, 2003).

2. **Supporting — build pragmatically, possibly with a transaction-script style.** The model does not need to be as rich as the Core. A well-structured CRUD service with clear inputs and outputs is sufficient. Resist the temptation to apply the same architectural patterns as the Core; the overhead is not justified.

3. **Generic — buy, adopt, or use SaaS.** Integration cost (maintaining an adapter, managing API keys, handling SLA boundaries) is almost always lower than the ongoing cost of building and operating a custom implementation. Document the integration boundary as an Anti-Corruption Layer so the downstream domain model is not polluted by the external provider's model.

4. **Reassess periodically.** As the business strategy evolves, reclassify. A subdomain that was Generic because an off-the-shelf product existed may become Supporting or Core if the product no longer fits or if the business decides to differentiate on it. Record the date and rationale for every reclassification.

**Step 4 — Protect the Core from generic concerns.**

A common failure mode is that Core domain code accumulates infrastructure concerns: logging calls, retry logic, ORM annotations, HTTP client calls. This coupling makes the Core harder to test, harder to evolve, and harder to reason about. The Core should contain only domain logic expressed in the Ubiquitous Language. Infrastructure is pushed to the edges via ports (interfaces) and adapters (implementations). The Hexagonal Architecture (Ports and Adapters) pattern is a structural enforcement of this separation.

## Anti-patterns

**Anti-pattern 1: Treating every subdomain as Core.**

Symptom: Every module has rich aggregates, domain events, an ACL, a published language, and a dedicated team. The authentication module has the same architectural sophistication as the anomaly detection engine. Engineering velocity collapses because every change requires the full ceremony regardless of business impact.

Sophistication has a cost. That cost is justified in the Core. It is waste in Generic and Supporting subdomains.

**Anti-pattern 2: Building Generic subdomains from scratch.**

Symptom: The team spends three sprints implementing a role-based access control system because "our requirements are unique." Six months later the system has subtle security flaws, no audit tooling, and requires a dedicated maintainer.

Authentication, authorization, payment processing, email delivery, and observability infrastructure are Generic by any reasonable classification. Unless the organization is a security company, an IAM system, or a payments processor, building these in-house consumes Core capacity without producing differentiation.

**Anti-pattern 3: Allowing the Generic to bleed into the Core model.**

Symptom: The Core Aggregate contains a `stripeCustomerId` field. Domain events carry `sendgridMessageId`. The Core model now encodes knowledge of external provider identifiers, coupling the most valuable part of the system to vendor choices.

The Anti-Corruption Layer pattern (Evans, DDD Reference) exists precisely to prevent this. The Core speaks its own language. The adapter translates at the boundary. The Core never imports types from the provider SDK.

**Anti-pattern 4: Classifying by technical complexity alone.**

Symptom: A team classifies their most technically complex module as Core because it is "hard to build." Technical complexity is one axis, not the only one. A highly complex but undifferentiated piece of infrastructure (a custom message broker, a bespoke ORM) is Generic regardless of its technical depth. The primary axis is business differentiation.

## See also

The DDD Crew Core Domain Charts repository (https://github.com/ddd-crew/core-domain-charts) includes printable templates and worked examples for the Business Differentiation × Complexity workshop.

The DDD Reference (Evans, CC-BY 4.0, https://www.domainlanguage.com/ddd/reference/) covers Core Domain, Subdomains, and Generic Subdomains in the Strategic Design section. It is the authoritative short-form reference for the classification.
