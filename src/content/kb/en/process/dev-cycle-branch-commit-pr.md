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

The dev cycle is the sequence that moves a backlog item from "ready to start" to
"merged PR." It sits one layer below the spec-driven workflow. The spec produces tasks
through requirements, design, and tasks; the dev cycle runs each task the same way
every time. Running it the same way every time kills the "what do I do next?" overhead,
and it means reviewers know in advance what a PR from this cycle will contain.

## Why this matters

A consistent cycle gives you consistent output. A PR that came out of this cycle has a
named branch, commits you can trace back to a task, a test that started red and ended
green, behaviour verified in the real runtime, and documentation that matches the code.
When one of those is missing the PR reads as incomplete, because everyone already knows
the checklist.

The cycle also bakes in the priorities. Documentation gets written before the PR opens,
not after the sprint. Desktop-first verification is a named step, not something you do
if there's time. And the failing test up front is the proof that the test could fail at
all, which is the only thing that makes it useful for catching a regression later.

## How to apply

### Step 1: Retrieve context

Before writing a line of code, retrieve:

- The backlog item (task, issue, ticket) and its full description.
- The parent epic or spec phase the task belongs to.
- Related items: dependent tasks, linked design sections, referenced requirements.

You're not reading for the sake of reading. You're pulling out the contracts the
implementation has to honour and the tests have to check: API shape, data schema,
event types.

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

You don't write the test plan to file it away. It decides which tests you write in
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

A test that was never red has never been shown to catch anything. Make it fail first.

### Step 5: Implement

Write the minimum code that makes the failing test pass. Do not add untested
behaviour. Do not expand scope beyond the task boundary. If implementation reveals
that the spec is wrong, stop and follow the spec-amendment process described in
[traceability-and-phase-reviews](/principles/process/traceability-and-phase-reviews).

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

The work-item prefix is what lets you trace any commit back to its task, the design
section behind it, and the requirements it came from.

### Step 6: Check in the IDE

After each logical change, check the IDE for type errors, lint violations, and
warnings. Don't let a backlog of IDE issues pile up for the end; fix each one as it
shows up. A PR that adds new type errors or lint violations isn't ready for review.

### Step 7: Ensure it builds

```bash
bun run build
```

The build must be clean. A PR that doesn't build isn't a PR.

### Step 8: Desktop-first verification

If the project has a desktop target, build the desktop app and verify the feature
there first. See [desktop-target-first](/principles/process/desktop-target-first) for the
full protocol. Screenshot evidence is mandatory.

If the project is web-only, run the production build locally and verify in the browser
via the MCP, not the dev server alone.

### Step 9: Run Playwright E2E

Run the full Playwright suite. Everything passes, three runs in a row, with zero
flakes. No skipped tests, no known failures.

```bash
bun run test:e2e
```

A flaky test is a failing test. Fix it before opening the PR.

### Step 10: Update documentation

Every PR that changes behaviour must update documentation:

- **README.md in each affected folder** — purpose, structure, key decisions.
- **documentation/user/** — feature guide if the change is user-visible.

Documentation belongs in the cycle, not tacked on afterward. A PR that changes an API
without updating that module's README is incomplete.

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

**Starting with the implementation.** Write code before the failing test and the test
ends up shaped to pass the code you already wrote, not to check a requirement. It goes
green on the first run and tells you almost nothing about coverage.

**Batching multiple tasks into one PR.** Each task in `tasks.md` maps to one PR.
Batching makes review, bisection, and rollback all harder. The exception is tasks that
are trivially small with no design complexity, like a rename or a config change; group
those with a note in the PR description.

**Deferring documentation.** Docs you write a week later describe the implementation as
you remember it, not as you understood it while building it. Write them during the
cycle, with the code in front of you, and they come out accurate.

**Opening a draft PR and forgetting the checklist.** A draft is for early feedback on
direction. It is not a parking spot for work-in-progress with an unanswered checklist.
If you open one, spell out what's missing and when you expect to finish it.

**Skipping the build step.** "The tests passed, so the build is fine." Tests run in a
module-resolved environment, and the build can still break on an import path, a missing
asset, or a bundler config. Build separately, verify separately.

## See also

This cycle runs the spec-driven workflow. Its input is a task from `tasks.md`. The
workflow that produces those tasks is documented in
[spec-driven-ears-not-user-stories](/principles/process/spec-driven-ears-not-user-stories)
and [traceability-and-phase-reviews](/principles/process/traceability-and-phase-reviews).
