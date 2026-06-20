---
title: "Conway's Law and the Inverse Conway Maneuver"
category: ddd
summary: "Architecture mirrors org communication structure; to get the architecture you want, reshape the teams to match it first."
principle: "Architecture mirrors org communication structure (Conway 1968); to get the architecture you want, restructure teams to match it (Inverse Conway), aligning stream-aligned teams to business flows with platform and enabling teams as support."
severity: context
tags: [ddd, conway, team-topologies, organizational-design, inverse-conway]
sources:
  - project: 'Conway 1968 / Team Topologies'
    date: 2026-05-27
    note: 'Conway verbatim; Inverse Conway; 4 team types, 3 interaction modes; align teams to streams'
  - project: 'a multi-product company (DDD case study)'
    date: 2026-05-27
    note: 'tech-aligned platforms explode cognitive load'
related:
  - ddd/bounded-contexts-not-crud-features
  - process/cite-sources-no-improvisation
order: 4
updated: 2026-06-11
---

## Why this matters

**When this earns its keep.** This is a multi-team concern. Conway's Law operates at any size, but deliberately *mapping teams to bounded contexts* via the Inverse Conway Maneuver only becomes a tool once you have several teams and contexts to align. On a single small team there is nothing to align: one team, one communication structure. Reach for this when the organization is large enough that team boundaries and context boundaries can drift apart. What stays constant regardless of size is feature-based structure and layer separation (see [folder-by-usage](/kb/functional-architecture/one-function-per-file-folder-by-usage)).

In 1968 Melvin Conway published the observation that has since become axiomatic in software architecture: "Any organization that designs a system (defined broadly) will produce a design whose structure is a copy of the organization's communication structure" (Conway, "How Do Committees Invent?", Datamation, April 1968, https://www.melconway.com/Home/Conways_Law.html). The claim describes what organizations inevitably produce, not what they ought to produce. The practical fallout, as Martin Fowler put it, is that you cannot architect your way out of an organizational structure: "If the architecture of the system and the architecture of the organization are at odds, the architecture of the organization wins" (Fowler, https://martinfowler.com/bliki/ConwaysLaw.html).

The Inverse Conway Maneuver turns that observation into a design tool. If you want a particular system architecture, first design the team structure that would naturally produce it. Fowler calls this "evolving your team structure to promote your desired architecture" (ibid.). There is no trick involved. Communication pathways determine where the integration seams land. Teams that talk constantly produce tightly integrated subsystems, and teams that interact only through formal interfaces end up with loosely coupled subsystems and stable contracts. So designing the team structure is already designing the architecture.

Domain-Driven Design and the Inverse Conway Maneuver line up cleanly. A bounded context should be owned by one team, and no context should be shared across teams without a formal interface (the Context Map patterns). Once both of those hold, Conway's Law produces the right architecture on its own, because the team boundaries enforce the communication structure that keeps the contexts separate.

A multi-product company (audited 2026-05-27) showed what happens when the org structure fights the architecture you want. The platform had:

- 12 commercial products
- 8 technical services
- 5 Jira projects, each named after a technology layer or platform (`admin-panel`, `dashboard-user`, `api-gateway`, `infrastructure`, `mobile`)
- 2 engineering teams

The Jira projects were technology-aligned, not domain-aligned or stream-aligned. Introducing a new subscription tier required tickets in `admin-panel` (to add CRUD screens), `api-gateway` (to add endpoints), `dashboard-user` (to surface the tier to customers), and often `infrastructure` (to provision new resources). Each Jira project was effectively a virtual team boundary, so any initiative that mattered to the business crossed several of them at once, demanding coordination across all five projects when only two real teams existed. What you got was a permanent queue of cross-platform initiatives, each blocked on the cross-platform initiative ahead of it. Skelton and Pais call this a fracture plane misalignment, and the queue is its cognitive-load symptom (Team Topologies, Skelton & Pais, 2019/2025, https://teamtopologies.com/key-concepts).

## How to apply

**Step 1 — Understand the four team types from Team Topologies.**

Skelton and Pais define four team types, each with a distinct purpose and a distinct relationship to cognitive load (Team Topologies, https://teamtopologies.com/key-concepts):

```
Team type               Purpose
──────────────────────  ────────────────────────────────────────────────────────────
Stream-aligned          Delivers value in a business flow end-to-end. Owns a
                        domain area (bounded context cluster) from input to output.
                        Has everything it needs to build, deploy, and operate its
                        stream with minimal external coordination.

Platform                Reduces cognitive load for stream-aligned teams by providing
                        self-service internal infrastructure (deployment pipelines,
                        observability, data stores, auth). Operates as a product.

Enabling                Short-lived; helps stream-aligned teams acquire capabilities
                        they do not yet have (a new framework, a new architectural
                        pattern). Exits when capability is transferred.

Complicated-Subsystem   Owns a genuinely complex technical or mathematical subsystem
                        (e.g., a physics engine, a real-time signal-processing pipeline)
                        that requires specialist knowledge beyond a stream-aligned team.
```

Stream-aligned is the default. Platform, Enabling, and Complicated-Subsystem teams exist to take cognitive load off the stream-aligned teams, not to hoard ownership of their own.

**Step 2 — Understand the three interaction modes.**

Each team-to-team relationship has a designated interaction mode:

```
Interaction mode   Description
─────────────────  ──────────────────────────────────────────────────────────────
Collaboration      Two teams work jointly on a problem, sharing code and decisions.
                   High bandwidth; appropriate for exploration and capability
                   building. Should be time-boxed — prolonged collaboration
                   creates coupling.

X-as-a-Service     One team consumes what another team provides via a stable API
                   or interface. Low coordination overhead. The correct steady-state
                   for stream-aligned to platform relationships.

Facilitating       An enabling team helps a stream-aligned team; the enabling team
                   does not own the outcome. Exits when the stream-aligned team is
                   self-sufficient.
```

The interaction mode between two teams is itself a design decision. A stream-aligned team stuck in permanent Collaboration mode with four other teams is not stream-aligned in practice. It has become a coordination hub, and its cognitive load shows it.

**Step 3 — Identify fracture planes.**

A fracture plane is a natural boundary you can split a system along without tearing through cohesive domain concepts. Skelton and Pais list several candidates: business domain, regulatory compliance, data change rate, user persona, geographic boundary, technology lifecycle. For most organizations the **business domain** is the one that pays off. Split the system along boundaries that domain experts already recognize, then align one stream-aligned team to each resulting area.

For the case study, the five technology-aligned Jira projects should be replaced by stream-aligned team ownership of the bounded context clusters identified in the domain analysis:

```
Current (technology-aligned)       Proposed (stream-aligned)
──────────────────────────────     ──────────────────────────────────────────────
admin-panel (Jira project)         Identity & Access stream
dashboard-user (Jira project)      Subscription & Billing stream
api-gateway (Jira project)         Anomaly Detection stream (Core — most engineers)
infrastructure (Jira project)      Platform team (CI/CD, observability, auth infra)
mobile (Jira project)              (absorbed into stream teams as read-side concern)
```

Each stream-aligned team owns its context's full vertical: domain model, API, database, tests, deployment. The initiative that used to span five Jira projects now lives entirely inside one team's scope.

**Step 4 — Apply the Inverse Conway Maneuver explicitly.**

Draw the target context map first (see `/kb/ddd/bounded-contexts-not-crud-features`). Then design the team structure that would produce it:

- Each bounded context or tightly related cluster of contexts maps to one stream-aligned team.
- Shared infrastructure concerns (CI/CD, observability, auth infrastructure) map to a platform team operating in X-as-a-Service mode.
- If a context (e.g., Anomaly Detection) has genuine algorithmic complexity beyond the stream team's capacity, a Complicated-Subsystem team can own the algorithmic core while the stream team owns the integration.

Announce the target team structure before you start the technical migration. The organizational change and the technical change have to move together. Do the technical restructuring first (splitting repositories without splitting teams) and you get the seams but none of the communication structure that keeps them in place.

**Step 5 — Manage cognitive load as a first-class constraint.**

Skelton and Pais treat cognitive load as the primary constraint on team effectiveness. A stream-aligned team that owns more than it can hold in working memory, more contexts and technologies and integration points than it can track, will ship lower-quality software no matter how strong its engineers are. The Team API concept (https://teamtopologies.com/key-concepts) writes down what a team owns and what it exposes, which makes that load visible and negotiable.

Under the two-team constraint from the case study, the move is sequencing. Consolidate the 27 CRUD features into the five to seven bounded contexts first, shrinking the surface area each team has to hold in mind, and only then try to split teams. Two teams can manage a smaller, well-bounded system. Adding teams to a larger, poorly bounded one does not help until you cut the boundary count down.

## Anti-patterns

**Anti-pattern 1: Technology-aligned teams producing technology-aligned architecture.**

Symptom: Teams are named after layers or platforms: `frontend-team`, `backend-team`, `infrastructure-team`, `mobile-team`. Every user-facing feature requires a ticket in each team. Priorities are negotiated across team boundaries for every sprint. Releases require synchronized deployments across multiple teams.

This is Conway's Law running with nobody at the wheel. The communication structure puts the integration seams at the technology boundaries instead of the domain boundaries, and what comes out is a distributed monolith: distributed deployment over tightly coupled domain logic.

**Anti-pattern 2: Treating the Inverse Conway Maneuver as a one-time reorg.**

Symptom: Leadership announces a team restructuring aligned to business domains. Three months later the Jira projects, the codebase folders, and the on-call rotation still mirror the old technology alignment. The new stream-aligned teams talk to each other as much as the old technology teams did, because the shared artefacts never moved.

The maneuver is not done until the communication structure has actually changed. That means moving ownership of the artefacts (repositories, runbooks, on-call rotations, domain glossaries) to the new team boundaries, not just renaming the Slack channels.

**Anti-pattern 3: Permanent collaboration mode between stream teams.**

Symptom: Two stream-aligned teams have been collaborating (co-designing, co-reviewing, co-deploying) for over a year. Neither can release without consulting the other. The collaboration gets explained away as "necessary because the domains are related."

Collaboration mode is high-bandwidth and good for discovery. But when two teams have to collaborate permanently just to ship, the boundary between their domains is drawn wrong, or there is a missing third team (Platform or Enabling) that should be absorbing the shared concern. The steady-state between stream-aligned teams is X-as-a-Service, where one team publishes a contract and the other consumes it without coordination overhead.

**Anti-pattern 4: Platform team that owns domain logic.**

Symptom: The platform team owns the authentication module but also owns the authorization rules for specific business operations ("only a TenantAdmin can create a Subscription"). Business rule changes require a ticket to the platform team.

Authorization rules for domain operations belong to the domain context that owns those operations, not to the infrastructure platform. The platform team provides the mechanism: JWT validation, session management, role tokens. The stream-aligned team provides the policy, deciding what roles may do what in its own domain. Mix the two and the platform team turns into a bottleneck for every domain change.

## See also

The Team Topologies key concepts page (https://teamtopologies.com/key-concepts) summarizes the four team types, three interaction modes, Team API, cognitive load, and fracture planes in a form suitable for workshop reading.

Conway's original paper (https://www.melconway.com/Home/Conways_Law.html) is short and worth reading in full. Plenty of secondary accounts simplify or misquote the claim, whereas the paper itself is unambiguous.

The DDD Crew Context Mapping reference (https://github.com/ddd-crew/context-mapping) provides the vocabulary for formalizing the inter-team contracts that the Inverse Conway Maneuver depends on: once team boundaries align with context boundaries, the Context Map patterns define what each team-to-team interface looks like.
