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
response, then assert the DOM" covers most synchronisation. But the moment an
application moves data through a transport the harness cannot tap —
`MessageChannel` to a service worker, `BroadcastChannel` between tabs, a fetch
performed *inside* a worker, WebTransport — the network half of that toolkit goes
blind. Requests fly, data lands, and the test's request graph shows silence.

The wrong conclusions follow fast: "there's no event to wait on, so I'll sleep" or
"I'll wait for any list item to appear". Both produce a test that passes when the
*previous* screen's data is still on screen.

## Why this matters

The content-admin SPA routes all git/content traffic through a service worker
acting as a backend-for-frontend. The client talks to it over `MessageChannel` —
on WebKit under Playwright even ordinary fetches go through that bridge, because
`navigator.serviceWorker.controller` is never exposed. Switching from the blog
section to the positions section triggers no observable HTTP request at all.

The test for section switching waited for content items to be visible after
clicking the section link. Items *were* visible — the previous section's items,
about to be replaced. Serially the replacement always won; with
[4 parallel workers](/kb/testing/parallel-workers-surface-races) the assertion ran
mid-replacement and the test failed honestly. No network wait could fix it: there
is no request to wait for.

The fix changed the application, one attribute's worth: each rendered content item
exposes its repository path as `data-path`. The path encodes which section the
item belongs to, so "the switch completed" becomes an observable DOM predicate.

## How to apply

Expose identity, not just presence. A list that renders `data-testid="content-item"`
says "something is here"; a list that also renders `data-path="blog/2026/post.md"`
says *what* is here — and "what" is the thing a navigation test needs.

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

- **The predicate distinguishes old data from new.** Presence-based waits
  (`toBeVisible` on a generic item) cannot tell a stale list from a fresh one.
  Identity-based waits can.
- **Empty is a state, not an absence.** If the target section can be empty, the
  application must render an explicit empty-state element, or the wait has no
  terminal condition and the test deadlocks on a healthy page.

This is application-honesty work, not test trickery: the attribute is real
rendered state, useful for debugging in devtools, and costs one binding.

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
tests must wait on identity, not presence. The
[three-run rule under parallel workers](/kb/testing/no-retries-no-flakes) is the
backstop — presence-based waits over out-of-band data are exactly the class of
race that parallelism flushes out.
