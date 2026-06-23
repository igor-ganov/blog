---
title: 'Origin-scoped storage is a privacy boundary, not a limitation'
category: platform
summary: 'localStorage is origin-scoped by design; cross-site visit tracking is impossible without building tracker infrastructure. Treat the origin boundary as a privacy feature and prefer per-origin local signals.'
principle: 'localStorage is origin-scoped by design; cross-site visit tracking is impossible without a tracker (3p cookies / shared iframe / backend) — respect that rather than reaching for one.'
severity: context
tags: [platform, localstorage, privacy, webring, same-origin, storage]
sources:
  - project: 'a privacy-first embeddable widget'
    date: 2026-05-21
    note: 'localStorage origin-scoped; no cross-site tracking without a tracker; respect the privacy boundary'
related:
  - platform/cross-origin-auth-survives-cookie-blocking
order: 4
updated: 2026-05-21
---

`localStorage` is scoped to an origin, meaning the combination of scheme, host, and port. A
page on `site-a.example.com` cannot read `localStorage` from `site-b.example.com`. That is
the same-origin policy applied to storage. It is a deliberate privacy boundary, not a
browser limitation you have to route around. For any feature that spans multiple sites the
consequence is plain: from site A you cannot tell whether the user has visited site B
unless you build infrastructure specifically to share that fact, and that infrastructure is
a tracker.

On a privacy-first embeddable widget (2026-05-21) the feature we wanted was a
"least-recently-visited" preference for ordering the webring's outbound links, so that
sites the user hadn't visited recently would float to the top. The obvious design, reading
visit history out of each member site's `localStorage` and aggregating it, can't be done
without a shared backend or a third-party tracking mechanism, and both of those flatly
contradict the widget's privacy stance. What we shipped instead records per-origin click
intent: when the user clicks a webring link, that click lands in `localStorage` on the
widget's own origin. Ordering keys off outbound click recency rather than visit history.
The boundary stays intact and the feature still does its job.

## Why this matters

### The same-origin policy for storage

Every origin has a separate `localStorage` namespace. Reading across origins requires
one of:

- **Third-party cookies** — a cookie sent by a resource loaded from origin B while the
  user is on page A. Blocked by default in Chrome's Privacy Sandbox roll-out since 2024.
- **A shared iframe** — origin B loads in an iframe on page A; the iframe reads its own
  `localStorage` and `postMessage`s the result to A. Possible, but it is a cross-site
  tracking mechanism.
- **A shared backend** — both sites report to a common API; the API aggregates visit
  data across origins. Requires user identification (session or fingerprint) — this is
  a tracker.

None of these are neutral. Each one is a deliberate engineering choice to build cross-site
visibility, and each one trades away some user privacy to do it. The boundary is the
correct default, not a bug you have to defeat.

### The webring use case

A webring is a circular collection of independent sites linked by a common nav widget.
The original concept (circa 1995) had a central registry. Modern webrings usually run as a
decentralised widget that each member site embeds. So the question is how the widget should
order or pick the "next site" link.

Options that would require tracking:
- "Next unvisited site" — requires knowing which sites the user has visited.
- "Least-recently visited" across all member sites — requires cross-site visit history.

Options that work within the privacy boundary:
- Random selection — no state required.
- Round-robin by position — no state required.
- Least-recently **clicked** (in the webring widget itself) — outbound clicks are
  recorded on the webring origin; no cross-site data needed.
- Time-based diversity (weight sites not clicked recently by the widget) — same.

The click-intent approach reframes the question into one `localStorage` can actually
answer: "which sites has the user navigated to through this widget, from this origin?"
That replaces "which sites has the user visited?", which can only be answered with
cross-origin data.

## How to apply

### Record click intent on the local origin

```ts
// src/webring/click-history.ts

const HISTORY_KEY = 'webring:click-history';
const MAX_ENTRIES = 50;

interface ClickEntry {
  readonly siteId: string;
  readonly clickedAt: number; // Unix ms
}

const readHistory = (): readonly ClickEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ClickEntry[]) : [];
  } catch {
    return [];
  }
};

const writeHistory = (entries: readonly ClickEntry[]): void => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Storage quota exceeded — degrade gracefully, do not crash.
  }
};

export const recordClick = (siteId: string): void => {
  const history = readHistory();
  const next: ClickEntry[] = [
    { siteId, clickedAt: Date.now() },
    ...history.filter((e) => e.siteId !== siteId), // deduplicate
  ].slice(0, MAX_ENTRIES);
  writeHistory(next);
};

export const getLastClickedAt = (siteId: string): number | undefined =>
  readHistory().find((e) => e.siteId === siteId)?.clickedAt;
```

### Order webring sites by click recency

```ts
// src/webring/order-sites.ts

import { getLastClickedAt } from './click-history';

interface WebringSite {
  readonly id: string;
  readonly url: string;
  readonly name: string;
}

/**
 * Returns sites ordered so least-recently-clicked appear first.
 * Sites never clicked are considered oldest (last-clicked = 0).
 * This uses only per-origin click intent — no cross-site tracking.
 */
export const orderByClickRecency = (
  sites: readonly WebringSite[],
): readonly WebringSite[] =>
  [...sites].sort(
    (a, b) => (getLastClickedAt(a.id) ?? 0) - (getLastClickedAt(b.id) ?? 0),
  );
```

### Communicate the privacy stance in the UI

If the webring widget has an "about" or info state, frame the ordering behaviour in
terms of its privacy properties:

```html
<!-- Widget info tooltip — communicates what data is and is not collected -->
<p>
  The next-site order is based on your outbound clicks within this widget,
  stored locally in your browser. No visit data is shared with any server
  or other site.
</p>
```

That copy is accurate and it earns trust. The feature isn't crippled by its inability to
track cross-site visits; declining to track is the whole point.

### When cross-site state is genuinely required

Some requirements really do need cross-site state, such as a user account that syncs
preferences across devices or a distributed comment system. For those, the right
architecture is an explicit, user-authenticated backend. The user logs in, the backend
stores state against their account, and the client reads it back on any device. That isn't
a tracker; it's a data relationship the user opted into knowingly.

The distinction:
- **Tracker**: collects data without explicit user awareness; often fingerprint or
  cookie-based; no user account required; user cannot inspect or delete it easily.
- **Authenticated backend**: user chooses to create an account; data is tied to
  the account; user can view, export, and delete it.

The webring case neither requires nor justifies an authenticated backend. Per-origin
click intent is enough, and it's the right call.

## Anti-patterns

**Shared iframe + postMessage for cross-site storage access**

```ts
// Anti-pattern: loading a shared origin in an iframe to read its localStorage.
// This is a tracking mechanism dressed as a feature.
const iframe = document.createElement('iframe');
iframe.src = 'https://tracker.webring.example/storage-bridge.html';
iframe.style.display = 'none';
document.body.appendChild(iframe);
iframe.contentWindow?.postMessage({ type: 'GET', key: 'visit-history' }, '*');
window.addEventListener('message', (e) => {
  if (e.origin === 'https://tracker.webring.example') {
    const visitHistory = e.data;
    // Now we have cross-site visit data. This is a tracker.
  }
});
```

Don't build this. It deliberately bypasses the same-origin boundary and amounts to
cross-site tracking whether or not the data ever gets sold or shared externally.

**Treating `localStorage` capacity errors as blocking**

`localStorage` quota varies by browser and origin, typically 5–10 MB, and often less on
mobile. A write past the quota throws a `QuotaExceededError`. Catch it and degrade to no
persistence rather than letting it crash the page.

```ts
// Anti-pattern: unguarded write — throws if quota exceeded.
localStorage.setItem('key', JSON.stringify(largeData));

// Good: quota error is caught and degraded silently.
try {
  localStorage.setItem('key', JSON.stringify(largeData));
} catch (error) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    // Degrade: operate without persistence for this session.
    return;
  }
  throw error; // other errors are not expected and should propagate
}
```

**Using `localStorage` for sensitive data**

Any JavaScript on the same origin can read `localStorage`, including scripts injected by
third-party tag managers or by a compromised dependency. Keep session tokens, access
tokens, and personal data out of it. Use `sessionStorage` for session tokens, since it
clears on tab close, and server-side session stores for long-lived credentials.

## See also

[Cross-origin auth that survives third-party-cookie blocking](/principles/platform/cross-origin-auth-survives-cookie-blocking) —
the flip side of the same boundary: when your own site and API live on different origins,
cookies don't flow either. The privacy boundary applies to your own architecture too, not
only to third-party trackers.
