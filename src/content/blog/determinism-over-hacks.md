---
title: 'Determinism over probabilistic hacks'
description: 'The testing rules here are uncompromising for one reason: a flaky test is not a test problem, it is the app telling you about a race. Listen to it.'
date: 2026-06-11
tags: [testing, e2e, determinism]
order: 4
---

The testing principles on this site are some of the strictest, and they come from a
single conviction: **a test that sometimes fails is reporting something true.** The
common response — add a wait, add a retry, mark it flaky — silences the messenger. The
discipline here is to treat the message as real and fix the cause.

## No timeouts

[Tests synchronise on events, never on time.](/kb/testing/event-driven-no-timeouts) A
`waitForTimeout(500)` says one of two things: "I don't know what I'm waiting for," or "the
app isn't fast or deterministic enough to wait for the real signal." The first is a bug in
the test; the second is a bug in the app. A timeout papers over whichever one you have and
guarantees a failure on the slowest CI run.

So you wait on the thing that actually indicates readiness — a network response, a DOM
mutation, an element becoming visible — using assertions that poll and resolve the instant
the condition is true. They are event-shaped, not time-shaped.

## No retries

[A test that needs retries is reporting a real race](/kb/testing/no-retries-no-flakes);
retries hide it. Green is defined as a full, stable pass with **zero retries, three runs
in a row**. Anything less is "probably green", and probably-green is how a race reaches
production while every dashboard stays the colour of success.

When a test really is unstable, the playbook is investigative, not cosmetic: reproduce it
against the real browser, throttle it, and find the event you should have waited on — or
the architectural race that makes the behaviour non-deterministic in the first place. If
the architecture can't guarantee deterministic behaviour, the architecture is the bug.

## Tests that survive refactors

Determinism isn't only about timing; it's also about not writing tests that break for the
wrong reasons. Two rules keep the suite stable as the UI changes:

- [Locator constants live next to the component](/kb/testing/locator-constants), so a
  selector is defined once and imported by both the component and its test. Rename a
  test id in one place and every test follows.
- [Mind the accessible-name overlap](/kb/testing/aria-label-test-locator-hygiene): a
  loose `getByRole('link', { name: 'Browse' })` will happily match "Browser Platform"
  too. Exact matches and good aria hygiene keep a locator pointed at one thing.

And where the platform makes a interaction genuinely hard to drive — service workers
settling, native drag-and-drop — there are specific, deterministic recipes
([wait for the worker to settle](/kb/testing/wait-for-service-worker-settle),
[drive real drag events](/kb/testing/native-drag-and-drop-for-tests)) rather than a sprinkle
of waits.

## The throughline

Every one of these is the same move applied to tests: refuse the probable in favour of the
certain. Wait for the event that *did* happen, not the time by which it *probably* did.
Demand a pass that *is* stable, not one that's stable *enough*. It is the same instinct
that runs through the [non-negotiables](/essays/the-non-negotiables) and the
[functional core](/essays/functional-core-imperative-shell) — here it just has the sharpest
edge, because tests are where non-determinism is easiest to tolerate and most expensive to
keep.
