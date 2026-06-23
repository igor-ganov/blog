---
title: 'No casting — never reach for `as`'
category: typescript
summary: 'Type assertions are a lie to the compiler; achieve safety through inference and design instead.'
principle: 'Never use `as` or non-null `!`. If the types do not line up, fix the design or validate at the boundary — never cast.'
severity: non-negotiable
tags: [typescript, type-safety, inference, validation]
sources:
  - project: 'a content-admin SPA'
    date: 2026-03-25
    note: 'Grand Refactoring phase 3 — zero `as` casts across the codebase, no linter overrides.'
  - project: 'a content-admin SPA (refactoring plan)'
    date: 2026-03-24
    note: 'Required principle: no `any`, no `as`, no `!`; validate at boundaries, compute internally.'
  - project: 'an edge bot (Cloudflare Workers)'
    date: 2026-05-23
    note: 'Telegram digest bot honoured no-any/no-as with runtime guards in src/util/json.ts.'
related:
  - typescript/no-null-use-undefined
  - typescript/validate-at-the-boundary
  - functional-architecture/parse-dont-validate
order: 1
updated: 2026-05-23
---

A type assertion (`value as Thing`) converts nothing. It switches off the compiler for
one expression and declares, on your authority rather than the type system's, that you
know better. Every `as` is a spot where a later refactor can change the real shape of
the data while the types go on claiming the old shape. The non-null assertion `!` does
the same trick: it tells the compiler "trust me, not undefined" at the exact point where
the compiler was trying to protect you.

The rule is absolute. No `as`, no `!`. Not "minimise", not "only in tests", none.

## Why this matters

On a content-admin SPA, the Grand Refactoring (completed 2026-03-24) set an explicit
target of **zero `as` casts across the entire codebase** with **no linter overrides**,
and hit it. The motivation was not aesthetic. The state before the refactoring carried
148 suppressed lint violations and a whole class of bugs that existed only because casts
and non-null assertions let malformed data slip past the type checker, crashing at
runtime far from the cast that let it through.

The deeper reason is that a cast is **non-local**. When you write `data as Ticket`, the
bug it enables does not surface at that line. It surfaces three modules away when
something reads `ticket.assignee.login` and `assignee` was actually `null`. The whole
value of a type system is locality: it points at the real problem. A cast trades that
away for a moment's convenience and pays it back later as a production incident.

## How to apply

When the types do not line up, the fix is one of three things, never a cast.

**1. Design the types so inference works.** Most casts are a symptom of a type described
too loosely, or declared in the wrong place.

```ts
// Bad: the function returns `unknown`, so callers cast.
const parse = (raw: string): unknown => JSON.parse(raw);
const ticket = parse(body) as Ticket; // a lie

// Good: validate once, return the real type, callers never cast.
const parseTicket = (raw: string): Ticket | undefined => {
  const value: unknown = JSON.parse(raw);
  return isTicket(value) ? value : undefined;
};
```

**2. Use a type guard, not an assertion.** A user-defined type guard (`x is T`) is
checked by the compiler against a real runtime test. It narrows without lying.

```ts
const isTicket = (value: unknown): value is Ticket =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'number';
```

**3. Validate at the boundary.** The one place a cast feels tempting is where untyped
data enters the system: a network response, `JSON.parse`, `localStorage`. There, run a
real runtime validator (a hand-written guard, or `effect/Schema` / `zod`) and return a
typed value or an error. Inside the boundary everything is already typed, so there is
nothing left to cast. This is [validate at the boundary](/principles/typescript/validate-at-the-boundary).

For absent values, reach for `undefined` and model the absence in the type rather than a
non-null `!`. See [no null, use undefined](/principles/typescript/no-null-use-undefined).

## Anti-patterns

```ts
// ❌ Asserting the shape of parsed JSON — the classic source of "cannot read
//    properties of null" three layers down.
const user = JSON.parse(res) as User;

// ❌ Non-null assertion to silence the checker. If it can be undefined, handle it.
const first = items.find((x) => x.active)!;

// ❌ Casting through `unknown` to force an incompatible assignment. This is the
//    same lie wearing a disguise.
const handler = genericHandler as unknown as SpecificHandler;

// ❌ `as const` is fine (it narrows, it does not assert a different type) — do not
//    confuse it with the above. The ban is on type *assertions*, not const assertions.
```

Each of the first three compiles cleanly and ships a bug. The symptom is always a
runtime error whose stack trace points nowhere near the cast that caused it.

## Enforcement

Make this a lint rule rather than a review convention, because reviews do not catch what
lint can. In Biome, `noExplicitAny` and `noNonNullAssertion` are set to `error` (see the
repository's `biome.json`). In the typescript-eslint stack,
`@typescript-eslint/no-explicit-any`, `consistent-type-assertions`
(`assertionStyle: 'never'`) and `no-non-null-assertion` do the same. CI runs the linter
and fails the build on a violation. No overrides, no `biome-ignore`, no `eslint-disable`.
When a rule is fighting you, the design is wrong, so fix the design.

## See also

The refactoring that proved this at scale also removed every `<div>` and every
imperative loop in the same pass. Type safety, functional decomposition and declarative
components come from one consistent stance, not three separate preferences.
