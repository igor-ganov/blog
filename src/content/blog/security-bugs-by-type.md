---
title: 'Security bugs, by type'
description: 'A terse field catalog of the security defects worth recognising on sight — each as problem, risk, fix. No narrative, no project. Boundaries, auth, supply chain, availability, exposure.'
date: 2026-06-12
tags: [security, ci, platform]
order: 6
---

A reference, not an essay. Each entry is a defect class: what it is, why it
bites, how it closes. Grouped by where it lives.

## Request boundaries

**Open relay / SSRF proxy.** A proxy that builds the upstream URL from the
request path and forwards client headers. Risk: anyone uses your origin to
reach arbitrary hosts, and forwarded `Authorization`/`Cookie` leaks
credentials to them. Fix: allowlist host *and* path by regex, validate the
`Origin`, strip auth/cookie headers before forwarding.

**Stored XSS via a markup sink.** Markdown (or any user text) rendered to HTML
and injected through `innerHTML`/`v-html` without sanitising. Risk: rendered
output is attacker HTML; `<img onerror>` runs in the viewer's session — and
the viewer is usually a higher privilege than the author. Fix: sanitise at the
injection point (DOMPurify); treat every rendered string as hostile.

**Silent failure across a trust boundary.** A handler that doesn't throw on a
non-OK upstream response, or an empty `catch`. Risk: a failed authz check or a
partial write looks like success; the security step is skipped quietly. Fix:
throw on every `!res.ok`; never swallow — rethrow, log, or surface.

## Authentication & authorization

**Confused deputy.** A privileged endpoint (role change, invite, write)
holding a powerful token but not checking the *caller's* authorization. Risk:
any same-origin script makes the deputy act with its token — e.g. self-promote
to admin. Fix: re-check the caller's role in every privileged handler, not just
the ones that "feel" sensitive.

**OAuth without `state`.** An authorize URL that omits the `state` parameter
and a callback that doesn't validate it. Risk: login CSRF — an attacker
fixates the victim into the attacker's session. Fix: generate random `state`,
persist it, reject the callback on mismatch.

**`postMessage` to `'*'`.** Posting a token or secret to a wildcard target
origin. Risk: any origin that frames the page receives it. Fix: pass an
explicit, allowlisted target origin.

**GET that mutates.** A state change (unsubscribe, delete, toggle) behind a GET
request. Risk: mail prefetchers, link scanners, and `<img>` tags trigger it;
it's CSRF-able by construction. Fix: GET is read-only; mutate on POST behind a
confirm step.

**Over-broad token scope.** A browser-held token carrying more scope than the
client needs (e.g. org-admin in a public SPA). Risk: any XSS or leak escalates
straight to that scope. Fix: mint the minimal scope per audience.

## Supply chain & CI

**Default-permissive workflow token.** A pipeline with no `permissions:` block
runs on a write-all token. Risk: any compromised step or action can push code,
cut releases, edit issues. Fix: `permissions: contents: read` at top level,
widen per-job only where needed.

**Unpinned action next to a secret.** A third-party action referenced by
mutable tag in a job that holds a credential. Risk: the tag owner moves it; the
next run executes their code with your secret. No CVE required. Fix: pin to a
commit SHA; let a bot keep the pins fresh so they don't rot.

**Scanning disabled.** Secret scanning and push protection off. Risk: a
committed credential is never flagged, and the next push can add another. Fix:
enable both org-wide; classify findings honestly so the signal stays credible
(a deliberate test fixture is resolved *as* a test fixture, not ignored).

**Dead manifest = phantom attack surface.** A lockfile you migrated away from,
still in the tree. Risk: it's scanned like a live one — alerts (often
critical) for dependencies nobody installs, and the noise trains you to skim
past real alerts. Fix: delete every manifest you no longer use.

## Availability & cost

**Unbounded resource on a metered backend.** A room/channel/queue that accepts
unlimited participants and unbounded message fields, billed per unit of work.
Risk: N participants give N² broadcast amplification — a cost-DoS on someone
else's wallet, plus memory blowups. Fix: cap participants, bound every schema
field, reject oversized frames through the existing validation path.

## Data exposure & privacy

**Confidential data class in a public store.** A public repo (or bucket)
accumulating logs, telemetry, or attachments. Risk: the *class* of data is
sensitive regardless of how benign today's sample looks — and nobody
re-reviews a sink after each schema change. Fix: judge by data class, not
current contents; make it private.

**Visibility change breaks anonymous URLs.** Flipping a store to private while
assets are referenced by anonymous-only URLs (e.g. raw content links). Risk:
either the assets 404 for everyone, or the store is kept public for
convenience. Fix: reference assets by an authenticated URL that checks
membership; accept that anonymous embeds are gone.

**Identity in git history.** Personal emails or names baked into commits across
repos. Risk: trivial deanonymisation by reading `git log`. Fix: rewrite with a
mailmap and force-push — but know the limits: host-side PR/issue metadata and
public event archives persist beyond the rewrite, so plan removals on those
surfaces separately.

## The thread

Most of these aren't clever exploits — they're a boundary that moved (a proxy
relocated, a repo went private, a token widened) or a default nobody changed (a
write-all token, scanning off, a `state`-less flow). The recognisable shape is
the value: you fix a class once, then you spot it on sight everywhere else.
