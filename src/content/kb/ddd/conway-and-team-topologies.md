---
title: "Conway's Law and the Inverse Conway Maneuver"
category: ddd
summary: "Architecture mirrors org communication structure; to get the architecture you want, reshape the teams to match it first."
principle: "Architecture mirrors org communication structure (Conway 1968); to get the architecture you want, restructure teams to match it (Inverse Conway), aligning stream-aligned teams to business flows with platform and enabling teams as support."
severity: strong
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
updated: 2026-06-10
---

## Why this matters

In 1968 Melvin Conway published the observation that has become axiomatic in software architecture: "Any organization that designs a system (defined broadly) will produce a design whose structure is a copy of the organization's communication structure" (Conway, "How Do Committees Invent?", Datamation, April 1968, https://www.melconway.com/Home/Conways_Law.html). The claim is empirical, not prescriptive. Conway was describing what organizations inevitably produce, not what they should produce. The practical implication, noted by Martin Fowler, is that you cannot architect your way out of an organizational structure: "If the architecture of the system and the architecture of the organization are at odds, the architecture of the organization wins" (Fowler, https://martinfowler.com/bliki/ConwaysLaw.html).

The Inverse Conway Maneuver inverts this as a design tool: if you want a particular system architecture, first design the team structure that would naturally produce it. Fowler describes this as "evolving your team structure to promote your desired architecture" (ibid.). The maneuver is not a trick. It is an acknowledgment that communication pathways determine integration seams. Teams that talk frequently produce tightly integrated subsystems. Teams that interact only through formal interfaces produce loosely coupled subsystems with stable contracts. Designing the team structure is designing the architecture.

Domain-Driven Design and the Inverse Conway Maneuver align directly: a bounded context should be owned by one team, and no context should be shared across teams without a formal interface (the Context Map patterns). When these two principles hold, Conway's Law produces the correct architecture automatically — because the team boundaries enforce the communication structure that produces the desired context separation.

A multi-product company (audited 2026-05-27) illustrated what happens when the organization structure is misaligned with the desired architecture. The platform had:

- 12 commercial products
- 8 technical services
- 5 Jira projects, each named after a technology layer or platform (`admin-panel`, `dashboard-user`, `api-gateway`, `infrastructure`, `mobile`)
- 2 engineering teams

The Jira projects were technology-aligned, not domain-aligned or stream-aligned. A cross-cutting initiative — say, introducing a new subscription tier — required tickets in `admin-panel` (to add CRUD screens), `api-gateway` (to add endpoints), `dashboard-user` (to surface the tier to customers), and possibly `infrastructure` (to provision new resources). Each Jira project was effectively a virtual team boundary. Every initiative that was meaningful to the business crossed multiple virtual boundaries simultaneously, requiring coordination across all five projects with only two actual teams. The result was a permanent queue of cross-platform initiatives, each blocked on prior cross-platform initiatives. This is the cognitive load symptom that Skelton and Pais characterize as a fracture plane misalignment (Team Topologies, Skelton & Pais, 2019/2025, https://teamtopologies.com/key-concepts).

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

The default team type is stream-aligned. Platform, Enabling, and Complicated-Subsystem teams exist to reduce cognitive load on stream-aligned teams, not to accumulate ownership.

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

The current interaction mode between two teams is a design decision. A stream-aligned team that operates in Collaboration mode with four other teams permanently is not stream-aligned in practice — it is a coordination hub, and its cognitive load reflects that.

**Step 3 — Identify fracture planes.**

A fracture plane is a natural boundary along which a system can be split without tearing through cohesive domain concepts. Skelton and Pais identify several candidate fracture planes: business domain, regulatory compliance, data change rate, user persona, geographic boundary, technology lifecycle. The most valuable fracture plane for most organizations is the **business domain**: split the system along domain boundaries that domain experts recognize, and align one stream-aligned team to each resulting area.

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

Each stream-aligned team owns its context's full vertical: domain model, API, database, tests, deployment. The cross-cutting initiative that previously required five Jira projects now lives entirely within one stream-aligned team's scope.

**Step 4 — Apply the Inverse Conway Maneuver explicitly.**

Draw the target context map first (see `/kb/ddd/bounded-contexts-not-crud-features`). Then design the team structure that would produce it:

- Each bounded context or tightly related cluster of contexts maps to one stream-aligned team.
- Shared infrastructure concerns (CI/CD, observability, auth infrastructure) map to a platform team operating in X-as-a-Service mode.
- If a context (e.g., Anomaly Detection) has genuine algorithmic complexity beyond the stream team's capacity, a Complicated-Subsystem team can own the algorithmic core while the stream team owns the integration.

Announce the target team structure before beginning the technical migration. The organizational change and the technical change must proceed together; doing the technical restructuring first (splitting repositories without splitting teams) produces the technical seams but not the communication structure that maintains them.

**Step 5 — Manage cognitive load as a first-class constraint.**

Skelton and Pais treat cognitive load as the primary constraint on team effectiveness. A stream-aligned team that owns more than it can hold in working memory — more contexts, more technologies, more integration points — will produce lower-quality software regardless of engineering skill. The Team API concept (https://teamtopologies.com/key-concepts) formalizes what a team owns and what it exposes, making cognitive load visible and negotiable.

For a two-team constraint as in the case study, the practical application is sequencing: consolidate the 27 CRUD features into the five to seven bounded contexts first (reducing the surface area each team must hold in mind), before attempting to split teams. A smaller, well-bounded system is manageable by two teams. A larger, poorly bounded system cannot be saved by adding teams without first reducing the boundary count.

## Anti-patterns

**Anti-pattern 1: Technology-aligned teams producing technology-aligned architecture.**

Symptom: Teams are named after layers or platforms: `frontend-team`, `backend-team`, `infrastructure-team`, `mobile-team`. Every user-facing feature requires a ticket in each team. Priorities are negotiated across team boundaries for every sprint. Releases require synchronized deployments across multiple teams.

This is Conway's Law operating without design intent. The communication structure produces integration seams at the technology boundaries, not the domain boundaries. The resulting architecture is a distributed monolith: distributed deployment with tightly coupled domain logic.

**Anti-pattern 2: Treating the Inverse Conway Maneuver as a one-time reorg.**

Symptom: Leadership announces a team restructuring aligned to business domains. Three months later, the Jira project structure, the codebase folder structure, and the on-call rotation still reflect the old technology alignment. The new stream-aligned teams are communicating as heavily as the old technology teams because the shared artefacts have not moved.

The Inverse Conway Maneuver is not complete until the communication structure has actually changed. This means moving ownership of artefacts (repositories, runbooks, on-call rotations, domain glossaries) to the new team boundaries, not just renaming the Slack channels.

**Anti-pattern 3: Permanent collaboration mode between stream teams.**

Symptom: Two stream-aligned teams have been collaborating (co-designing, co-reviewing, co-deploying) for over a year. Neither team can release without consulting the other. The collaboration is described as "necessary because the domains are related."

Collaboration mode is high-bandwidth and appropriate for discovery. When two teams need to collaborate permanently to deliver, the boundary between their domains is drawn incorrectly, or there is a missing third team (Platform or Enabling) that should be absorbing the shared concern. The steady-state between stream-aligned teams is X-as-a-Service: one team publishes a contract; the other consumes it without coordination overhead.

**Anti-pattern 4: Platform team that owns domain logic.**

Symptom: The platform team owns the authentication module but also owns the authorization rules for specific business operations ("only a TenantAdmin can create a Subscription"). Business rule changes require a ticket to the platform team.

Authorization rules for domain operations belong to the domain context that owns those operations, not to the infrastructure platform. The platform team provides the mechanism (JWT validation, session management, role tokens). The stream-aligned team provides the policy (what roles are allowed to perform what actions in its domain). Mixing these produces a platform team that is a bottleneck for every domain change.

## See also

The Team Topologies key concepts page (https://teamtopologies.com/key-concepts) summarizes the four team types, three interaction modes, Team API, cognitive load, and fracture planes in a form suitable for workshop reading.

Conway's original paper (https://www.melconway.com/Home/Conways_Law.html) is short and worth reading in full. Many secondary accounts simplify or misquote the original claim; the paper itself is unambiguous.

The DDD Crew Context Mapping reference (https://github.com/ddd-crew/context-mapping) provides the vocabulary for formalizing the inter-team contracts that the Inverse Conway Maneuver depends on: once team boundaries align with context boundaries, the Context Map patterns define what each team-to-team interface looks like.
