---
title: 'The ticket-to-PR development cycle'
category: process
summary: 'Run a consistent cycle: branch feat/<wi>-<short-title>, commits <WI>: Description, failing E2E first, build, verify in the real runtime, docs, PR.'
principle: 'Run a consistent cycle: branch feat/<wi>-<short-title>, commits "<WI>: Description", plan + test plan, failing E2E first, build, verify in the real runtime, docs (README per folder + documentation/user), final cleanup, PR.'
severity: preferred
tags: [process, dev-cycle, git, branch, commits, pr, workflow]
sources:
  - project: 'dev-cycle skill'
    date: 2026-06-02
    note: 'branch/commit format; failing test first; desktop-first; docs; PR'
related:
  - process/desktop-target-first
  - process/spec-driven-ears-not-user-stories
order: 8
updated: 2026-06-10
---

The dev cycle is the operational sequence that takes a backlog item from "ready to
start" to "merged PR." It is the execution layer below the spec-driven workflow: the
spec (requirements → design → tasks) produces tasks; the dev cycle executes each task
as a consistent, repeatable sequence. Consistency matters because it eliminates the
cognitive overhead of "what do I do next?" and because reviewers know exactly what to
expect in a PR.

## Why this matters

A consistent cycle produces consistent outputs. A PR from this cycle always has: a
named branch, traceable commits, a failing test that became passing, verified
behaviour in the real runtime, and up-to-date documentation. A PR without these is
visibly incomplete — the checklist is public knowledge.

The cycle also encodes priorities. Documentation is not "done after the sprint" — it
is part of the cycle, done before the PR is opened. Desktop-first verification is not
optional — it is a named step in the cycle. A failing test before the implementation
is not TDD ceremony — it is the proof that the test was capable of failing and
therefore capable of catching a regression.

## How to apply

### Step 1: Retrieve context

Before writing a line of code, retrieve:

- The backlog item (task, issue, ticket) and its full description.
- The parent epic or spec phase the task belongs to.
- Related items: dependent tasks, linked design sections, referenced requirements.

This is not research for its own sake — it surfaces the contracts (API shape, data
schema, event types) that the implementation must honour and that tests must verify.

### Step 2: Branch

```bash
git checkout -b feat/<work-item-id>-<short-title>
# Examples:
# feat/123-outbox-relay
# feat/BLOG-47-mobile-nav
```

Branch from the latest `main` (or the merge base of the epic's parent branch if
working inside a gated epic). Do not reuse a branch from a previous task.

### Step 3: Execution plan and test plan

Write (or confirm) the execution plan in the task's issue or in a scratch note:

```markdown
## Execution plan
1. Add `failure_count` column migration (TASK-7, REQ-4)
2. Add promotion logic in OutboxRelay.attemptDelivery
3. Add metric emission
4. Unit test: promotion at exactly 10 failures
5. Unit test: metric emitted on promotion
6. Integration test: relay promotes real row in test DB

## Test plan
- Unit: OutboxRelay.attemptDelivery – promotes at threshold
- Unit: OutboxRelay.attemptDelivery – emits dlq.moved metric
- Integration: relay process – end-to-end promotion in test DB
- E2E (if applicable): admin panel shows DLQ count
```

The test plan is not written to be filed — it determines what tests are written in
step 4.

### Step 4: Write the failing test first

Write the test before the implementation. Run it. Confirm it fails for the right
reason (the feature does not exist yet, not a syntax error or import problem).

```ts
// Confirm this fails before the implementation exists.
it('promotes message to DLQ after 10 consecutive failures', async () => {
  const relay = createRelay(config);
  const msg = await seedMessage(db, { failureCount: 9 });

  await relay.attemptDelivery(msg.id); // 10th failure — should promote

  const dlq = await db.query('SELECT * FROM outbox_dead_letter WHERE id = $1', [msg.id]);
  expect(dlq.rows).toHaveLength(1);
});
```

A test that was never red is a test that has never been proven capable of catching a
regression. Red-first is not optional.

### Step 5: Implement

Write the minimum code that makes the failing test pass. Do not add untested
behaviour. Do not expand scope beyond the task boundary. If implementation reveals
that the spec is wrong, stop and follow the spec-amendment process described in
[traceability-and-phase-reviews](/kb/process/traceability-and-phase-reviews).

Commit atomically. Each commit should be:

```
<WI>: Short imperative description

Optional longer explanation if the change is not self-evident.
```

Examples:
```
TASK-7: Add failure_count column to outbox table
TASK-7: Promote message to DLQ after 10 consecutive failures
TASK-7: Emit dlq.moved metric on promotion
```

The work-item prefix makes every commit traceable to its task, its design section,
and its requirements.

### Step 6: Check in the IDE

After each logical change, check the IDE for type errors, lint violations, and
warnings. Do not accumulate a backlog of IDE issues to fix at the end — fix them
as they appear. A PR that introduces new type errors or lint violations is not ready
for review.

### Step 7: Ensure it builds

```bash
bun run build
```

The build must be clean. A PR that fails the build is not a PR.

### Step 8: Desktop-first verification

If the project has a desktop target, build the desktop app and verify the feature
there first. See [desktop-target-first](/kb/process/desktop-target-first) for the
full protocol. Screenshot evidence is mandatory.

If the project is web-only, run the production build locally and verify in the browser
via the MCP, not the dev server alone.

### Step 9: Run Playwright E2E

Run the full Playwright suite. All tests must pass with zero flakes, three runs in a
row. No skipped tests, no known failures.

```bash
bun run test:e2e
```

A flaky test is a failing test. Fix it before opening the PR.

### Step 10: Update documentation

Every PR that changes behaviour must update documentation:

- **README.md in each affected folder** — purpose, structure, key decisions.
- **documentation/user/** — feature guide if the change is user-visible.

Documentation is part of the cycle, not a trailing nicety. A PR that changes an
API without updating the README for that module is incomplete.

### Step 11: Final cleanup

Before opening the PR:

- Remove debug code, `console.log` statements, commented-out code.
- Confirm all TODO comments in changed files are either resolved or are tracked
  issues (not "TODO: fix this later" in new code).
- Run the linter one final time.
- Run the build one final time.

### Step 12: Manual MCP-browser check

Open the MCP browser pointed at the final build and exercise the feature one more
time. Confirm the console is clean. Take the final screenshots.

### Step 13: Open the PR

The PR description follows this structure:

```markdown
## Summary
- What this PR delivers (one sentence per bullet, max three bullets).
- Reference to the task/issue: closes #123.

## Changes
- Brief list of implementation changes (module names, new files, removed files).

## Test plan
- What was tested and how.
- Screenshot attachments (desktop, mobile if applicable).

## Checklist
- [ ] Tests pass (all layers, zero flakes)
- [ ] Build passes
- [ ] Desktop verified (if applicable)
- [ ] Mobile verified (if applicable)
- [ ] Documentation updated
- [ ] No debug code
```

## Anti-patterns

**Starting with the implementation.** Writing code before the failing test means the
test was written to pass the existing code, not to validate a requirement. The test
will pass on first run and provides weaker coverage guarantees.

**Batching multiple tasks into one PR.** Each task in `tasks.md` maps to one PR. Batching
makes review harder, bisection harder, and rollback harder. The only exception is when
tasks are trivially small (a rename, a config change) and have no design complexity —
in that case, group them with a note in the PR description.

**Deferring documentation.** Documentation written a week after the implementation
reflects the implementation as recalled, not as understood. Documentation written
during the cycle, with the code in front of you, is accurate.

**Opening a draft PR and forgetting the checklist.** A draft PR is for early feedback
on direction, not for work in progress where the checklist is unanswered. If you open
a draft, note explicitly what is missing and by when you expect to complete it.

**Skipping the build step.** "The tests passed, so the build is fine." Tests run in
a module-resolved environment; the build may fail on an import path, a missing asset,
or a bundler configuration. Build separately, verify separately.

## See also

This cycle is the execution layer of the spec-driven workflow. The input is a task
from `tasks.md`. The spec-driven workflow that produces tasks is documented in
[spec-driven-ears-not-user-stories](/kb/process/spec-driven-ears-not-user-stories)
and [traceability-and-phase-reviews](/kb/process/traceability-and-phase-reviews).
