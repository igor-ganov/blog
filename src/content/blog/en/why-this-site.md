---
title: 'Why this site exists'
description: 'The brief that started it — in the owner''s words, and how the builder read it. This site is both an artifact and an instrument.'
date: 2026-06-10
tags: [meta, motivation, process]
order: 1
---

Most engineering blogs get written after the fact, to explain decisions already made.
This one was built the other way around. It was a way to find out whether a set of
decisions, accumulated over years and across roughly twenty projects, actually hold
together, and whether they are being applied the way they were meant to be.

The motivation shaped every choice in the site, so it is worth being precise about it.
Here is the brief twice: once as it was given, once as it was read.

## The brief, in the owner's words

The ask was, roughly:

> Take my global conventions, my projects, and the decisions made in them — where older
> decisions count for less than newer ones — and build a large knowledge base of
> markdown files, grouped by best practices and preferences. Then, from that base, build
> a blog that uses those very preferences, with articles that break down and explain each
> topic. Why? **First**, to bring the knowledge up to date. **Second**, to check that the
> code is actually written, designed, and architected the way I want — and to fix what
> isn't. **Third**, to distill a more precise set of reusable skills for future work. And
> **fourth**, to share it with other developers.

Four goals, in that order, and the order matters. The first two are inward-facing:
accuracy and self-correction. The last two point outward, toward reuse and sharing.

## How the builder read it

Read closely, the brief asks for an **instrument**, not documentation. The documentation
falls out as a side effect.

- **"Bring the knowledge up to date"** meant the knowledge already existed, scattered
  across a conventions file, a handful of coding-standard skills, and dozens of dated
  notes, but had never been reconciled. Reconciling it needed a rule for conflicts, and
  the brief already supplied one: newer beats older. So every practice here carries its
  **provenance**, the decision it came from and the date, and where two decisions
  disagree, the article says so and names both dates. None of this is presented as
  timeless. It is dated, and it is revisable.

- **"Check that it's built the way I want — and fix what isn't"** is the load-bearing
  goal, the one that turns the site into a feedback surface. Writing a rule down forces it
  to be specific enough to be *wrong*, and a wrong rule is one the owner can point at and
  correct. That has already happened. Two practices were stated too strongly on the first
  pass: one made a particular runtime the default when it should only apply where its
  features are actually used, and one applied a heavyweight design method to projects too
  small to earn it. Both got corrected after review, in the article and in the behaviour
  behind it. The site is doing its job when it provokes a correction like that.

- **"A more precise skill system"** is the operational form of all this. A knowledge base
  is raw material. A skill is the same knowledge compiled into something that loads
  exactly when it's relevant. The [Skills](/skills) page is the proposal for that
  compilation.

- **"Share it with other developers"** set a hard constraint. Everything had to be
  **anonymized** down to general concepts, with no companies and no project names, so the
  ideas travel without the baggage. A practice that only makes sense inside one company
  isn't a practice. It's a local habit.

## The medium is the message

There was one more reading, never stated but unavoidable. A site about how to build
software has no business being built any other way, so it runs on the exact stack and
rules it documents: static Astro, Lit islands loaded on the client, strict TypeScript
with no escape hatches, a functional core of small pure functions, and an event-driven
end-to-end suite that has to pass three times running before anything ships. If the
practices were wrong, building the site would have hurt. It mostly didn't, and where it
did, that pain became an article.

## How to read what follows

Start with the [Principles](/kb), the reference: one rule per page, each with a severity
badge that says how firmly it's held. The other essays here pull those rules into themes:
which ones are [non-negotiable](/essays/the-non-negotiables), how the
[functional core and the imperative shell](/essays/functional-core-imperative-shell) divide
the work, and why the tests insist on
[determinism over convenient hacks](/essays/determinism-over-hacks).

Disagree where you like. Every page tells you where it came from, so you can weigh the
evidence instead of taking it on faith. That matters more here than any single rule does.
