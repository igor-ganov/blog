---
title: 'The non-negotiables'
description: 'Nine rules carry the highest severity badge on this site. Violating one is a defect, not a style disagreement. Here is what they have in common.'
date: 2026-06-11
tags: [meta, principles, type-safety, testing, error-handling]
order: 2
---

Every principle here carries a severity badge: `non-negotiable`, `strong`, `preferred`,
or `context`. Most are `strong`, which is the default you deviate from with a recorded
reason. Only nine are `non-negotiable`, and the label means what it says. Break one and
you have shipped a defect, not opened a style discussion you can win at review.

Looking at all nine together is useful, because what they share says more than any one of
them does alone.

## The nine

**Type safety has no escape hatch.**
[Never reach for `as`](/kb/typescript/no-casting). A cast overrules the compiler on the
one question it exists to answer. Model the types so inference comes out right, or validate
at the boundary. Don't lie to the checker.

**Errors are values or they propagate — never silence.**
[Never swallow an error](/kb/error-handling/never-swallow-errors), and
[always check `res.ok`](/kb/error-handling/always-check-res-ok). An empty `catch` and a
`fetch` whose status you never inspect are the same bug: a failure the code has decided to
pretend didn't happen. Those are the failures that turn into incidents.

**Tests synchronise on events, not on time.**
[No timeouts, ever](/kb/testing/event-driven-no-timeouts), and
[no retries, no flakes](/kb/testing/no-retries-no-flakes). A `waitForTimeout` hides either
a broken test or a non-deterministic app, and a retry hides a real race. Green means a
full, stable pass three times running, not "probably green".

**"Done" means proven, in the real thing.**
[Prove it with production-grade screenshots](/kb/process/prove-with-production-screenshots)
from the real browser. A feature that has only been reasoned about isn't finished. It's a
hypothesis.

**The build is reproducible.**
[Build-time environment is baked and audited](/kb/build-ci-deploy/build-time-env-is-baked)
against CI. A build that depends on a value nobody wrote down is a build that breaks on
someone else's machine.

**Two operational rules round it out.**
[Never kill all node processes](/kb/tooling-runtime/never-kill-all-node) when you only
need the one on your port; and
[the design phase is not the coding phase](/kb/design-ux/design-phase-is-not-code-phase),
so don't open an editor to "design" in a framework. Different domains, same instinct:
precision over the convenient sweep.

## What they have in common

Read them in a row and one belief shows through: **refuse the hack that trades a known
truth for a probable one.**

- A cast trades "the compiler knows the type" for "I'm probably right."
- A swallowed error trades "this failed" for "it probably won't matter."
- A timeout trades "the event fired" for "it's probably ready by now."
- A retry trades "it works" for "it works often enough."
- Reasoning-instead-of-proving trades "I saw it work" for "it should work."

Each one is comfortable in the moment and expensive later, because it moves a failure from
build time, where it's cheap and visible, to run time, where it's expensive and someone
else finds it. The non-negotiables are the places where that trade was judged never worth
making.

Everything else on the site is more negotiable than this, and some of it is explicitly
[conditional on context](/kb). These nine are the spine. If a change violates one, the
change is wrong, not the rule.
