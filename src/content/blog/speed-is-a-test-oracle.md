---
title: 'Speed is a test oracle'
description: 'Cutting a ten-minute deploy to five and a half didn''t just save time — the speed itself found three service-worker races and a test that had been silently skipping for months. Slowness was load-bearing, and removing it made the suite more honest, not just faster.'
date: 2026-06-12
tags: [testing, ci, performance, platform]
order: 6
---

The deploy took nine and a half minutes. The brief was blunt — make it dramatically
faster without giving up a single test — and the expectation was an afternoon of
caching and configuration. What actually happened is more interesting: almost every
minute saved came from removing a wait that was lying, and almost every removed lie
exposed a real bug underneath it. Speed turned out to be an oracle. If making the
suite faster makes it fail, the suite was never passing — it was being outrun.

## Where the time actually was

The first move was not an optimisation but a measurement: per-step timings from the
CI API. Units 70 seconds, build 29, browser install 25, deploy tail 30 — and the
E2E step at **6m55s**, seventy percent of the pipeline. Everything else was noise
until that shrank, which is the whole argument for
[profiling the pipeline before tuning it](/kb/build-ci-deploy/profile-the-pipeline-before-tuning).
The suite ran with a single worker in CI. Four shared vCPUs, one of them working.

`workers: 4` took E2E to 2m46s and the pipeline to 5m36s. It also broke three tests
immediately. This is the part worth writing down, because the reflex reading —
"parallelism made the suite flaky" — gets the causality exactly backwards.

## The slack was hiding the bugs

None of the three failures was a test problem.
[Parallel workers are a race detector](/kb/testing/parallel-workers-surface-races);
the serial suite had simply been slow enough that the application always won its
own races.

A post-login navigation died intermittently with `net::ERR_ABORTED`: the first
authenticated load registers a service worker, activation claims the client, and
an in-flight `goto` gets aborted mid-claim. Months old. Under one worker,
activation always finished first. The fix was a lifecycle gate —
[wait for the service worker to settle](/kb/testing/wait-for-service-worker-settle)
— before any navigation that follows SW registration.

A section-switch test asserted that content items were visible after clicking a
section link. They were visible — the *previous* section's items, about to be
replaced. The replacement data travels over a `MessageChannel` to the service
worker, so the test harness's network instrumentation sees nothing: no request, no
response, no event to wait on. The fix changed the application by one attribute —
each item now renders its repository path as `data-path` — and the wait became an
identity predicate instead of a presence check.
[Out-of-band transport needs DOM signals](/kb/testing/out-of-band-transport-needs-dom-signals);
a list that only says "something is here" cannot support a test that needs to know
*what* is here.

And the suite's own settle helper waited on `networkidle` — the previous
generation's fix for the SW reload race, written up at the time as the event-driven
answer. It isn't one. `networkidle` resolves after 500ms of network silence, which
makes it a timeout wearing an event costume: every visit paid half a second for
nothing, and the signal says nothing about the service worker anyway. The KB entry
that recommended it now recommends the lifecycle predicate that replaced it. Old
advice rots; provenance and an `updated` field are what let it rot visibly.

## Ceilings move; waits don't

Four workers on four shared vCPUs make a healthy cold start genuinely slower, and
the strict ten-second wait ceiling that fits a dedicated local machine starts
killing legitimate runs in CI. The tempting fix is sprinkling `{ timeout: 30000 }`
over whichever specs failed this week. The right one is a single environment knob
in the shared wait helpers — CI sets it once, locally the strict default stays, and
every wait remains event-driven, resolving the instant its condition is true. Only
the failure deadline moves. The distinction matters: a per-spec timeout hides
whether that spec is slow or broken; a suite-wide ceiling is an honest statement
about the hardware.

The same audit pass found a quieter lie. A PDF-upload test pointed its fixture at
an absolute path on the author's machine, guarded by a skip when the file is
missing. In CI the file is always missing. The test had reported green — by
silently not running — for months. Fixture into the repo, skip deleted, and the
suite's stated coverage became its actual coverage. A
[skipped test is a failing test](/kb/testing/no-retries-no-flakes), and the
silent-conditional kind is the worst of the family precisely because nobody chose
it.

## The residue

Two operational lessons rode along. A `playwright install` step hung for over an
hour, twice, because a newer Node on PATH broke the installer — an unbounded
install step turns a tool regression into a silent stall, so the step got
`timeout-minutes: 8` and the workflow got a Node pin with an in-file comment saying
why. And browser downloads got cached keyed by Playwright's version, which is the
key that survives unrelated dependency bumps and invalidates exactly when it
should.

Final state: 5m36s cold, faster warm, 271 tests, zero retries, three consecutive
clean local runs, and a suite that is *more* honest than the slow one was — three
production races fixed at the root, one phantom test resurrected. The target had
been a tenfold cut, and on free four-core runners with full coverage that isn't
real; job-splitting and sharding can buy roughly another half, and beyond that the
hardware is the wall. But the durable result isn't the number. It's the method:
treat every second of pipeline time as a claim that must justify itself, and treat
every failure that speed provokes as the suite finally telling the truth.
