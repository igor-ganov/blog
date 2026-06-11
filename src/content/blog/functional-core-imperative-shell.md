---
title: 'The functional core and the imperative shell'
description: 'A dozen separate rules describe one shape: a pure core of small functions wrapped in a thin shell that touches the world. Here is how they fit.'
date: 2026-06-11
tags: [functional-architecture, error-handling, type-safety]
order: 3
---

Several of the principles here look like independent rules — one function per file, no
branching, errors as values, validate at the boundary. They are not independent. They are
facets of a single architecture, the one usually called **functional core, imperative
shell**: push all the effects — IO, time, randomness, the DOM — out to a thin edge, and
keep everything behind it pure, total, and testable.

Here is how the rules assemble into that shape, from the inside out.

## The core: small, pure, one idea per file

The unit is a single exported function in its own file, named for what it does and
[organised by where it's used](/kb/functional-architecture/one-function-per-file-folder-by-usage),
not by what layer it belongs to. Small enough to hold in your head; pure enough to test
without a mock.

Inside those functions, branching is the enemy of readability, so the rule is
[switch and strategy maps, not sprawling `if`/ternary chains](/kb/functional-architecture/no-branching-switch-and-strategies).
When behaviour varies, vary it with data — a lookup keyed on a case — rather than with
control flow. And when functions need configuration or shared context, reach for
[currying and closures](/kb/functional-architecture/currying-closures-higher-order)
before reaching for a class. The core ends up being mostly nouns and small verbs, composed.

## The boundary: parse, don't validate

The core can only stay pure if nothing untrusted leaks into it. That is the job of the
boundary: [validate at the edge](/kb/typescript/validate-at-the-boundary), and do it by
[parsing, not checking](/kb/functional-architecture/parse-dont-validate). A validator
returns a boolean and leaves you holding the same untyped value; a parser returns a
*typed* value or an error, so the type system carries the guarantee inward. After the
boundary, the data is the shape the types claim — no casts, no defensive re-checks.

## The error channel: values, not throws

Failure is just another value the core produces. Errors are
[modelled in the type and never silently swallowed](/kb/error-handling/never-swallow-errors);
a fallible computation says so in its signature. Whether you reach for a full
effect runtime or a hand-rolled `Result`
[depends on what you're actually using](/kb/functional-architecture/errors-as-values-with-effect) —
but either way, the error path is visible and the caller cannot ignore it. `throw` is a
goto that erases the failure from the signature; the core doesn't use it.

## The shell: where the world happens

Everything impure lives in a thin outer layer — event handlers, the composition root, the
`runPromise` at the top. It reads from the world, hands typed values to the core, takes
values back, and writes results out. It is the only place that knows about the DOM, the
network, or the clock. Keep it thin and the core stays the part worth testing.

## Why this holds together

The payoff is that the rules reinforce each other instead of competing:

- Small pure functions are trivial to unit-test, so the core is covered by fast tests and
  the slow end-to-end suite only has to exercise the shell.
- No-branching keeps each function legible enough that one-function-per-file isn't
  bureaucracy — the file genuinely holds one idea.
- Parsing at the boundary is what makes "no casting" affordable: you never need a cast
  because the value was already proven at entry.
- Errors-as-values is what makes the shell thin: the core returns failures instead of
  throwing through it.

None of this is enforced by good intentions. It is
[enforced by lint rules](/kb/functional-architecture/lint-enforces-architecture) that fail
the build when the shape breaks — a banned `as`, an empty block, a non-null assertion. The
architecture is the rule set; the linter is how it stays true.
