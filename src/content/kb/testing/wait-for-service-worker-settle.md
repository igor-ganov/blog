---
title: 'Let the service worker settle before you touch the DOM'
category: testing
summary: 'In a fresh BrowserContext wait for SW activation to settle via networkidle plus a stable anchor element in beforeEach; domcontentloaded is too early.'
principle: 'In a fresh BrowserContext, wait for SW activation to settle (networkidle + a stable anchor element) in beforeEach; never rely on domcontentloaded.'
severity: strong
tags: [testing, playwright, e2e, service-worker, determinism]
sources:
  - project: 'a content-admin SPA'
    date: 2026-04-30
    note: 'SW controllerchange→reload races test; wait networkidle + stable anchor in beforeEach; domcontentloaded is insufficient.'
related:
  - testing/event-driven-no-timeouts
  - platform/idb-structured-clone-boundary
order: 4
updated: 2026-04-30
---

A fresh `BrowserContext` has no service worker. When the page loads, the SW goes
through `install → activate`, fires `controllerchange` on `navigator.serviceWorker`,
and the activation handler calls `location.reload()`. This reload discards the DOM the
page was painting and starts a second navigation. If your test body starts in the gap
between the first navigation's `domcontentloaded` and the reload, Playwright resolves
locators against a DOM that is about to vanish, and the click lands on a detached
element.

The result is a diagnostic signature you can read in the trace viewer:
`element was detached from the DOM, retrying` followed immediately by
`navigated to "<base>/"`. The test did not time out in the traditional sense — it was
racing a reload it did not know was coming.

## Why this matters

On the content-admin SPA (2026-04-30) the `sw-update-lifecycle.ts` module listens
for `controllerchange` and calls `location.reload()` on the **first** SW activation.
This is standard progressive-web-app behaviour: the first activation puts a new version
of the assets in the cache, and the reload ensures the user sees the new version. It is
correct application code.

The problem is exclusively a test problem. In production the user does not notice the
reload: it happens before they interact with anything. In a fresh `BrowserContext`,
every test run is a first activation. The test begins immediately after `goto` returns,
Playwright resolves the first locator, the `controllerchange` fires half a millisecond
later, `location.reload()` navigates, and the element is gone.

Eleven tests failed intermittently before the pattern was identified. The traces all
showed the same two-line signature. Switching `beforeEach` to wait for `networkidle`
and then for a stable anchor element eliminated the race entirely across all three
browser engines.

## How to apply

The fix goes in `beforeEach` (or in a shared fixture) and applies to every test that
opens a fresh context:

```ts
// ❌ Too early — domcontentloaded fires before SW activation and the reload
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // test body runs here; SW may reload the page mid-test
});

// ❌ Fixed timeout — papers over the race without understanding it
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500); // arbitrarily long; still wrong
});

// ✅ Wait for the network to go idle, then confirm a stable anchor is visible.
//    networkidle means no network requests in the last 500ms — the SW
//    has finished its fetch and the reload navigation has completed.
//    The stable anchor confirms the post-reload DOM is ready for interaction.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-testid="app-shell"]').waitFor({ state: 'visible' });
});
```

Choose the stable anchor element carefully: it must be something that:

- Is present on every page under test.
- Is rendered by the application, not the browser (not a native scroll bar or dialog).
- Has a deterministic `data-testid` — see
  [locator constants](/kb/testing/locator-constants).

The same `waitFor` must be repeated after any mid-flow navigation:

```ts
test('navigates to settings and saves', async ({ page }) => {
  // initial settle handled in beforeEach

  await page.getByTestId(NAV.settingsLink).click();
  // navigation triggered — settle again before asserting the new page
  await page.waitForLoadState('networkidle');
  await page.locator('[data-testid="settings-shell"]').waitFor({ state: 'visible' });

  await page.getByTestId(SETTINGS.saveButton).click();
  await expect(page.getByTestId(SETTINGS.savedBanner)).toBeVisible();
});
```

This is still event-driven: `networkidle` is a network event, and `waitFor` resolves on
a DOM event. There are no timeouts involved — see
[event-driven waits](/kb/testing/event-driven-no-timeouts).

### Diagnosing the race

If tests fail intermittently and the trace is not yet available, add `--trace on` to
the Playwright run:

```
bun run playwright --trace on
```

Open the trace in `playwright show-trace`. Look for:

1. The first `goto('/')` and its `DOMContentLoaded` marker.
2. A second navigation event shortly after — this is the SW-triggered reload.
3. `element was detached from the DOM, retrying` between the two navigation markers.

That sequence confirms the SW race. The fix above resolves it.

## Anti-patterns

```ts
// ❌ Navigating in beforeEach but delegating the wait to the test body.
//    Each test must remember to settle; one forgotten test fails intermittently.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // no settle here
});

test('opens sidebar', async ({ page }) => {
  // if this locator is resolved before the SW reload, the test is a race
  await page.getByTestId(SIDEBAR.toggle).click();
});

// ❌ Disabling the service worker in tests via a mock or flag.
//    This removes the race, but it also removes SW from the test matrix.
//    A bug in the update lifecycle is invisible until production.
await page.route('**\/sw.js', (route) => route.abort());

// ❌ Using load instead of networkidle.
//    load fires when the initial document and its resources are done, but
//    the SW install and activate lifecycle runs after load in many implementations.
await page.waitForLoadState('load'); // may still precede SW activation
```

Disabling the SW in tests is a tempting shortcut that costs real coverage. The
`networkidle + stable anchor` pattern costs two lines in `beforeEach` and gives
complete confidence that the DOM is post-reload and stable.

## Enforcement

There is no static analysis for this pattern. The enforcement is the three-run rule
(see [no retries, no flakes](/kb/testing/no-retries-no-flakes)): if the settle is
missing and the race is real, at least one of three consecutive full-suite runs will
fail, blocking the merge. The goal is to catch it in development, before CI.

In code review, check every `beforeEach` that calls `page.goto`: does it follow the
goto with `waitForLoadState('networkidle')` and a stable-anchor `waitFor`? If the
project has a SW update handler, this is non-optional.
