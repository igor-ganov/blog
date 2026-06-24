---
title: 'Audit your own admin like you didn''t write it'
description: 'A self-audit of a working pet-project admin found three criticals in an afternoon: an open proxy relay, stored XSS in the editor preview, and a confused-deputy Service Worker. Every one was a boundary that moved after the code was written.'
date: 2026-06-11
tags: [security, platform, ci]
order: 5
---

The admin had OAuth with PKCE, a roles file, parameterized D1 queries, HMAC-signed
unsubscribe tokens with constant-time comparison, and JWTs that verified the signature
before decoding. By checklist standards it was a careful codebase. A structured
audit still found three criticals in an afternoon, and the pattern behind them is
worth more than the findings themselves: every one was a boundary that moved after the code
around it was written.

## The proxy that lost its threat model in a port

Browsers can't speak git smart-HTTP to GitHub, because those endpoints carry no CORS
headers, so the admin proxies git traffic through a tiny worker route. The original
implementation was a standalone Cloudflare Worker with a hardcoded `github.com`
host pin and an `ALLOWED_ORIGINS` check. At some point the proxy moved in-app, to a
Hono route on the same worker that serves the SPA.

The port kept the twenty lines that did the work and dropped the ten that did the
security. The deployed route built `https://${path}` straight from the request
path, reflected any `Origin`, and forwarded every header (`Authorization`
included) to whatever host the path named. That is an open relay with credential
forwarding, sitting on the production domain, [exactly the thing the standalone
version was built not to be](/principles/platform/proxy-must-pin-targets).

Nobody decided to remove the allowlist. It evaporated in translation, because the
port was reviewed as "same feature, new location" rather than as new attack
surface. Code that exists to enforce a boundary doesn't survive refactors by
default. It survives when the boundary is written down somewhere the refactor has
to confront it.

## The preview pane that trusted its writers

The editor preview piped `marked` output into `v-html`, with no sanitizer anywhere in the
dependency tree. The reflex objection here is "it's our own content repo, it's trusted
input", and that dissolves the moment you look at who writes and who reads. Editors
(the lowest role) write posts. Chief editors and admins review them in that
preview, logged into sessions whose GitHub token carries `admin:org`.

So there is a privilege boundary running straight through the middle of a feature, and
[markdown output is attacker HTML](/principles/platform/sanitize-html-before-injection) on
the wrong side of it. One `<img onerror>` in a draft, and the review workflow
itself delivers an org-admin token to whoever asked for review. The fix is one
DOMPurify call at the injection point plus a test file enumerating the vectors. The
cost is almost nothing. The only hard part was noticing that "trusted content" had
quietly become "content from a lower privilege level".

## The Service Worker that did what anyone asked

The SW holds the user's token and exposes privileged routes: change a user's org
role, send an invitation. The roles-config routes next to them checked the caller's
role. These didn't. Anyone with same-origin script execution could POST a
self-promotion to admin, and the SW, [a classic confused
deputy](/principles/platform/confused-deputy-in-the-service-worker), would sign it with
the stored admin token.

Chained with the preview XSS, that's editor to org admin in one crafted post. Any
finding on its own was a contained mistake, but the chain is what made the afternoon
worthwhile. Audits that stop at "found an XSS, file a ticket" miss that the
severity of finding N depends on findings N+1 through N+3.

## The boring layer was also wrong

CI had zero `permissions:` blocks across nine workflows in two repos, every action
pinned to a mutable tag, and a PAT in job-level env on a `pull_request` trigger.
None of that is exotic. It's the [default state of GitHub
Actions](/principles/build-ci-deploy/least-privilege-workflows), which is precisely why
it's everywhere. The fix is mechanical: one permissions block, SHA pins, dependabot
to keep them moving, step-scoped secrets behind a same-repo guard. It took less
time than writing it up.

One more default worth naming. The unsubscribe link flipped subscriber state on
GET. Mail clients prefetch links, and antivirus scanners follow them, so people were one
Outlook safe-links pass away from being silently unsubscribed. A GET handler that
mutates is a bug class, not a style preference.

## What actually generalises

- **Re-audit after relocation.** A proxy moved in-app, a handler copied for a new
  route, an auth flow lifted into a popup: each port re-opens questions the
  original already answered. Diff the *protections*, not just the behaviour.
- **Write the threat model where the code is.** The host pin that died in the port
  would have survived as a `cors-allow.ts` module with tests asserting 403s. A refactor
  has to make those tests pass, so it can't quietly drop the protection.
- **Trust labels rot.** "Trusted content", "internal endpoint", "our own repo":
  every one of those phrases in a comment is a TODO to check who's actually on
  each side of the boundary today.
- **Audit in parallel, fix in series.** Three focused passes (server surface,
  client/auth, CI/supply-chain) found in hours what one generalist pass smears
  into days. The fixes then landed as one reviewed PR with a test per finding.

A self-audit rarely turns up sloppy code. What it turns up is code that faithfully
preserved decisions whose context had expired. The checklist hygiene held everywhere,
from parameterized queries to constant-time compares. What failed was everything that
had moved.
