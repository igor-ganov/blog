---
title: 'Let the service worker settle before you touch the DOM'
category: testing
summary: 'In a fresh BrowserContext, gate on the SW lifecycle itself — controller present or registration active — plus a stable anchor element. networkidle is a hidden 500ms sleep; domcontentloaded is too early.'
principle: 'Wait for the service worker to control the document (or have an active registration on WebKit) plus a stable anchor element, before the test body and before any subsequent navigation. Never use networkidle or domcontentloaded as the settle signal.'
severity: strong
tags: [testing, playwright, e2e, service-worker, determinism]
sources:
  - project: 'a content-admin SPA'
    date: 2026-04-30
    note: 'SW controllerchange→reload races test; original fix waited networkidle + stable anchor in beforeEach.'
  - project: 'a content-admin SPA'
    date: 2026-06-12
    note: 'networkidle superseded: it is a hidden >=500ms sleep per visit. Gate on the lifecycle state itself (controller or active registration — WebKit never exposes controller). Also gate BEFORE the next navigation: activation claims clients and aborts an in-flight goto (net::ERR_ABORTED).'
related:
  - testing/event-driven-no-timeouts
  - testing/parallel-workers-surface-races
  - platform/idb-structured-clone-boundary
order: 4
updated: 2026-06-12
---

A fresh `BrowserContext` has no service worker. When the page loads, the SW goes
through `install → activate`, fires `controllerchange` on `navigator.serviceWorker`,
and the activation handler claims the client. That step is often followed by a
`location.reload()`, which discards the DOM the page was painting and starts a second
navigation. If your test body starts in the gap between the first navigation's
`domcontentloaded` and the reload, Playwright resolves locators against a DOM that is
about to vanish, and the click lands on a detached element.

In the trace viewer the failure has a recognizable signature: `element was detached
from the DOM, retrying` followed immediately by `navigated to "<base>/"`. The test
didn't time out the usual way. It was racing a reload it didn't know was coming.

## Why this matters

On the content-admin SPA (2026-04-30) the update-lifecycle module listens for
`controllerchange` and reloads on the **first** SW activation. That is standard
progressive-web-app behaviour and correct application code. The problem lives entirely
in the tests: in a fresh `BrowserContext`, every test run is a first activation.

The first fix (2026-04-30) waited for `networkidle` plus a stable anchor. It passed,
but it was the wrong wait. `networkidle` means "no network requests for 500ms", so it
is a time-shaped wait wearing an event costume. Every visit pays a mandatory 500ms of
silence even when the SW settled instantly. Across a suite of dozens of visits that
adds up to half a minute of pure sleep, and it still tells you nothing about the SW,
because a page can be network-idle while the SW is mid-activation.

The second pass (2026-06-12), under a hard pipeline-speed budget, replaced it with a
gate on the lifecycle state itself. The wait resolves the instant the SW controls the
document, typically a few milliseconds on a warm context rather than a fixed 500ms.

That pass also turned up a second face of the race: activation aborts in-flight
navigations. A test that logs in (registering the SW) and immediately `goto`s the next
page dies with `net::ERR_ABORTED`, because the activating worker claims the client
mid-navigation. So the lifecycle gate has to run before the test body and before any
navigation that follows an action which (re)registers the SW.

## How to apply

Gate on the SW lifecycle, then on a stable anchor the app renders only after the
handshake:

```ts
// ❌ Too early — domcontentloaded fires before SW activation and the reload.
await page.goto('/');

// ❌ The old advice — networkidle is a hidden >=500ms sleep per visit and
//    proves nothing about the SW lifecycle.
await page.waitForLoadState('networkidle');

// ✅ Wait for the SW to control the document. WebKit in Playwright never
//    exposes `controller`, so an active registration counts as the same
//    lifecycle gate there.
export const waitForSWControl = async (page: Page): Promise<void> => {
  await page.waitForFunction(async () => {
    const sw = navigator.serviceWorker;
    const reg = sw ? await sw.getRegistration() : undefined;
    return !sw || sw.controller !== null || Boolean(reg?.active);
  });
};

// ✅ The full settle: navigate, gate the lifecycle, anchor on post-activate DOM.
export const visitSettled = async (
  page: Page,
  url: string,
  stableTestId: string,
): Promise<void> => {
  await visit(page, url);
  await waitForSWControl(page);
  await expect(page.getByTestId(stableTestId)).toBeVisible();
};
```

Pick the stable anchor element with care. It has to be present on every page under
test, rendered by the application, and carry a deterministic `data-testid` (see
[locator constants](/kb/testing/locator-constants)).

And gate **before the next navigation** whenever the previous step registered the SW:

```ts
// First authenticated load registers the SW.
await page.evaluate(() => localStorage.setItem('token', 'mock'));
await page.reload({ waitUntil: 'domcontentloaded' });
await expect(page.getByRole('button', { name: /user/i })).toBeVisible();

// ❌ goto here intermittently dies with net::ERR_ABORTED — activation
//    claims the client mid-navigation.
// ✅ Gate the lifecycle first; the goto then never races the claim.
await waitForSWControl(page);
await visit(page, '/content/blog');
```

This is still event-driven. `waitForFunction` polls a browser-side predicate and
resolves the instant it returns true, with no fixed cost (see
[event-driven waits](/kb/testing/event-driven-no-timeouts)).

### Diagnosing the race

Run with `--trace on` and open the trace viewer. Look for:

1. The first `goto('/')` and its `DOMContentLoaded` marker.
2. A second navigation event shortly after — the SW-triggered reload.
3. `element was detached from the DOM, retrying` between the two markers — the
   mid-test reload race; or `net::ERR_ABORTED` on a `goto` — the activation-claim
   race.

## Anti-patterns

```ts
// ❌ networkidle as the settle signal. A hidden 500ms sleep per call, and a
//    page can be network-idle while the SW is mid-activation.
await page.waitForLoadState('networkidle');

// ❌ Navigating in beforeEach but delegating the settle to the test body.
//    One forgotten test fails intermittently.

// ❌ Disabling the service worker in tests via a mock or flag.
//    This removes the race, but it also removes the SW from the test matrix.
await page.route('**/sw.js', (route) => route.abort());

// ❌ Browser-specific branches around the controller. WebKit's missing
//    controller is a known platform gap — fold it into ONE predicate
//    (controller OR active registration), not an if per browser.
if (browserName === 'webkit') await page.waitForTimeout(300);
```

Disabling the SW in tests is a tempting shortcut, but it throws away real coverage.
The lifecycle gate costs one shared helper and buys complete confidence that the DOM
is post-activate and stable.

## Enforcement

There is no static analysis for this pattern. Enforcement comes from the three-run
rule (see [no retries, no flakes](/kb/testing/no-retries-no-flakes)) and, more
sharply, from parallel workers. Serial suites mask this race behind incidental
slowness, while 4 workers on shared CI vCPUs reproduce it within a run or two (see
[parallel workers surface races](/kb/testing/parallel-workers-surface-races)).

In code review, check every navigation that follows SW (re)registration: is it gated
by the lifecycle predicate and a stable anchor? If the project ships a SW update
handler, that gate is non-optional.
