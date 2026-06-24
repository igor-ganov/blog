---
title: 'Event-driven waits — no timeouts, ever'
category: testing
summary: 'Tests wait on real DOM and network events, never on arbitrary time. A timeout is a crutch that hides broken code.'
principle: 'Never use timeouts to synchronise a test. Wait on the actual DOM or network event; if you cannot, the application is the problem.'
severity: non-negotiable
tags: [testing, playwright, e2e, determinism, performance]
sources:
  - project: 'a desktop UI tool'
    date: 2026-03-12
    note: 'App must respond under 1s; no idle timeouts, no retries; run tests 3× and any failure means the code is broken.'
  - project: 'a content-admin SPA'
    date: 2026-04-30
    note: 'E2E beforeEach must wait for SW activation to settle via a stable-anchor element, not a timeout.'
  - project: 'a content-admin SPA'
    date: 2026-06-12
    note: 'networkidle is itself a time-shaped wait — a hidden >=500ms sleep per visit. Replaced with a lifecycle predicate; suite-wide visit cost dropped accordingly.'
related:
  - testing/no-retries-no-flakes
  - testing/locator-constants
  - testing/wait-for-service-worker-settle
  - testing/parallel-workers-surface-races
order: 1
updated: 2026-06-12
---

A `waitForTimeout(500)` in a test admits one of two things. Either you do not know
what you are waiting for, or the app is not fast and deterministic enough to wait for
the real signal. Both are bugs, one in the test and one in the application, and a
timeout papers over whichever one you have. It turns a green run into a probably-green
run and guarantees a flake on the slowest CI machine.

So the rule is that tests synchronise on events, meaning DOM events and network events,
and nothing else. Event-wait timeouts (the maximum a wait will block before failing)
stay minimal, because a correct app fires the event promptly. If it does not, you fix
the app, not the wait.

## Why this matters

The standard here predates the test suite and does not bend: the app must
open and respond in under one second, no exceptions (a desktop UI tool, 2026-03-12).
Everything else follows from that. No idle timeouts as a completion signal, no test
retries, and the acceptance bar is that you run the tests three times and if any run
fails, the code is broken and gets rewritten. Timeouts and retries are crutches that
mask broken code.

Here is the concrete failure that taught the discipline. On the admin panel, a fresh
test `BrowserContext` races the service worker's install → activate → `controllerchange`
→ `location.reload()` cycle. A test that waited a fixed time, or just on
`domcontentloaded`, would click an element on the about-to-be-discarded DOM, the reload
would navigate away, and the click failed with "navigated to /". Intermittent,
platform-dependent, invisible until it hit CI. We did not fix it with a longer timeout.
We waited on the real settle signal: a predicate over the SW lifecycle state plus a
stable anchor element. See [wait for the service worker to settle](/principles/testing/wait-for-service-worker-settle).

There is a second-order trap we found later (2026-06-12). `networkidle` is a timeout
in disguise: it resolves after 500ms of network silence, so every call pays a fixed
half-second even when the page settled instantly, and a page can be network-idle while
the thing you actually care about is still mid-flight. The same applies to any "idle"
load state used as a completion signal. Wait on the state itself, not on silence.

## How to apply

Wait for the thing that actually indicates readiness.

```ts
// ❌ Guessing how long the request takes.
await page.click('[data-testid="save"]');
await page.waitForTimeout(1000);
await expect(page.getByText('Saved')).toBeVisible();

// ✅ Wait on the network response and the DOM that proves it landed.
const saved = page.waitForResponse(
  (res) => res.url().endsWith('/tickets') && res.request().method() === 'POST',
);
await page.getByTestId(SAVE_BUTTON).click();
await saved;
await expect(page.getByTestId(SAVE_CONFIRMATION)).toBeVisible();
```

For app state that resolves through several async steps, wait on the user-visible
consequence (a status region flipping to "idle", or a row appearing) using Playwright's
auto-retrying assertions like `toBeVisible` and `toHaveText`. These poll the DOM and
resolve the instant the condition holds, so they react to the event rather than to the
clock.

When a test is genuinely flaky, the playbook is investigative, not cosmetic:

1. Run the server, drive it with the Chrome DevTools / Playwright MCP, reproduce the
   action manually, and watch the console and network. Enable throttling.
2. If it works under throttling and you cannot reproduce the failure, the test waited on
   the wrong event — rewrite it to trigger on a different, correct DOM event, not on a
   timeout.
3. If it is genuinely unstable under some scenarios, the application has a race. Fix the
   root cause. If the architecture cannot guarantee deterministic behaviour, the
   architecture is wrong — refactor it.

## Anti-patterns

```ts
// ❌ Idle timeout as a completion mechanism. Sentinel detection must be instant
//    and deterministic, not "probably done after 800ms".
await sleep(800);

// ❌ Retrying until it passes. A test that needs retries is reporting a real race;
//    retries hide it.
test.describe.configure({ retries: 3 });

// ❌ Browser-specific timing hacks. If a test needs a hack for WebKit, the app
//    behaves differently on WebKit and that is the bug.
if (browserName === 'webkit') await page.waitForTimeout(300);
```

## Enforcement

Run suites with `--reporter=list` during development and `--reporter=json` to read
traces when something is unstable. Programmatic test exclusion is forbidden — you may
run a subset while developing, but the only definition of green is a full, stable
pass with zero retries, three runs in a row. A flaky or skipped test is a failing
test.

## See also

This comes back to preferring deterministic systems over probabilistic hacks. The
same standard (sub-second response, no idle timeouts, no retries, run it three times) is
what [no retries, no flakes](/principles/testing/no-retries-no-flakes) makes explicit.
