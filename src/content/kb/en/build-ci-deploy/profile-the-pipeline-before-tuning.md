---
title: 'Profile the pipeline before tuning it'
category: build-ci-deploy
summary: 'Read per-step timings from the CI API before optimising anything; the bottleneck is rarely where it feels. Cache by tool version, put timeout-minutes on install steps so hangs fail fast, and pin runtimes that misbehave.'
principle: 'Optimise a pipeline from measured per-step timings, largest step first. Cache downloads keyed by tool version, bound every install step with timeout-minutes, and pin runtime versions when a newer one breaks — with a comment saying why.'
severity: preferred
tags: [ci, performance, github-actions, caching]
sources:
  - project: 'a content-admin SPA'
    date: 2026-06-12
    note: 'Deploy 9m36s→5m36s. Per-step timings showed e2e at 6m55s of a 9.5m pipeline — everything else was noise. Browser downloads cached by Playwright version (~25s→~5s warm). Node 24 on PATH made playwright install hang 1h+ twice; pinned 22 with timeout-minutes: 8 on the step.'
related:
  - testing/parallel-workers-surface-races
  - build-ci-deploy/least-privilege-workflows
  - process/spike-riskiest-first
order: 8
updated: 2026-06-12
---

"The deploy is slow" is a feeling. A per-step timing table is a plan. CI providers
expose step durations through their APIs, so pull them before you touch anything.
Intuition about where pipeline time goes is reliably wrong, and shaving 30 seconds
off a 30-second step is invisible inside a ten-minute run.

## Why this matters

A ten-minute deploy on the content-admin SPA (2026-06-12) broke down like this:
unit tests 70s, build 29s, browser install 25s, **E2E 6m55s**, deploy tail 30s. One
step was 70% of the pipeline, and nothing else mattered until it shrank.
Parallelising the E2E workers cut the step to 2m46s and the pipeline to 5m36s. The
smaller levers (caching, install bounds) only became worth doing once the big one
had landed.

Two incidental failures during the same work taught the operational half of the
rule:

- A `playwright install` step **hung for over an hour, twice**, burning runner
  minutes and blocking the queue, because Node 24 on PATH broke the installer.
  With no `timeout-minutes`, a tool regression on that step turns into an hour-long
  silent stall. Bound it and the same regression shows up as a red X in minutes.
- The fix was pinning Node 22. That pin looks arbitrary unless the workflow says
  why it is there. Unexplained pins get "cleaned up" by the next refactor, and then
  the hang comes back.

## How to apply

**Step 1: Measure.** Pull step timings from the API, not from scrolling logs:

```sh
gh run view <run-id> --json jobs \
  --jq '.jobs[].steps[] | {name, startedAt, completedAt}'
```

Sort by duration, descending, and spend effort strictly top-down. The
[riskiest/biggest-first discipline](/kb/process/spike-riskiest-first) applies to
pipelines too.

**Step 2: Cache downloads, keyed by the tool's version.**

```yaml
- name: Get Playwright version
  id: pw
  run: echo "version=$(bun pm ls | grep @playwright/test | …)" >> "$GITHUB_OUTPUT"
- uses: actions/cache@<sha>
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}
```

Keying by version rather than by lockfile hash means the cache survives unrelated
dependency bumps and invalidates exactly when the browsers change.

**Step 3: Bound every install step.**

```yaml
- name: Install Playwright browsers
  timeout-minutes: 8   # a healthy install takes ~25s; a hang is a regression
  run: bunx playwright install --with-deps
```

**Step 4: Pin what broke, and say why in place.**

```yaml
- uses: actions/setup-node@<sha>
  with:
    node-version: 22  # Node 24 makes `playwright install --with-deps` hang (2026-06-12)
```

## Anti-patterns

```yaml
# ❌ Tuning the 30s step while a 7-minute step sits untouched — no measurement.

# ❌ Unbounded install. A registry hiccup or tool regression = 1h of runner time.
- run: bunx playwright install --with-deps   # no timeout-minutes

# ❌ Cache keyed on the lockfile — invalidates on every unrelated dep bump.
key: playwright-${{ hashFiles('bun.lock') }}

# ❌ A bare pin with no reason. The next cleanup PR unpins it and the
#    hour-long hang returns with no paper trail.
node-version: 22
```

## Enforcement

After any pipeline change, pull the timing table again and write both numbers
(before/after) into the PR. Review checks: every install or download step has
`timeout-minutes`, every cache key encodes the tool version it caches, and every
version pin carries an in-file reason with a date.
