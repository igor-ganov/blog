---
title: "Nothing is \"done\" without production screenshot proof"
category: process
summary: 'Never claim it works without screenshot proof from the production environment and from a real mobile viewport; show screenshots, do not summarise them.'
principle: 'Never claim it works without screenshot proof from production (and from a real mobile viewport); show the screenshots, do not summarise them.'
severity: non-negotiable
tags: [process, testing, production, screenshots, mobile, verification]
sources:
  - project: 'a production observability tool'
    date: 2026-04-18
    note: 'no "it works" without prod screenshots; show, do not summarize'
  - project: 'a content-admin SPA'
    date: 2026-04-19
    note: 'mobile = folder of screenshots of every page from home'
related:
  - process/desktop-target-first
  - tooling-runtime/drive-the-real-browser-over-mcp
  - design-ux/mobile-proof-real-devices
order: 4
updated: 2026-06-10
---

"It works" is an assertion without evidence. Local green tests, a passing CI pipeline,
and a working dev server are necessary conditions — they are not sufficient proof that
the production deployment is correct. Production is a different environment: different
assets (potentially stale from a cached service worker), different branch pins in
browser storage, different CSP headers, different CDN caching behaviour. These
differences have caused production failures after local and CI success multiple times.

The rule is non-negotiable: **every "done" claim must be backed by screenshots from
production, shown in the response, not summarised.**

## Why this matters

The production observability tool incident (2026-04-18) established this rule with concrete failures.
The specific failure modes that drove it:

1. **Stale service worker serving old assets.** A new deployment was live; the browser
   was being served by a cached service worker that was still fetching the previous
   bundle. Local tests ran against the new code. Production users saw the old code. A
   screenshot from production's URL — not localhost — would have caught this
   immediately.

2. **Wrong branch pinned in IndexedDB.** The app stored configuration in IndexedDB
   keyed on a branch identifier. A deploy to a different branch was correct in
   isolation but was being overridden by a stale key in the browser's IndexedDB from
   a previous deploy. No local test exercises the production IndexedDB state.

3. **CDN cache serving stale HTML.** The HTML shell was cached at the edge. A
   deployment that changed the asset hash references in the HTML was live at the
   origin but the CDN was still serving the old HTML, causing mismatched asset hashes
   and load failures. Visible immediately in a production screenshot; invisible in any
   test environment.

In each case, the fix was visible within seconds of looking at the actual production
URL in a real browser. The failure was invisible from any test environment.

The content-admin SPA mobile incident (2026-04-19) added a second dimension: mobile work
that was "done" without real-browser mobile verification was not done. The acceptance
criteria from that incident remain standing: mobile work is accepted only as a folder
of screenshots of every affected page at mobile viewport, starting from the home page.

## How to apply

### Taking production screenshots

Use the Chrome DevTools MCP or the Playwright screenshot API pointed at the
production URL — not localhost, not the staging preview, not the dev server. The
screenshot must come from the same URL a real user would open.

```ts
// Playwright against production — the URL is the deployed origin.
const page = await context.newPage();
await page.goto('https://your-production-domain.com/path');
await page.screenshot({ path: 'proof/feature-desktop.png', fullPage: true });
```

The screenshot files are attached to the PR or pasted in the response. They are
shown, not described. "The page looks correct" is not evidence. The screenshot is.

### Mobile viewport coverage

For any change that touches a UI visible on mobile:

1. Open Chrome DevTools on the production URL.
2. Enable device emulation or connect a real device.
3. Start from the home page and navigate to every page affected by the change.
4. Take a screenshot of each page at the mobile viewport.

The folder structure for a mobile verification pass:

```
proof/
  mobile/
    01-home.png
    02-article-list.png
    03-article-detail.png
    04-settings.png
```

Every page, in order, starting from home. The folder is attached to the PR. If a page
is missing, the mobile verification is incomplete.

### What counts as production

Production is the environment real users access. In order of preference:

1. The live production domain.
2. A staging environment that is identical to production in all runtime
   characteristics (same CDN, same service worker, same env vars baked in).

A Vercel preview deployment from the PR branch is acceptable for pre-merge
verification if it is the deployment that will become production (i.e., it uses the
same infrastructure). A Vite dev server is not acceptable.

### The service worker check

If the application uses a service worker, the production screenshot verification must
include confirming the correct service worker version is active:

1. Open DevTools → Application → Service Workers.
2. Confirm the service worker version matches the deployed commit.
3. If the old service worker is still active, click "Update" or clear site data and
   reload.
4. Re-take the screenshots after confirming the correct version is running.

A screenshot from production with a stale service worker active is not valid evidence.

### Console and network

After taking visual screenshots, check the DevTools console and network panel:

- No uncaught errors.
- No failed network requests (4xx or 5xx on resources the app depends on).
- No Content Security Policy violations.

If any of these are present, the feature is not done — it is broken in production.

## Anti-patterns

**Summarising screenshots instead of showing them.** "I verified on mobile and it
looks fine" is not a mobile verification. The screenshots must be visible in the
response or attached to the PR.

**Using the dev server as a production proxy.** `localhost:5173` is not production.
Service workers, CDN caching, and environment-variable baking do not apply there.

**Only checking the changed page.** A change to a shared component or a global style
can break pages that were not explicitly tested. The mobile verification folder starts
from the home page for exactly this reason.

**Claiming the CI screenshot is the production screenshot.** CI screenshots a Playwright
browser against a dev build or a preview URL. Unless that URL is the actual production
deployment with the same runtime characteristics, it is not production evidence.

**Skipping the check for "trivial" changes.** The stale service worker failure was
triggered by what looked like a trivial asset change. There is no threshold below
which production verification can be skipped.

## Enforcement

The delivery definition of done: a PR is complete when it includes production
screenshots (desktop and mobile if UI is involved) attached or embedded in the PR
description. A PR without screenshots for a UI change is not ready for merge.

The standing override: if an instruction is given to connect to a Chrome instance or open
the browser via a token and that instruction is ignored in favour of a local test, the
work has not been done. A request to use a specific browser or environment
is an instruction, not a suggestion.
