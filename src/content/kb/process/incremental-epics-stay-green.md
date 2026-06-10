---
title: 'Incremental epics that stay green, in order'
category: process
summary: 'Each increment is one issue with Goal/Acceptance/Tests/Out of scope/Depends on; all test layers stay green every increment; never skip ahead in epic order.'
principle: 'Each increment is one issue shaped Goal / Acceptance / Tests / Out of scope / Depends on, valuable in isolation; all test layers stay green every increment; never skip ahead in epic order — earlier increments encode contracts later ones rely on.'
severity: strong
tags: [process, epics, incremental, testing, github-issues, green]
sources:
  - project: 'a content-admin SPA'
    date: 2026-04-30
    note: 'one issue per increment; Goal/Acceptance/Tests/Out-of-scope/Depends; all layers green; no skip-ahead'
related:
  - process/spec-driven-ears-not-user-stories
  - testing/no-retries-no-flakes
order: 5
updated: 2026-06-10
---

An epic that ships in one large PR is hard to review, hard to bisect when something
breaks, and impossible to partially deploy. An epic that ships in increments where
later increments skip ahead or let tests go red is not incremental — it is a large PR
with extra steps.

The content-admin SPA offline initiative (2026-04-30) established a concrete structure:
each increment is one GitHub issue, the issue body follows a fixed schema, all five
test layers stay green at every increment without exception, and the epic order is
strictly sequential — Phase B is gated on Phase A being merged and green.

## Why this matters

The content-admin SPA offline initiative was a multi-phase capability rollout. The phases were ordered
because each phase established contracts — service worker registration, cache keys,
IDB schema, API shape — that subsequent phases depended on. Skipping Phase A and
implementing Phase B first would have produced Phase B code that referenced contracts
that did not exist yet, requiring either: temporary stubs that would later be removed
(rework), or a single large commit that implemented both phases (defeating the
incremental structure).

Beyond the contract dependency, the green-at-every-increment requirement serves
bisectability. If a regression appears after Phase C, and every increment merged as
green, the bisect range is one increment's worth of code. If the rule was relaxed and
Phase B was allowed to merge with known test failures "to be fixed in Phase C," the
regression could have been introduced in Phase B's cut corners.

The issue body schema was not aesthetic preference. Goal / Acceptance / Tests / Out of
scope / Depends on encodes exactly the information a reviewer needs to evaluate the PR:
what was the intended outcome, how do we know it was achieved, what was verified, what
was deliberately deferred, and what must already be complete.

## How to apply

### Issue body schema

Every increment in an epic is a GitHub issue with this exact body structure:

```markdown
## Goal
One paragraph. What capability does this increment deliver and why does it matter
in isolation? An increment that is only useful as setup for the next one is not an
increment — it is a prerequisite that should be folded into the next phase or
extracted into a smaller, self-contained deliverable.

## Acceptance criteria
- Bullet list of observable, verifiable outcomes.
- Each criterion maps directly to a test in the Tests section.
- Written from the user or system perspective, not the implementation perspective.

## Tests
- [ ] Unit: what unit tests cover the new logic
- [ ] Integration: what integration tests cover the interaction between components
- [ ] E2E mocked: what E2E scenarios run against a mocked backend
- [ ] E2E prod: what E2E scenarios run against the real production backend
- [ ] Manual: any manual verification steps (desktop app, mobile viewport, etc.)

## Out of scope
- Explicit list of things that were considered and deliberately deferred.
- This section prevents scope creep and documents why certain related things
  are not in this increment.

## Depends on
- List of issue numbers or PRs that must be merged before this can start.
- If empty, this increment can begin immediately.
```

### The five test layers

All five layers must be green when the increment PR is merged:

1. **Unit** — pure logic, single module, no I/O.
2. **Integration** — component boundaries, database, message queue, or service
   interactions.
3. **E2E mocked** — full application flow against a controlled, predictable mock
   backend.
4. **E2E prod** — full application flow against the real production backend.
5. **Manual** — human verification in the real runtime (desktop app screenshots, mobile
   viewport, console clean).

"All layers green" means no skips, no flakes, no known failures deferred to the next
increment. A test that is disabled with `test.skip` or `xit` to allow a merge is a
failing test. See [no retries, no flakes](/kb/testing/no-retries-no-flakes).

### Epic ordering

Number phases explicitly: `epic.1`, `epic.2`, `epic.3`. The rule:

- `epic.N+1` cannot begin until `epic.N` is merged and all layers are green.
- `epic.N+1` may not reference a contract (API, schema, event) that `epic.N` was
  supposed to establish but has not yet been reviewed and merged.

If you find yourself writing code for `epic.3` because `epic.2` is in review and you
want to stay productive, the correct action is to fix `epic.2` (address review
comments) rather than speculatively implement `epic.3`.

### MVP-valuable isolation

Before writing the issue, ask: if every subsequent phase were cancelled, would this
increment still be worth merging? If the answer is no, the increment boundary is
wrong. Either:

- The increment is pure infrastructure that delivers no user-visible value — consider
  whether the infrastructure and the first consumer can be the same increment.
- The increment delivers a half-feature that needs the next increment to be useful —
  consider whether the scope can be adjusted to deliver a complete, minimal version of
  the feature now.

"Worth merging in isolation" does not mean "complete." A stripped-down version of a
feature that works end-to-end is valuable in isolation. A scaffolding commit with
placeholder implementations is not.

## Anti-patterns

**Skipping ahead.** Phase B starts before Phase A is merged because "Phase A is
basically done." Phase A is done when it is merged and green, not when it is in review.
The contracts it establishes are not stable until it merges.

**Deferring test failures.** A test that covers Phase A behaviour fails intermittently;
the decision is made to merge and fix in Phase B. This is not an increment — it is
technical debt encoded in the test suite. Fix the test or fix the code before merging.

**Out of scope left empty.** An empty "Out of scope" section usually means the scope
boundary was not thought through. Every feature decision involves deferred concerns;
if none come to mind, the increment scope has not been examined carefully enough.

**Acceptance criteria that are not verifiable.** "The feature should feel responsive"
is not an acceptance criterion. "WHEN the user clicks Save THE SYSTEM SHALL display
the confirmation within 200ms" is. Acceptance criteria follow the same quality bar as
EARS requirements — they must be independently testable.

**Goal written as a task description.** "Implement the service worker registration
module" is a task. "Users can load the app in an offline-first mode after the first
visit" is a goal. The Goal section must describe the user or system outcome, not the
implementation work.

## Enforcement

The PR description references the issue number and confirms all five test layers are
green. A PR that merges without a green test suite is a process violation regardless
of urgency. If CI is flaky, the flakiness is fixed before merging — it is not
bypassed.

Epic ordering is enforced by the "Depends on" field in the issue and by not opening
a PR for `epic.N+1` while `epic.N` is unmerged. This is a social/process enforcement,
not a tool enforcement, but the rule is recorded here so that a deviation is explicit
and requires a recorded reason.
