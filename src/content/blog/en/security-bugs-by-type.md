---
title: 'Security bugs, by type'
description: 'A terse field catalog of the security defects worth recognising on sight — each as problem, risk, fix. No narrative, no project. Boundaries, auth, supply chain, availability, exposure.'
date: 2026-06-12
tags: [security, ci, platform]
order: 6
---

A reference you can scan. Each entry is a defect class with three parts: what
it is, why it bites, how it closes. Grouped by where the defect tends to live.

## Request boundaries

**Open relay / SSRF proxy.** A proxy that builds the upstream URL from the
request path and forwards client headers. Risk: anyone can use your origin to
reach arbitrary hosts, and any forwarded `Authorization`/`Cookie` leaks
credentials to those hosts. Fix: allowlist host *and* path by regex, validate
the `Origin`, and strip auth/cookie headers before forwarding.

**Stored XSS via a markup sink.** Markdown (or any user text) rendered to HTML
and injected through `innerHTML`/`v-html` without sanitising. Risk: the
rendered output is attacker HTML, so `<img onerror>` runs in the viewer's
session, and the viewer usually holds higher privilege than the author. Fix:
sanitise at the injection point (DOMPurify) and treat every rendered string as
hostile.

**Silent failure across a trust boundary.** A handler that doesn't throw on a
non-OK upstream response, or an empty `catch`. Risk: a failed authz check or a
partial write looks like success, so the security step gets skipped without a
trace. Fix: throw on every `!res.ok`, and never swallow an error. Rethrow it,
log it, or surface it.

## Authentication & authorization

**Confused deputy.** A privileged endpoint (role change, invite, write) that
holds a powerful token but never checks the *caller's* authorization. Risk: any
same-origin script can make the deputy act with its token, for instance to
self-promote to admin. Fix: re-check the caller's role in every privileged
handler, not just the ones that happen to feel sensitive.

**OAuth without `state`.** An authorize URL that omits the `state` parameter
and a callback that doesn't validate it. Risk: login CSRF, where an attacker
fixates the victim into the attacker's session. Fix: generate a random `state`,
persist it, and reject the callback on mismatch.

**`postMessage` to `'*'`.** Posting a token or secret to a wildcard target
origin. Risk: any origin that frames the page receives it. Fix: pass an
explicit, allowlisted target origin.

**GET that mutates.** A state change (unsubscribe, delete, toggle) sitting
behind a GET request. Risk: mail prefetchers, link scanners, and `<img>` tags
all trigger it, so it's CSRF-able by construction. Fix: keep GET read-only and
move the mutation to a POST behind a confirm step.

**Over-broad token scope.** A browser-held token carrying more scope than the
client needs, like org-admin in a public SPA. Risk: any XSS or leak escalates
straight to that scope. Fix: mint the minimal scope for each audience.

## Supply chain & CI

**Default-permissive workflow token.** A pipeline with no `permissions:` block
runs on a write-all token. Risk: any compromised step or action can push code,
cut releases, or edit issues. Fix: set `permissions: contents: read` at the top
level, then widen per-job only where a job actually needs it.

**Unpinned action next to a secret.** A third-party action referenced by a
mutable tag in a job that holds a credential. Risk: the tag owner moves it, and
the next run executes their code with your secret. No CVE required. Fix: pin to
a commit SHA, and let a bot keep the pins fresh so they don't rot.

**Scanning disabled.** Secret scanning and push protection turned off. Risk: a
committed credential is never flagged, and the next push can add another. Fix:
enable both org-wide, and classify findings honestly so the signal stays
credible. A deliberate test fixture should be resolved *as* a test fixture
rather than ignored.

**Dead manifest = phantom attack surface.** A lockfile you migrated away from
that still sits in the tree. Risk: scanners treat it like a live one and raise
alerts (often critical) for dependencies nobody installs, and that noise trains
you to skim past the real alerts. Fix: delete every manifest you no longer use.

## Availability & cost

**Unbounded resource on a metered backend.** A room/channel/queue that accepts
unlimited participants and unbounded message fields, billed per unit of work.
Risk: N participants give N² broadcast amplification, which is a cost-DoS on
someone else's wallet on top of the memory blowups. Fix: cap participants,
bound every schema field, and reject oversized frames through the existing
validation path.

## Data exposure & privacy

**Confidential data class in a public store.** A public repo (or bucket)
accumulating logs, telemetry, or attachments. Risk: the *class* of data is
sensitive no matter how benign today's sample looks, and nobody re-reviews a
sink after each schema change. Fix: judge by data class rather than current
contents, and make the store private.

**Visibility change breaks anonymous URLs.** Flipping a store to private while
its assets are referenced by anonymous-only URLs, such as raw content links.
Risk: the assets either 404 for everyone, or the store stays public for
convenience. Fix: reference assets by an authenticated URL that checks
membership, and accept that anonymous embeds are gone.

**Identity in git history.** Personal emails or names baked into commits across
repos. Risk: trivial deanonymisation by reading `git log`. Fix: rewrite with a
mailmap and force-push, but know the limits. Host-side PR/issue metadata and
public event archives persist beyond the rewrite, so plan removals on those
surfaces separately.

## The thread

Most of these aren't clever exploits. They're a boundary that moved (a proxy
relocated, a repo went private, a token widened) or a default nobody changed (a
write-all token, scanning off, a `state`-less flow). The shape is what's worth
carrying around, since recognising the class is most of the work once you've fixed
it once.
