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

**When this earns its keep.** Classifying subdomains is an investment-allocation tool. It pays back only when you have enough domain to allocate and enough scarcity to make allocation a real decision. On a large system with complex logic and competing priorities, the Core/Supporting/Generic split tells you where to put your best people. On a small or simple project the whole domain fits in your head and the exercise is just ceremony. Apply it once the domain is big enough that "where do we *not* invest" is a question someone actually has to answer. Whatever the size, structure by feature and separate layers (see [folder-by-usage](/principles/functional-architecture/one-function-per-file-folder-by-usage)).

Evans introduced the subdomain classification as the primary tool for engineering investment decisions (Evans, Domain-Driven Design, 2003, Addison-Wesley, ISBN 978-0321125217; DDD Reference, https://www.domainlanguage.com/ddd/reference/). The classification has three tiers:

- **Core Domain**: the part of the domain where your organization has a unique competitive advantage. No off-the-shelf product solves this problem in a way that differentiates you. Your most skilled engineers belong here, and the model deserves your most careful design.
- **Supporting Subdomain**: necessary for the Core to function but not differentiating on its own. You often have to build it, but it does not need to meet the quality bar you hold the Core to.
- **Generic Subdomain**: solved problems the industry has already handled well. Authentication, email delivery, payment processing, observability infrastructure. Buy it, adopt open source, or use a SaaS provider. Building these in-house is waste.

The classification is not permanent. A concept that is Generic today may become Core if the business decides to differentiate on it, and a Core concept may get commoditized as the market catches up. The DDD Crew Core Domain Charts (https://github.com/ddd-crew/core-domain-charts) give a two-axis framework for this decision: **Business Differentiation** (how much competitive advantage does this area provide?) on the vertical axis against **Complexity** (how hard is it to build or operate?) on the horizontal. The four quadrants produce four investment strategies:

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

This matters because engineering capacity is always scarce relative to the scope of a software system. Without an explicit classification, teams spread effort proportionally to surface area. A Generic authentication module gets the same careful design attention as a Core anomaly-detection engine because both have the same number of files, the same sprint weight, and the same architectural review overhead. So the Core ends up under-invested while the Generic is over-engineered.

A multi-product company (audited 2026-05-27) had a small engineering team responsible for many products. Its 27 CRUD features consumed roughly uniform development effort. Several of them (authentication, role management, invoice generation, email notification) are textbook Generic subdomains, all solved by mature SaaS providers such as Auth0, Stripe, and Sendgrid. Building and maintaining custom versions of these burned capacity that could have gone to the features that actually set the company apart commercially. Anomaly Detection, the Core, produced alerts from telemetry data and was the primary source of competitive value, yet it carried the same sprint weight as a CRUD role-management screen.

## How to apply

**Step 1 — List subdomains, not features.**

A subdomain is a coherent area of domain knowledge, not a module or a screen. Produce the list with business stakeholders rather than deriving it from the codebase. Ask: "If you had to explain to a new employee what this company does, what are the five to ten areas of expertise that define the business?" Each area is a candidate subdomain.

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

Score each subdomain on both axes. A three-point scale (Low / Medium / High) keeps the workshop moving. Place each one on the Core Domain Chart. The output is a visual that makes investment priorities legible to non-technical stakeholders.

The DDD Crew Core Domain Charts template (https://github.com/ddd-crew/core-domain-charts) is the canonical artifact for this exercise, designed to be produced collaboratively in one to two hours.

**Step 3 — Match investment strategy to classification.**

The classification drives four concrete decisions:

1. **Core — build with your best people and highest design standards.** Apply the full tactical DDD toolkit: rich aggregates, domain events, careful invariant design. Favor the model's expressiveness over implementation speed. Evans: "The Core Domain is the part that makes your system worth building and worth using. It is the place where all the careful Domain-Driven Design work should be concentrated" (DDD, 2003).

2. **Supporting — build pragmatically, possibly with a transaction-script style.** The model does not need to be as rich as the Core. A well-structured CRUD service with clear inputs and outputs will do. Resist the urge to apply the same architectural patterns you use on the Core, because the overhead is not justified here.

3. **Generic — buy, adopt, or use SaaS.** Integration cost (maintaining an adapter, managing API keys, handling SLA boundaries) is almost always lower than the ongoing cost of building and operating your own. Document the integration boundary as an Anti-Corruption Layer so the external provider's model does not pollute your downstream domain model.

4. **Reassess periodically.** Reclassify as the business strategy evolves. A subdomain that was Generic because an off-the-shelf product existed may become Supporting or Core if the product no longer fits or if the business decides to differentiate on it. Record the date and rationale for every reclassification.

**Step 4 — Protect the Core from generic concerns.**

A common failure mode is Core domain code that accumulates infrastructure concerns: logging calls, retry logic, ORM annotations, HTTP client calls. That coupling makes the Core harder to test and harder to evolve. The Core should hold only domain logic expressed in the Ubiquitous Language, with infrastructure pushed to the edges via ports (interfaces) and adapters (implementations). The Hexagonal Architecture (Ports and Adapters) pattern enforces this separation structurally.

## Anti-patterns

**Anti-pattern 1: Treating every subdomain as Core.**

Symptom: Every module has rich aggregates, domain events, an ACL, a published language, and a dedicated team. The authentication module has the same architectural sophistication as the anomaly detection engine. Velocity collapses because every change drags the full ceremony along, regardless of business impact.

Sophistication costs something. That cost is justified in the Core and wasted in Generic and Supporting subdomains.

**Anti-pattern 2: Building Generic subdomains from scratch.**

Symptom: The team spends three sprints on a role-based access control system because "our requirements are unique." Six months later it has subtle security flaws, no audit tooling, and a dedicated maintainer keeping it alive.

Authentication, authorization, payment processing, email delivery, and observability infrastructure are Generic by any reasonable classification. Unless you are a security company, an IAM vendor, or a payments processor, building these in-house consumes Core capacity without producing any differentiation.

**Anti-pattern 3: Allowing the Generic to bleed into the Core model.**

Symptom: The Core Aggregate contains a `stripeCustomerId` field. Domain events carry `sendgridMessageId`. The Core model now encodes external provider identifiers, coupling the most valuable part of the system to vendor choices.

The Anti-Corruption Layer pattern (Evans, DDD Reference) exists precisely to prevent this. The Core speaks its own language, the adapter translates at the boundary, and the Core never imports types from the provider SDK.

**Anti-pattern 4: Classifying by technical complexity alone.**

Symptom: A team classifies its most technically complex module as Core because it is "hard to build." Technical complexity is one axis, not the only one. A highly complex but undifferentiated piece of infrastructure (a custom message broker, a bespoke ORM) is Generic regardless of its technical depth. The axis that decides is business differentiation.

## See also

The DDD Crew Core Domain Charts repository (https://github.com/ddd-crew/core-domain-charts) includes printable templates and worked examples for the Business Differentiation × Complexity workshop.

The DDD Reference (Evans, CC-BY 4.0, https://www.domainlanguage.com/ddd/reference/) covers Core Domain, Subdomains, and Generic Subdomains in the Strategic Design section, and it is the authoritative short-form reference for the classification.
