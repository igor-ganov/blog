---
title: 'Security lives in the long tail'
description: 'Hardening the flagship repo is the easy half. A one-afternoon pass over the other fifteen repos of the same org found disabled scanning everywhere, an unpinned third-party action holding a deploy token, eleven critical-flagged alerts pointing at a lockfile nobody used, and a public repo quietly collecting admin telemetry.'
date: 2026-06-12
tags: [security, ci, platform]
order: 6
---

The day after auditing the flagship admin panel — proxy pinned, XSS sanitized,
confused deputy fired — the obvious question was the one the audit had quietly
assumed away: what about the *other* fifteen repositories in the organisation?
The answer took an afternoon to collect and was uncomfortable in a specific,
instructive way. Nothing in the tail was exotic. Every finding was a default
nobody had changed, a file nobody had deleted, or a decision nobody had
re-examined since the day it was made. An attacker enumerating the org would
not have started with the hardened flagship, and that is the whole point:
**your security posture is the posture of your most forgotten repo**, because
the repos share an organisation, a token namespace, and a supply chain.

## Defaults are a posture you didn't choose

Across fifteen repos: secret scanning off, push protection off, vulnerability
alerts off, not one `dependabot.yml`, not one `permissions:` block, every
action on a mutable tag. None of that was a decision — it is simply [what a
GitHub repo looks like](/kb/build-ci-deploy/least-privilege-workflows) until
someone intervenes, multiplied by the number of times someone ran `git init`
and moved on.

The encouraging half: the bulk of the fix is mechanical and API-able. One loop
enabled scanning, push protection, and alerts on all sixteen repos; one
templated patch added least-privilege permissions, SHA pins, and dependabot to
every workflow. The afternoon was mostly waiting for CI.

The first scan paid out immediately: two alerts on the flagship itself. Both
were deliberately fake webhook secrets in test fixtures — and resolving them
*as* `used_in_tests`, with a comment decoding the base64 to show it spells
"testsecretkey", matters more than it looks. A scanner whose alerts get
dismissed without classification trains everyone to ignore it; a scanner whose
false positives are answered honestly stays credible for the day the alert is
real.

## The worst finding was twenty lines long

The content repository had a single workflow: on push, fire a
`repository_dispatch` to trigger the website deploy. To do that it holds a
cross-repo `DEPLOY_TOKEN`, and it handed that token to a **third-party action
referenced by mutable tag**. That is the entire supply-chain attack in one
line: the tag moves when someone else decides it moves, and the next content
push runs their code with your token. No CVE required, no dependency
confusion, no typosquatting — just a pointer you don't control in a job that
holds a credential you do.

Tag-pinning to a commit SHA costs nothing and removes the entire class;
dependabot's `github-actions` ecosystem keeps the pins moving so the pin never
becomes the staleness problem. The general rule ranks risk by *what the job
holds*, not what the action does: an unpinned linter in a permissionless job
is noise; an unpinned anything next to a secret is the first thing to fix.

## The phantom lockfile

Minutes after vulnerability alerts went live, the flagship lit up with eleven
findings — three critical. Shell-quote, js-cookie, fast-uri, a fastify stack
the app has never run. Every one resolved against `package-lock.json`: an npm
lockfile last touched in May, in a project whose actual lockfile is
`bun.lock`. The dependencies it described were installed by nobody, shipped
nowhere, executed never — and scanned faithfully.

Deleting the file closed all eleven alerts at once, and the lesson generalises
past npm: **your alert surface is every manifest in the tree, not the one you
use.** A dead lockfile is pure downside — it cannot pin anything, but it can
page you at critical severity and, worse, teach you to skim past red security
banners because "those are probably the phantom ones". Migration leftovers are
not clutter; they are credibility leaks in your own alerting.

## Dormant is not retired

The org carries an eight-repo WebRTC experiment, untouched since April — and
still deployed. Its Cloudflare workers answer traffic and bill by the
millisecond whether anyone remembers them or not. Reading the signaling server
found what dormant code usually hides: a room would accept unlimited
WebSockets and relay unbounded messages, which on a paid Durable Object is an
N² broadcast amplifier with someone else's wallet attached. The fix is the
boring kind that takes minutes once anyone actually looks — cap the room at
sixteen peers, bound every schema field, reject oversized frames through the
existing validation path.

Two judgement calls from the same review are worth naming because neither is
a finding. The signaling API runs wide-open CORS and answers room-state
queries to anyone — deliberately: the room UUID *is* the credential, a
capability URL, and locking origins would break the design rather than secure
it. And the TURN-credentials worker turned out to be a stub returning empty
ICE servers — nothing to steal today, but the moment it mints real HMAC
credentials it needs an origin allowlist, rate limiting, and short TTLs, and
that requirement is now written down where the implementer will trip over it.
Documenting what you deliberately left open is audit output too; otherwise the
next reviewer re-litigates it or, worse, "fixes" it.

## Data class beats data content

A public repo had been quietly accumulating ticket attachments — action
history captured from admin sessions. Inspected today, the JSON is benign:
navigation events, query strings already stripped by an earlier fix. But the
*class* of data is admin telemetry, and class is what you secure for, because
content drifts and nobody re-reviews a data sink after every schema change.
The repo went private.

The instructive part was the cost: flipping visibility broke the URL scheme.
Issue bodies embedded `raw.githubusercontent.com` links, which are
anonymous-only — on a private repo they die for everyone, GitHub's own image
proxy included. The fix moved attachments to `blob` URLs, which authenticate
the viewing org member, and accepted that inline image embeds are simply not
a thing private repos get. Privacy changes are URL-scheme changes; if the
plan is "just make it private", the plan is missing its second half.

## What the tail teaches

- **Audit the org, not the repo.** The flagship's threat model includes every
  repo that shares its tokens, its actions, its org membership. Enumerate
  like an attacker: by org listing, sorted by least-recently-touched.
- **Spend the mechanical fixes everywhere, immediately.** Scanning toggles,
  permissions blocks, SHA pins, dependabot — templated, API-driven, an
  afternoon for fifteen repos. The expensive-looking part is cheap.
- **Reserve the thinking for three calls**: classifying scanner findings
  honestly, naming what is deliberately open, and judging data by class
  rather than today's content. Those don't template — they are the audit.
- **Delete what you migrated away from.** Dead manifests, stub workflows,
  demo repos. Everything that exists gets scanned, billed, or believed.

The flagship audit's conclusion was that code preserves decisions whose
context expired. The tail's conclusion is one step bleaker and one step more
hopeful: most of the tail never had a decision to preserve — it shipped on
defaults — and that is precisely why an afternoon of mechanical work moves it
further than a week of cleverness moves the flagship.
