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

An epic that ships in one large PR is hard to review and hard to bisect when something
breaks, and you can't deploy half of it. But splitting it into increments buys you
nothing if later increments skip ahead or let tests go red. That's still a large PR,
just dressed up as several.

The content-admin SPA offline initiative (2026-04-30) settled on a concrete structure.
Each increment is one GitHub issue. The issue body follows a fixed schema. All five
test layers stay green at every increment, no exceptions. And the epic order is strictly
sequential: Phase B is gated on Phase A being merged and green.

## Why this matters

The content-admin SPA offline initiative was a multi-phase capability rollout. The
phases were ordered because each one established contracts that later phases depended
on: service worker registration, cache keys, IDB schema, API shape. Skip Phase A and
implement Phase B first, and Phase B code references contracts that don't exist yet.
Now you either write temporary stubs you'll rip out later, which is rework, or you
fold both phases into one large commit, which kills the incremental structure you were
after.

The green-at-every-increment rule buys bisectability. Say a regression shows up after
Phase C. If every increment merged green, the bisect range is a single increment's
worth of code. Relax the rule, let Phase B merge with known failures "to be fixed in
Phase C," and the regression might be hiding in whatever corners Phase B cut.

The issue body schema isn't decoration. Goal / Acceptance / Tests / Out of scope /
Depends on captures what a reviewer actually needs to evaluate the PR: the intended
outcome, how we know it was achieved, what was verified, what was deliberately
deferred, and what must already be merged before this starts.

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

"All layers green" means no skips, no flakes, nothing deferred to the next increment.
A test disabled with `test.skip` or `xit` so a merge can go through is a failing test.
See [no retries, no flakes](/kb/testing/no-retries-no-flakes).

### Epic ordering

Number phases explicitly: `epic.1`, `epic.2`, `epic.3`. The rule:

- `epic.N+1` cannot begin until `epic.N` is merged and all layers are green.
- `epic.N+1` may not reference a contract (API, schema, event) that `epic.N` was
  supposed to establish but has not yet been reviewed and merged.

If you catch yourself writing code for `epic.3` because `epic.2` is in review and you
want to stay busy, stop. Go address the review comments on `epic.2` instead of
speculatively building `epic.3` on contracts that might still change.

### MVP-valuable isolation

Before writing the issue, ask: if every later phase got cancelled, would this increment
still be worth merging? If the answer is no, the boundary is wrong, and there are two
usual causes:

- The increment is pure infrastructure with no user-visible value. See whether the
  infrastructure and its first consumer can ship as one increment.
- The increment is a half-feature that only becomes useful once the next one lands.
  See whether you can adjust the scope to deliver a complete, minimal version of the
  feature now.

"Worth merging in isolation" doesn't mean "complete." A stripped-down version that
works end to end is valuable on its own. A scaffolding commit full of placeholder
implementations isn't.

## Anti-patterns

**Skipping ahead.** Phase B starts before Phase A is merged because "Phase A is
basically done." Phase A is done when it's merged and green, not when it's in review.
The contracts it establishes aren't stable until it merges.

**Deferring test failures.** A test covering Phase A behaviour fails intermittently,
and someone decides to merge now and fix it in Phase B. That's not an increment, it's
technical debt encoded in the test suite. Fix the test or fix the code before merging.

**Out of scope left empty.** An empty "Out of scope" section usually means nobody
thought hard about the boundary. Every feature decision defers something. If nothing
comes to mind, you haven't examined the scope carefully enough.

**Acceptance criteria that aren't verifiable.** "The feature should feel responsive"
is not a criterion. "WHEN the user clicks Save THE SYSTEM SHALL display the
confirmation within 200ms" is. Acceptance criteria hold to the same bar as EARS
requirements: independently testable.

**Goal written as a task description.** "Implement the service worker registration
module" is a task. "Users can load the app in an offline-first mode after the first
visit" is a goal. The Goal section describes the user or system outcome, not the work
done to get there.

## Enforcement

The PR description references the issue number and confirms all five test layers are
green. Merging without a green test suite is a process violation, however urgent the
change. When CI is flaky, you fix the flakiness before merging rather than bypassing it.

Epic ordering rests on the "Depends on" field and on not opening a PR for `epic.N+1`
while `epic.N` is still unmerged. Nothing in the tooling enforces this, it's a process
rule. Recording it here means any deviation has to be explicit and carry a stated
reason.
