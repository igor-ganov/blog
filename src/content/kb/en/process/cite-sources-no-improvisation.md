---
title: 'Cite your sources — no improvisation'
category: process
summary: 'Every substantive claim rests on a verified source; no unattributed best practice; propose one strong option, not a menu; critique the system, not people.'
principle: 'Every substantive claim rests on a verified source (link/citation); no unattributed best practice; propose one strong option, not a menu; critique the system, not people.'
severity: strong
tags: [process, research, sources, communication, editorial]
sources:
  - project: 'a multi-product company (DDD case study)'
    date: 2026-05-27
    note: 'no improvisation; source-backed claims; one strong proposal; critique system not people'
related:
  - ddd/conway-and-team-topologies
  - process/spec-driven-ears-not-user-stories
order: 7
updated: 2026-06-10
---

An unattributed "best practice" is just an assertion. Without a source you
cannot judge how old the claim is, what context it came from, or whether it applies to
the situation in front of you. The research behind a design decision is part of the
decision. It records what was known when the choice was made, where to look when the
circumstances change, and what evidence would invalidate it.

This knowledge base follows the rule it documents. Every article carries a `sources`
block with a project name, date, and note. That block records where each claim came from.

## Why this matters

A DDD presentation effort (2026-05-27) set a hard editorial constraint: every
substantive claim must rest on a canonical source. Three failure modes motivated it.

**Improvised "best practice."** Take a claim like "DDD aggregates should be small"
with no citation. It could mean the author's preference, a Stack Overflow answer from
2014 that misread Vernon, a pattern that holds in event-sourced systems but not in
CRUD systems, or the actual guidance from Vaughn Vernon's _Implementing Domain-Driven
Design_ (2013). Same wording, wildly different applicability. A citation tells you
which one you are reading.

**Menu of alternatives.** Presenting three options and asking the reader to choose
moves the decision work onto the reader without giving them the research that would let
them decide well. A strong proposal (one option, with the reasoning) beats a survey. The reader can still reject it and ask for alternatives,
which is a different conversation from "here are three options, you decide."

**Blaming individuals.** A critique that names a person ("the previous developer made
a bad choice") gives you nothing to act on and puts everyone on the defensive. Name
the system or the process instead ("the absence of a spec gate let scope creep
accumulate"), and you have the root cause and a place to apply the fix.

## How to apply

### Source every substantive claim

A substantive claim is any assertion that:
- Describes the correct way to do something (design pattern, process step, tooling
  choice).
- Describes the failure mode of an alternative approach.
- Cites a number, a benchmark, or a deadline.

For each such claim, identify the source before writing the claim. The source may be:

- A specific book, chapter, and author. ("Vaughn Vernon, _Implementing Domain-Driven
  Design_, 2013, chapter 10: aggregates.")
- A specification or RFC. ("EARS syntax: Mavin et al., IEEE RE 2009.")
- A project decision record. ("Grand Refactoring decision record, 2026-03-24: zero `as`
  casts.")
- An official documentation page with a URL.

If you cannot identify a source, reclassify the claim as an opinion and frame it as
one, or drop it.

### Propose one option

When a decision is required:

1. Identify the options that are genuinely viable given the constraints.
2. Evaluate them against the constraints.
3. Select one. Write down why.
4. Propose that one option with the reasoning.

```markdown
<!-- ❌ Menu without a recommendation -->
For state management you could use:
- Signals (reactive, Angular-idiomatic)
- Services with BehaviorSubject (imperative, familiar)
- NgRx (predictable, heavy)

Which do you prefer?

<!-- ✅ One strong proposal with reasoning -->
Use Signals. Angular 17+ makes them the idiomatic reactive primitive;
they compose with `computed` and `effect`, avoid the subscription management
overhead of BehaviorSubject, and align with the angular-style rules already
in this codebase (signals-resource-compute). Source: Angular Signals RFC, 2023;
this repo's angular/signals-resource-compute article.
```

The reader may disagree and ask for alternatives, and that is fine. The default stays
a single strong recommendation.

### Critique systems, not people

When a decision was wrong or a codebase has a problem:

```markdown
<!-- ❌ Person-focused critique -->
The previous developer used `as` everywhere and clearly did not understand TypeScript.

<!-- ✅ System-focused critique -->
The codebase accumulated 148 `as` casts over time. This is consistent with a
development process that lacked a lint rule enforcement gate — the no-cast discipline
was a stated preference but not mechanically enforced, so it eroded under time
pressure. The Grand Refactoring added the Biome rule and zero-tolerance CI gate to
fix the process gap.
```

The system critique says what was missing (the lint gate), why it mattered (the stated
preference eroded without it), and how it was fixed (the CI gate). You can act on it,
and nobody has to defend themselves.

### The provenance block in this knowledge base

Every article in this knowledge base carries a `sources` block. The format:

```yaml
sources:
  - project: 'Project name / sub-area'
    date: YYYY-MM-DD
    note: 'What specifically this source contributes to the article.'
```

The date is the date of the project decision or document, not the date the article was
written. Write the note specific enough that a reader can tell what evidence the source
provides without going and reading it.

When a newer decision overrides an older one, both appear in the sources block with
their dates, and the article body says explicitly which supersedes which and why.

## Anti-patterns

**"In my experience…" without a project reference.** Personal experience is evidence,
but it is weak evidence without specifics. "In my experience, aggregates should be
small" is weaker than "On a legacy admin panel (2026-03-24), aggregates that
crossed two bounded contexts produced coupling that took three sprints to unwind; the
Grand Refactoring resolved this by aligning aggregate boundaries with BC boundaries."

**Citing a secondary source when the primary source is available.** A blog post that
summarises Vernon is not the same as Vernon. Reach for the primary source. If it is a
book, cite the book.

**A list of options with no selection.** See above. A list without a recommendation
transfers indecision rather than resolving it.

**Retroactive source-finding.** Writing the claim first and then finding a source that
vaguely supports it. The source should be the origin of the claim, not a justification
found after the fact.

## Enforcement

There is no automated lint rule for citation quality. The enforcement is editorial:
every article in this knowledge base is reviewed against the standard before it is
merged. An article with unattributed claims is incomplete.

In research outputs, design documents, and architecture decision records, the same
standard applies. A design document that says "we should use the outbox pattern
because it is a best practice" is incomplete. A design document that says "we should
use the transactional outbox pattern (Kleppmann, _Designing Data-Intensive
Applications_, 2017, chapter 11; see backend-events/transactional-outbox-idempotent-consumer)
because the alternative — dual writes — is susceptible to partial failure under the
network partition mode described in REQ-4" is complete.

## See also

The citation standard applies most visibly in DDD research and architecture decisions,
where the field has a rich primary literature and the temptation to substitute
internet opinions for canonical sources is high. The
[conway-and-team-topologies](/principles/ddd/conway-and-team-topologies) article demonstrates
the standard: every claim is grounded in a specific source.
