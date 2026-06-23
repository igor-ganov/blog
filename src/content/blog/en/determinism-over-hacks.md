---
title: 'Determinism over probabilistic hacks'
description: 'The testing rules here are uncompromising for one reason: a flaky test is not a test problem, it is the app telling you about a race. Listen to it.'
date: 2026-06-11
tags: [testing, e2e, determinism]
order: 4
---

The testing principles on this site are about as strict as they come, and they all trace
back to one conviction: **a test that sometimes fails is reporting something true.** The
usual response is to add a wait, add a retry, or mark it flaky, which just silences the
messenger. The discipline here is to take the message seriously and fix what caused it.

## No timeouts

[Tests synchronise on events, never on time.](/principles/testing/event-driven-no-timeouts) A
`waitForTimeout(500)` is admitting one of two things. Either you don't know what you're
waiting for, which is a bug in the test, or the app isn't fast or deterministic enough to
wait for the real signal, which is a bug in the app. Either way the timeout hides the
problem and guarantees a failure on the slowest CI run.

So you wait on the thing that actually indicates readiness: a network response, a DOM
mutation, an element becoming visible. Use assertions that poll and resolve the moment the
condition is true. They key off events, not the clock.

## No retries

[A test that needs retries is reporting a real race](/principles/testing/no-retries-no-flakes),
and retries hide it. Green means a full, stable pass with **zero retries, three runs in a
row**. Anything less is "probably green", and probably-green is how a race reaches
production while every dashboard stays the colour of success.

When a test really is unstable, the work is investigative rather than cosmetic. Reproduce
it against the real browser, throttle it, and find the event you should have waited on, or
the architectural race that makes the behaviour non-deterministic in the first place. If
the architecture can't guarantee deterministic behaviour, the architecture is the bug.

## Tests that survive refactors

Determinism isn't only about timing. It's also about not writing tests that break for the
wrong reasons. Two rules keep the suite stable as the UI changes:

- [Locator constants live next to the component](/principles/testing/locator-constants), so a
  selector is defined once and imported by both the component and its test. Rename a
  test id in one place and every test follows.
- [Mind the accessible-name overlap](/principles/testing/aria-label-test-locator-hygiene): a
  loose `getByRole('link', { name: 'Browse' })` will happily match "Browser Platform"
  too. Exact matches and good aria hygiene keep a locator pointed at one thing.

Where the platform makes an interaction genuinely hard to drive, like service workers
settling or native drag-and-drop, there are specific deterministic recipes
([wait for the worker to settle](/principles/testing/wait-for-service-worker-settle),
[drive real drag events](/principles/testing/native-drag-and-drop-for-tests)) instead of a sprinkle
of waits.

## The throughline

Every one of these rules is the same move applied to tests: refuse the probable in favour
of the certain. Wait for the event that *did* happen, not the time by which it *probably*
did. Demand a pass that *is* stable, not one that's stable *enough*. The same instinct runs
through the [non-negotiables](/blog/the-non-negotiables) and the
[functional core](/blog/functional-core-imperative-shell), and it shows up most sharply
in tests, because tests are where non-determinism is easiest to tolerate and most expensive
to keep.
