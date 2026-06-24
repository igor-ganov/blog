---
title: 'Parallel workers are a race detector, not just a speed lever'
category: testing
summary: 'Running the E2E suite serially in CI masks application races behind incidental slowness. Turning workers up is both the biggest pipeline speedup and a stress test that surfaces real bugs — fix those, never the parallelism.'
principle: 'Run E2E with parallel workers in CI. When parallelism makes tests fail, the application has a race — fix the app or the wait signal, never reduce workers or pad timeouts. Tune the wait ceiling once, via environment, not per spec.'
severity: strong
tags: [testing, playwright, e2e, ci, determinism, performance]
sources:
  - project: 'a content-admin SPA'
    date: 2026-06-12
    note: 'workers 1→4 in CI cut e2e 6m55s→2m46s and immediately surfaced three real service-worker races that serial runs had masked for months. Wait ceiling raised via one env knob (30s CI, 10s local), not per-spec patches. A fixture with an absolute machine path had silently skipped a test in CI for months.'
related:
  - testing/event-driven-no-timeouts
  - testing/no-retries-no-flakes
  - testing/wait-for-service-worker-settle
  - testing/out-of-band-transport-needs-dom-signals
order: 7
updated: 2026-06-12
---

A serial E2E suite is slow, and that slowness is doing work you don't want it to do.
Each test gets the whole machine, pages settle at a leisurely pace, and races hide in
the slack. Turn the workers up and the suite gets much faster while every test that
was passing by accident starts failing honestly. You want both of those.

The rule: CI runs the suite with parallel workers, and any failure that parallelism
provokes is a real defect in the application or in the wait signal. Reducing workers
to "stabilise" the suite does what adding retries does: it buys green by removing
the stress that exposes the race.

## Why this matters

On the content-admin SPA (2026-06-12) the deploy pipeline ran E2E with `workers: 1`
in CI. Raising it to 4 cut the E2E step from 6m55s to 2m46s, the single biggest
saving in a 9.5-minute pipeline. It also broke three tests within the first few runs.
None of the three was a test problem:

1. A post-login navigation intermittently died with `net::ERR_ABORTED` — fresh
   service-worker activation claims the client mid-`goto`. Months old; serial runs
   were slow enough that activation always won the race.
2. A section switch asserted on list items before the section's data had arrived —
   the data travels over a `MessageChannel`, invisible to network-based waits. See
   [out-of-band transport needs DOM signals](/principles/testing/out-of-band-transport-needs-dom-signals).
3. Visits anchored on `networkidle`, which is a hidden 500ms sleep and proves
   nothing about the SW lifecycle. See
   [wait for the service worker to settle](/principles/testing/wait-for-service-worker-settle).

Each fix was event-shaped and made the application's behaviour more honest. After
that the suite passed 271/271 three consecutive times locally and stayed green in CI,
faster than before and worth trusting.

## How to apply

**Step 1: Parallel in CI, explicitly.**

```ts
// playwright.config.ts
export default defineConfig({
  // CI runners have ~4 vCPUs; saturate them. Locally let Playwright decide.
  workers: process.env.CI ? 4 : undefined,
});
```

**Step 2: One environment knob for the wait ceiling — never per-spec padding.**

Four workers on four shared vCPUs make a healthy cold start legitimately slower
than on a dedicated local machine. That changes the *ceiling* a wait may block
before failing, not the wait itself. Make the ceiling an environment override in
the shared wait helpers and keep the strict default locally:

```ts
// wait helper (shared toolkit)
const envMax = Number(process.env.E2E_MAX_WAIT_MS);
const maxMs = Number.isFinite(envMax) && envMax > 0 ? envMax : 10_000;
```

```yaml
# deploy.yml — CI is slower, not buggier; say it once.
env:
  E2E_MAX_WAIT_MS: '30000'
```

Waits stay event-driven and resolve the instant the condition is true; only the
failure deadline moves. When random tail tests start timing out on CI, raise this
one knob. Do not sprinkle `{ timeout: 30000 }` over individual specs, because each
of those hides whether the spec is slow or broken.

**Step 3: Audit what the serial suite was silently not running.**

Speed work forces you to read the suite, and what you find there can matter as much
as the timing. A test that uploads a PDF pointed its fixture at an **absolute path on
the author's machine**, guarded by `test.skip` when the file is missing. It had
quietly skipped in CI for months while the suite reported green. Fixtures belong in
the repository (`e2e/fixtures/`), and a conditional skip on a missing fixture is a
[skipped test, which is a failing test](/principles/testing/no-retries-no-flakes).

## Anti-patterns

```ts
// ❌ Stabilising by de-parallelising. The race is still in production.
workers: 1,

// ❌ fullyParallel: false / serial mode for a flaky describe block —
//    same move, smaller blast radius, same hidden race.
test.describe.configure({ mode: 'serial' });

// ❌ Per-spec timeout padding. Now nobody knows the real budget.
await expect(item).toBeVisible({ timeout: 45_000 });

// ❌ Fixture outside the repo, guarded by a skip — green CI, zero coverage.
const PDF = 'C:/Users/author/Downloads/sample.pdf';
test.skip(!fs.existsSync(PDF), 'fixture missing');
```

## Enforcement

The pipeline itself enforces most of this: parallel workers configured in CI, zero
retries, and the three-run rule. The rest goes into review. Check that `workers` is
not 1 in CI, that no `mode: 'serial'` appears without a written justification, that
no literal timeout overrides live in specs (the ceiling belongs in the shared
helper), and that every fixture path resolves inside the repository.
