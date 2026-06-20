---
title: 'Out-of-band transport needs DOM signals'
category: testing
summary: 'Network-based waits cannot see MessageChannel, BroadcastChannel, or in-worker traffic. When data moves out of band, the application must expose completion as observable DOM state — a data attribute the test can wait on.'
principle: 'When data reaches the page through a channel the test harness cannot observe (MessageChannel, BroadcastChannel, worker-internal fetches), expose arrival as DOM state — e.g. a data attribute identifying what is rendered — and wait on that.'
severity: strong
tags: [testing, playwright, e2e, service-worker, determinism]
sources:
  - project: 'a content-admin SPA'
    date: 2026-06-12
    note: 'Section switches deliver content over a SW MessageChannel — invisible to the request graph. List items expose data-path; the page object waits until the first item belongs to the target section (or an explicit empty state shows).'
related:
  - testing/event-driven-no-timeouts
  - testing/parallel-workers-surface-races
  - testing/wait-for-service-worker-settle
order: 8
updated: 2026-06-12
---

Event-driven test waits lean on two observable surfaces: the DOM and the network.
Playwright can intercept every HTTP request the page makes, so "wait for the
response, then assert the DOM" covers most synchronisation. The network half of
that toolkit goes blind the moment an application moves data through a transport
the harness cannot tap: `MessageChannel` to a service worker, `BroadcastChannel`
between tabs, a fetch performed *inside* a worker, WebTransport. Requests fly,
data lands, and the test's request graph stays silent.

From there the wrong conclusions come fast. "There's no event to wait on, so I'll
sleep." Or "I'll wait for any list item to appear." Either one gives you a test
that passes while the *previous* screen's data is still sitting there.

## Why this matters

The content-admin SPA routes all git/content traffic through a service worker
acting as a backend-for-frontend. The client talks to it over `MessageChannel`,
and on WebKit under Playwright even ordinary fetches go through that bridge,
because `navigator.serviceWorker.controller` is never exposed. Switching from the
blog section to the positions section triggers no observable HTTP request at all.

The test for section switching waited for content items to be visible after
clicking the section link. Items *were* visible: the previous section's items, the
ones about to be replaced. Run serially, the replacement always won the race. With
[4 parallel workers](/kb/testing/parallel-workers-surface-races) the assertion
landed mid-replacement and the test failed honestly. No network wait could fix it,
because there is no request to wait for.

The fix lived in the application and cost one attribute. Each rendered content item
exposes its repository path as `data-path`. The path encodes which section the
item belongs to, so "the switch completed" turns into an observable DOM predicate.

## How to apply

Expose identity, not just presence. A list that renders `data-testid="content-item"`
only says something is here. Add `data-path="blog/2026/post.md"` and it says *what*
is here, which is exactly what a navigation test needs to assert on.

```html
<li data-testid="content-item" :data-path="item.path">…</li>
```

```ts
// Page object: the switch is complete when the FIRST item belongs to the
// target section — or the section is legitimately empty and says so.
export const waitForSection = async (page: Page, section: string) => {
  await waitForCondition(page, async () => {
    const empty = await page.getByTestId('content-empty').isVisible();
    if (empty) return true;
    const path = await page
      .getByTestId('content-item')
      .first()
      .getAttribute('data-path');
    return path?.startsWith(`${section}/`) ?? false;
  });
};
```

Two details carry the weight:

- **The predicate distinguishes old data from new.** A presence-based wait
  (`toBeVisible` on a generic item) cannot tell a stale list from a fresh one. An
  identity-based wait can, because it reads what the item actually is.
- **Empty is a state, not an absence.** If the target section can be empty, the
  application has to render an explicit empty-state element. Without it the wait
  has no terminal condition and the test deadlocks on a perfectly healthy page.

None of this is test trickery. The attribute is real rendered state, it helps when
you are poking around in devtools, and it costs one binding.

## Anti-patterns

```ts
// ❌ Sleeping because "there's nothing to wait on". There is — you just
//    haven't rendered it yet.
await page.waitForTimeout(2000);

// ❌ Presence-based wait — passes against the PREVIOUS section's items.
await expect(page.getByTestId('content-item').first()).toBeVisible();

// ❌ Reaching into the transport from the test (evaluate + postMessage
//    handshakes). Now the test depends on the protocol's internals and
//    breaks on every refactor; the DOM attribute is the stable contract.
await page.evaluate(() => navigator.serviceWorker.controller!.postMessage(…));

// ❌ Asserting on internal stores (window.__state). Same coupling problem,
//    plus it tests the store, not what the user sees.
```

## Enforcement

Code review: any feature whose data path crosses a worker boundary, channel, or
other harness-invisible transport must expose completion as DOM state, and its
tests must wait on identity rather than presence. The
[three-run rule under parallel workers](/kb/testing/no-retries-no-flakes) is the
backstop. Presence-based waits over out-of-band data are exactly the class of race
that parallelism flushes out into the open.
