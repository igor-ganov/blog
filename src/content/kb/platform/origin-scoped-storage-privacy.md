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

`localStorage` is scoped to an origin — the combination of scheme, host, and port. A
page on `site-a.example.com` cannot read `localStorage` from `site-b.example.com`. This
is the same-origin policy applied to storage, and it is not a browser limitation to
work around — it is a deliberate privacy boundary. The consequence for features that
span multiple sites is straightforward: you cannot know from site A whether the user has
visited site B, unless you build infrastructure specifically to share that knowledge.
Building that infrastructure is building a tracker.

On a privacy-first embeddable widget (2026-05-21) the desired feature was a
"least-recently-visited" preference for the webring's outbound link ordering: sites the
user had not visited recently should be prioritised. The naive design — read visit
history from each member site's `localStorage` and aggregate — is impossible without
either a shared backend or a third-party tracking mechanism, both of which contradict the
widget's privacy stance. The implemented solution uses per-origin local click intent:
when the user clicks a webring link, that click is recorded in `localStorage` on the
widget's own origin. The ordering is based on outbound click recency, not visit history.
The boundary is respected; the feature still works.

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

None of these options are neutral. Each requires a deliberate engineering choice to
build cross-site visibility, and each involves a tradeoff against user privacy. The
boundary is not a bug to work around; it is the correct default.

### The webring use case

A webring is a circular collection of independent sites linked by a common nav widget.
The original webring concept (circa 1995) had a central registry; modern webrings often
operate as a decentralised widget distributed to member sites. The challenge: how should
the widget order or select the "next site" link?

Options that would require tracking:
- "Next unvisited site" — requires knowing which sites the user has visited.
- "Least-recently visited" across all member sites — requires cross-site visit history.

Options that work within the privacy boundary:
- Random selection — no state required.
- Round-robin by position — no state required.
- Least-recently **clicked** (in the webring widget itself) — outbound clicks are
  recorded on the webring origin; no cross-site data needed.
- Time-based diversity (weight sites not clicked recently by the widget) — same.

The click-intent approach is the correct framing. It answers "which sites has the user
used this widget to navigate to, from this origin?" — a question that `localStorage`
can answer — rather than "which sites has the user visited?" — a question that requires
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

This is accurate and builds user trust. The feature is not "limited" because it cannot
track cross-site visits — it is privacy-respecting because it does not.

### When cross-site state is genuinely required

If the product requirement truly needs cross-site state (a user account that syncs
preferences across devices, or a distributed comment system), the right architecture is
an explicit, user-authenticated backend. The user logs in; the backend stores state
against their account; the client reads it on any device. This is not a tracker — it is
an explicit data relationship the user opted into.

The distinction:
- **Tracker**: collects data without explicit user awareness; often fingerprint or
  cookie-based; no user account required; user cannot inspect or delete it easily.
- **Authenticated backend**: user chooses to create an account; data is tied to
  the account; user can view, export, and delete it.

The webring use case does not require or justify an authenticated backend. Per-origin
click intent is sufficient and correct.

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

Do not build this. It bypasses the same-origin boundary intentionally and constitutes
cross-site tracking, regardless of whether the data is sold or shared externally.

**Treating `localStorage` capacity errors as blocking**

`localStorage` quota varies by browser and origin (typically 5–10 MB). On mobile it
may be lower. Writes that exceed quota throw a `QuotaExceededError`. This should be
caught and handled gracefully — degrade to no persistence, not to a crash.

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

`localStorage` is accessible to any JavaScript on the same origin, including injected
scripts from third-party tag managers or compromised dependencies. Session tokens,
access tokens, and personal data should not be stored in `localStorage`. Prefer
`sessionStorage` for session tokens (cleared on tab close) and server-side session
stores for long-lived credentials.

## See also

[Cross-origin auth that survives third-party-cookie blocking](/kb/platform/cross-origin-auth-survives-cookie-blocking) —
the complementary problem: when your own site and API are cross-origin, cookies do not
flow either. The privacy boundary applies to your own architecture, not just to
third-party trackers.
