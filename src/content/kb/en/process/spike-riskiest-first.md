---
title: 'Spike the riskiest assumption before building features'
category: process
summary: 'Fix the biggest unknown with a half-day spike before writing features; keep forward-compatibility as discipline rather than building the machinery early.'
principle: 'Fix the biggest unknown with a half-day spike before building features; keep forward-compatibility as discipline (thread userId, key storage, pure pipeline) rather than building the machinery early.'
severity: strong
tags: [process, spike, poc, risk, architecture, forward-compatibility]
sources:
  - project: 'a Cloudflare Workers service (PoC)'
    date: 2026-05-22
    note: 'spike riskiest assumption first; forward-compat as discipline; do not over-engineer the PoC'
related:
  - process/spec-driven-ears-not-user-stories
  - functional-architecture/one-function-per-file-folder-by-usage
order: 6
updated: 2026-06-10
---

Every new architecture rests on at least one assumption nobody has validated in this
specific combination of technology, scale, and environment. If you build features on top
of that assumption and it turns out to be wrong, all the feature work is waste. A spike
is the minimum work needed to validate the riskiest assumption before any feature work
begins.

There is an opposite trap, which is over-engineering the PoC. You add multi-user
machinery, real billing, dashboards, and encryption before anyone has checked whether
the core gamble pays off. Skipping the spike wastes time; so does building too much in
the PoC.

## Why this matters

A Cloudflare Workers service PoC (2026-05-22) made the architecture tradeoff explicit. The
whole project rested on one technical bet: can `mtcute` (an MTProto client library) run
on Cloudflare Workers' `workerd` runtime and hold a persistent MTProto session? If it
could not, the hosting choice was wrong and everything built on top of it would collapse
with it.

So we made the spike task zero. Not task three, not "we will cross that bridge when we
get to it." The spike was defined concretely:

> Worker → mtcute → own Telegram session → read N messages

Green means the architecture is valid. Red means switch hosting immediately, before
any feature code has been written.

The second lesson from the same project was the difference between forward-compatible
discipline and forward-compatible machinery. The PoC was designed to grow into a
multi-user system, but it did not need to be one on day one. The discipline costs almost
nothing: thread `userId` through every function signature, use user-scoped storage keys
from day one (`user:<id>:cursor:<channel>`), and keep the pipeline as a pure function.
Building the actual multi-user machinery (auth flows, session encryption, billing checks,
admin dashboards) before the core PoC is validated costs weeks, and all of it is wasted
if the spike fails.

## How to apply

### Define the spike

A spike is not a prototype of the full feature. It is the minimum runnable code that
answers one specific question, and the question is always whether the riskiest assumption
holds.

Before writing the spike, write the question down explicitly:

```markdown
Spike goal: Confirm that mtcute runs on workerd and holds an MTProto session.

Success criteria:
- A Cloudflare Worker using mtcute can authenticate with Telegram.
- The session persists across Worker invocations (via KV or Durable Object).
- Reading N messages from a channel completes without errors.

Failure criteria:
- mtcute fails to compile for the workerd target.
- The Worker hits memory or CPU limits under normal use.
- Session storage does not survive between invocations.

Time box: half a day (4 hours).
```

The time box is not negotiable. A spike that drags on for a week was either scoped wrong,
or the assumption turned out to be more complex than expected. In the second case the
complexity itself is the finding, and the architecture decision needs to be revisited.

### Identify the riskiest assumption

Common candidates for the riskiest assumption:

- A library that has never been run in the target runtime (workerd, Deno, Bun, a
  specific browser engine).
- A latency or throughput requirement that depends on an external service that has
  not been measured.
- An API that is documented but whose behaviour at the relevant scale or edge case has
  not been tested.
- An integration between two systems where the protocol documentation is ambiguous.

The riskiest assumption is the one where being wrong throws away the most work. Start
there.

### Forward-compatibility as discipline

After the spike passes, resist the urge to build supporting infrastructure that is
"almost needed." Here is what the discipline looks like in practice.

**Thread the growth axis, do not build it.**

```ts
// Forward-compatible: userId is in every function signature from day one,
// hardcoded to one value. Adding multi-user later is a config change.
const fetchDigest = (config: Config, userId: UserId, cursor: Cursor) =>
  pipeline(config, userId, cursor);

// Not forward-compatible: userId is implicit or global.
// Adding multi-user later requires rewriting every function.
const fetchDigest = (config: Config, cursor: Cursor) =>
  pipeline(config, cursor);
```

**Namespace storage keys from day one.**

```ts
// Forward-compatible: user-scoped key, one user hardcoded.
const cursorKey = `user:${userId}:cursor:${channelId}`;

// Not forward-compatible: global key that will conflict when multi-user arrives.
const cursorKey = `cursor:${channelId}`;
```

**Keep the pipeline pure.**

```ts
// Forward-compatible: pure function, no side effects, fully testable.
const buildDigest = (
  config: DigestConfig,
  cursor: Cursor,
  messages: readonly Message[],
): { digest: Digest; newCursor: Cursor } => { ... };

// Not forward-compatible: side-effecting pipeline that mixes I/O
// with transformation, preventing isolation testing.
const buildDigest = async (config: DigestConfig) => {
  const cursor = await kv.get('cursor');
  const messages = await fetchMessages(cursor);
  await kv.put('cursor', newCursor);
  return digest;
};
```

The forward-compatible versions cost one extra parameter or one extra namespace
separator. That is not premature abstraction. It is the smallest investment that avoids a
rewrite when the product grows.

### What the PoC must NOT build

The explicit list from that PoC decision (2026-05-22):

- Other-users' login flows.
- Encryption of foreign Telegram sessions.
- Real billing logic (stub: `const isEntitled = () => true`).
- Admin dashboards.
- Configuration UI.

Each of these is a real concern, and each gets its own small spec once the PoC has
validated the core bet and the product direction is confirmed. Building them before
validation means over-engineering a prototype that may well be discarded.

## Anti-patterns

**Treating the spike as a prototype.** A spike answers one question. Once the question is
answered, the spike is done, even if the code is rough. Whether that code becomes
production code is a decision you make after the spike, not during it.

**Skipping the spike because "it will probably work."** The whole point of the spike is
that you do not actually know whether it will work. "Probably" is not a validated
architecture.

**Building forward-compatibility machinery instead of discipline.** Standing up a full
multi-tenant auth system "because we will need it eventually" before the core PoC works
is premature abstraction, not discipline. Discipline threads the data (userId in
signatures, namespaced keys). Machinery implements the flows (login, session management,
billing).

**Expanding the PoC scope incrementally.** The PoC validates the core bet. Every extra
concern that creeps in ("while I am here I will also add...") delays that validation and
raises the odds that the whole PoC has to be scrapped if the bet was wrong.

## See also

The spike-first approach and the forward-compatibility discipline are how the spec-driven
workflow starts when the architecture itself is not yet settled. A spec for an
architecture nobody has spiked is speculative. The requirements may be achievable and the
design sections may read as coherent, yet neither has been tested against the actual
runtime. The spike produces the evidence that makes the subsequent spec grounded.
