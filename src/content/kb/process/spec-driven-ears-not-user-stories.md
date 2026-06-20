---
title: 'Spec-driven development — EARS criteria, not user stories'
category: process
summary: 'Write the spec first; requirements are a short human README plus capability-grouped EARS criteria, not user-story prose.'
principle: 'Write the spec first (requirements/design/tasks); requirements are a short human README plus capability-grouped EARS criteria — not "As a developer, I want…" user stories for a solo project.'
severity: strong
tags: [process, spec-driven, requirements, EARS, documentation]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'requirements/design/tasks; EARS; spec is source of truth'
  - project: 'an event-sourcing service'
    date: 2026-05-14
    note: 'no user stories for solo project; EARS + human README; 4-8 items/group'
related:
  - process/traceability-and-phase-reviews
  - process/incremental-epics-stay-green
order: 1
updated: 2026-06-10
---

User stories exist to give a cross-functional team shared vocabulary across roles. On a
solo project there is one role. Writing "As a developer, I want the delivery queue to
retry on failure so that messages are not lost" carries nothing that plain prose
wouldn't, and it wraps a simple fact in a sentence structure built for a conversation
that isn't happening. The feedback from the event-sourcing service (2026-05-14) said as
much: drop the user stories, write a normal human README. EARS criteria handle the
functional part.

## Why this matters

The spec-driven workflow (formalised in the engineering standard, 2026-06-02) sequences
three artifacts in strict order: **requirements.md → design.md → tasks.md**. Each
artifact gates the next. The spec is the source of truth and the code is derived from
it, so when the implementation and the spec disagree, you interrogate the spec first.

Here is the failure that motivated it. Work went straight from a vague ticket into code,
discovering requirements mid-implementation and encoding them as implicit decisions in
the codebase. Those decisions were invisible to review and to anyone maintaining the
thing later. Pulling them back into a written spec after the fact cost more than writing
the spec up front would have.

The user-story format was a second, separate problem. On a private, single-person
project the persona prose is corporate overhead and buys you nothing. It survived long
enough to earn an explicit rejection in the project decision record: functional
requirements written as user stories are harder to read as a spec, harder to map to
tests, and harder to group by capability.

## How to apply

### Phase 1: requirements.md

A `requirements.md` file has exactly three parts:

**1. Short overview** — one paragraph on what the feature is, why it exists, and what it
deliberately does not do. This is the "human README" part: direct prose, not persona
fiction.

**2. Locked decisions** — a bullet list of constraints that are not open for debate
during implementation: technology choices, integration contracts, data ownership,
non-functional bounds. Locking them here keeps scope from creeping during design.

**3. Capability-grouped functional requirements** — EARS criteria, numbered, grouped
under headings that name the capability.

The EARS syntax covers the common cases cleanly:

```
WHEN <trigger> THE SYSTEM SHALL <response>
WHILE <ongoing state> THE SYSTEM SHALL <response>
IF <precondition> THEN THE SYSTEM SHALL <response>
WHERE <feature is enabled> THE SYSTEM SHALL <response>
THE SYSTEM SHALL <unconditional requirement>
```

A capability group collects 4–8 criteria. If you have more than 8, split the group. One
bloated group usually means two capabilities are being mixed.

**Example — Producer-side reliable delivery:**

```markdown
## Producer-side reliable delivery

REQ-1: WHEN a producer publishes a message THE SYSTEM SHALL persist it to the
       outbox table within the same database transaction as the domain write.

REQ-2: WHEN the outbox relay reads a pending message THE SYSTEM SHALL attempt
       delivery and mark the message delivered on a 2xx response.

REQ-3: WHILE a message remains undelivered THE SYSTEM SHALL retry with
       exponential back-off capped at 5 minutes.

REQ-4: WHEN a message has failed delivery 10 times THE SYSTEM SHALL move it
       to the dead-letter table and emit a metric.

REQ-5: IF the outbox relay crashes mid-delivery THE SYSTEM SHALL detect the
       duplicate on restart via the idempotency key and skip re-delivery.
```

Each criterion is:
- Unambiguous. "Mark delivered on 2xx" is a test condition, not a wish.
- Independently testable. Each maps to one or a few tests.
- Not a solution. REQ-1 says "persist to outbox table" because that is a locked
  decision. Without the locked decision it would say "persist durably" and leave the
  mechanism to design.

### Phase 2: design.md

Design resolves the how. It maps each REQ-N to a component, a data structure, or a
protocol decision, and records trade-offs wherever alternatives were considered. Every
section references the requirements it satisfies. See
[traceability-and-phase-reviews](/kb/process/traceability-and-phase-reviews).

### Phase 3: tasks.md

Tasks break the design into implementation steps. Each task references the design
section and the REQ-N items it delivers. Tasks are the input to the dev cycle — see
[the ticket-to-PR cycle](/kb/process/dev-cycle-branch-commit-pr).

### When user stories are appropriate

The user-story format isn't banned everywhere. Use it when the work is cross-functional
or UI-facing and the team genuinely needs to reason from the user's perspective:
onboarding flows, multi-persona screens, accessibility work. There, "As a screen-reader
user…" carries real information. For a backend pipeline, a CLI, or a solo-project
service, skip the persona wrapper.

## Anti-patterns

```markdown
<!-- ❌ User-story format on a solo backend project — adds no information,
        obscures the actual requirement, maps poorly to tests. -->
As a developer, I want the system to retry failed deliveries
so that messages are not lost.

<!-- ✅ EARS criterion — unambiguous, testable, groupable by capability. -->
WHILE a message remains undelivered THE SYSTEM SHALL retry with
exponential back-off capped at 5 minutes.
```

```markdown
<!-- ❌ Requirement that is really a solution — locks implementation
        in the wrong document. -->
REQ-3: WHEN a message fails THE SYSTEM SHALL use a Redis sorted set
       keyed by next-attempt timestamp to schedule retries.

<!-- ✅ Requirement states what, design states how. -->
REQ-3: WHILE a message remains undelivered THE SYSTEM SHALL retry with
       exponential back-off capped at 5 minutes.
<!-- In design.md: "Implemented via Redis sorted set keyed by
     next-attempt timestamp; rationale: …" -->
```

```markdown
<!-- ❌ Capability group with 12 items — two capabilities are mixed. -->
## Delivery

REQ-1 … REQ-12
```

More than 8 EARS items under one heading usually means the heading covers two distinct
capabilities. Split into "Producer-side reliable delivery" and "Consumer-side
idempotent processing" and re-number.

## Enforcement

The spec gates code. No CI check stops you from writing code before a spec, but the dev
cycle starts with "retrieve the spec", not "open the code". The review check is simple:
if a PR references a feature with no `requirements.md` entry for it, the PR is incomplete
regardless of test coverage.

The event-sourcing service entry (2026-05-14) is the standing record of why the
user-story format was rejected. When a future template or AI default tries to reintroduce
user stories, point back to that entry and this article.

## See also

EARS was first described by Alistair Mavin et al. in "EARS (Easy Approach to
Requirements Syntax)" (2009 IEEE International Requirements Engineering Conference). The
syntax here follows that specification directly.
