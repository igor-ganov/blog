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
[Never reach for `as`](/principles/typescript/no-casting). A cast overrules the compiler on the
one question it exists to answer. Model the types so inference comes out right, or validate
at the boundary. Don't lie to the checker.

**Errors are values or they propagate.**
[Never swallow an error](/principles/error-handling/never-swallow-errors), and
[always check `res.ok`](/principles/error-handling/always-check-res-ok). An empty `catch` and a
`fetch` whose status you never inspect are the same bug: a failure the code has decided to
pretend didn't happen. Those are the failures that turn into incidents.

**Tests synchronise on events.**
[No timeouts, ever](/principles/testing/event-driven-no-timeouts), and
[no retries, no flakes](/principles/testing/no-retries-no-flakes). A `waitForTimeout` hides either
a broken test or a non-deterministic app, and a retry hides a real race. Green means a
full, stable pass three times running, not "probably green".

**"Done" means proven, in the real thing.**
[Prove it with production-grade screenshots](/principles/process/prove-with-production-screenshots)
from the real browser. A feature that has only been reasoned about is still unproven.

**The build is reproducible.**
[Build-time environment is baked and audited](/principles/build-ci-deploy/build-time-env-is-baked)
against CI. A build that depends on a value nobody wrote down is a build that breaks on
someone else's machine.

**Two operational rules round it out.**
[Never kill all node processes](/principles/tooling-runtime/never-kill-all-node) when you only
need the one on your port; and
[the design phase is not the coding phase](/principles/design-ux/design-phase-is-not-code-phase),
so don't open an editor to "design" in a framework. Both come down to being precise
instead of taking the convenient sweep.

## What they have in common

Read them in a row and one belief shows through: refuse the hack that swaps a known truth
for a probable one.

- A cast claims the compiler knows the type when you only believe you're right.
- A swallowed error pretends a failure won't matter.
- A timeout assumes the event has fired by now.
- A retry settles for code that works often enough.
- Reasoning instead of proving assumes it should work without watching it.

Each one is comfortable in the moment and expensive later, because it moves a failure from
build time, where it's cheap to catch, to run time, where someone else finds it. The
non-negotiables are the places where that trade was judged never worth making.

Everything else on the site is more negotiable than this, and some of it is explicitly
[conditional on context](/principles). These nine are the ones that hold the rest up. A
change that violates one is wrong.
