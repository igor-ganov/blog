---
title: 'Errors as values: Effect-TS pipelines, not throws'
category: functional-architecture
summary: 'Model fallible and async logic with Effect pipelines; errors are typed values composed with pipe/Effect.gen; the imperative shell runs the pipeline at the edge.'
principle: 'Model fallible/async/effectful logic with Effect (effect package); errors and absence are values in the type, composed with pipe/Effect.gen and Option/Either; the imperative shell runs the pipeline at the edge.'
severity: strong
tags: [functional-architecture, effect, error-handling, async, pipeline]
sources:
  - project: 'a content-admin SPA'
    date: 2026-03-24
    note: 'A major refactoring: Effect.js SW core (Match, Effect.gen, Effect.tryPromise, Effect.forEach); Effect.js client (useAuth, useSWBridge).'
  - project: 'an engineering standard'
    date: 2026-06-07
    note: 'Errors as values; pipe/gen; Schema at boundary; runSync/runPromise at the edge.'
related:
  - error-handling/never-swallow-errors
  - typescript/validate-at-the-boundary
order: 4
updated: 2026-06-10
---

`throw` is a goto. It exits the current call stack and transfers control to whatever
`catch` happens to be further up — or to the process error handler if there is none.
The type system knows nothing about it: a function that throws has the same signature as
one that does not. Callers cannot reason about what can go wrong without reading the
implementation. Ad-hoc `Promise` chains compound this: `.catch` is optional, rejections
are untyped, and any `await` can silently swallow an error.

Effect models fallible and async logic as values. An `Effect<A, E, R>` is a description
of a computation that, when run, may succeed with `A`, fail with `E`, or require
services `R`. The error type `E` is in the signature; it cannot be ignored; and the
composition operators (`pipe`, `Effect.gen`, `Effect.map`, `Effect.flatMap`) ensure that
error paths are handled before the pipeline is complete.

## Why this matters

**Two decisions, two dates — the later one wins.**

On 2026-03-15, a project removed Effect from a service worker context,
citing bundle-size concerns in a focused auth flow. That decision was project-specific
and time-bounded.

On 2026-03-24, a major refactoring of a content-admin SPA re-added Effect as a
first-class dependency — explicitly and at scale:

- **SW core**: `Effect.gen`, `Effect.tryPromise`, `Effect.forEach`, `Match` throughout
  the service-worker message pipeline.
- **Client layer**: `useAuth` and `useSWBridge` hooks built on `Effect.js`.
- Bundle impact accepted and measured: vendor ~233 KB, service-worker entry ~473 KB.

The major refactoring was the larger, later, and more deliberate decision. It supersedes
the earlier removal. The correct posture is: **use Effect**; the bundle cost is
accepted as part of the architecture.

The engineering standard (2026-06-07) generalised the rule: compose with
`pipe`/`Effect.gen`; validate at boundaries with `Schema`; run with `runSync` or
`runPromise` at the edge only. One pragmatic exception applies: in a tiny published
library where Effect's ~233 KB bundle cost would dominate the entire package, raise the
concern once, then follow the call. This exception does not apply to application code.

## How to apply

**Effect pipeline vs try/catch.**

```ts
// Bad: try/catch — errors are untyped, flow is non-local, missing paths silently pass
const fetchUserProfile = async (id: string): Promise<UserProfile> => {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    return raw as UserProfile; // cast — no runtime check
  } catch (err) {
    console.error(err);
    throw err; // rethrows; caller must also try/catch
  }
};

// Good: Effect pipeline — E type is explicit; caller cannot ignore the failure path
import { Effect, pipe } from 'effect';
import { Schema } from 'effect';

class HttpError {
  readonly _tag = 'HttpError';
  constructor(readonly status: number) {}
}

class ParseError {
  readonly _tag = 'ParseError';
  constructor(readonly cause: unknown) {}
}

const fetchUserProfile = (
  id: string,
): Effect.Effect<UserProfile, HttpError | ParseError> =>
  pipe(
    Effect.tryPromise({
      try:   () => fetch(`/api/users/${id}`),
      catch: (e) => new HttpError((e as Response).status ?? 0),
    }),
    Effect.flatMap((res) =>
      res.ok
        ? Effect.tryPromise({
            try:   () => res.json(),
            catch: (e) => new ParseError(e),
          })
        : Effect.fail(new HttpError(res.status)),
    ),
    Effect.flatMap(Schema.decode(UserProfileSchema)),
  );
```

The signature tells the caller that `fetchUserProfile` can fail with `HttpError` or
`ParseError`. There is no implicit throw path. Handling both cases before running is
enforced by the type system.

**Effect.gen for sequential async logic.**

When a pipeline has many sequential steps, generator syntax reads closer to
imperative code without sacrificing typed errors:

```ts
const syncUserData = (userId: string): Effect.Effect<void, HttpError | ParseError | DbError> =>
  Effect.gen(function* () {
    const profile  = yield* fetchUserProfile(userId);
    const existing = yield* findExistingRecord(userId);
    const merged   = mergeProfile(existing, profile); // pure, no yield needed
    yield* saveRecord(merged);
  });
```

Each `yield*` is a typed bind. If `fetchUserProfile` fails, execution stops at that
line and the error propagates with its type intact — no try/catch, no `.catch` callback.

**Schema validation at the boundary.**

Effect's `Schema` module replaces hand-written type guards and `as` casts at the system
boundary. The decoder either returns the parsed value or fails the `Effect` with a
structured `ParseError`:

```ts
import { Schema } from 'effect';

const UserProfileSchema = Schema.Struct({
  id:    Schema.String,
  name:  Schema.String,
  email: Schema.String,
});

type UserProfile = Schema.Schema.Type<typeof UserProfileSchema>;

// Schema.decode returns Effect<UserProfile, ParseError>
// — no cast, no manual type guard, error in the type
```

**Run at the edge only.**

`Effect.runPromise` and `Effect.runSync` are the imperative shell. They belong in event
handlers, service-worker message listeners, or application bootstrap — never inside a
pure pipeline step:

```ts
// Composition root / event handler (imperative shell)
self.addEventListener('message', (event) => {
  Effect.runPromise(handleMessage(event.data)).catch(reportUnhandled);
});
```

Everything above this boundary is composed `Effect` values. Only the shell converts them
to Promises or runs them synchronously.

**Absence as Option, not null.**

For values that may or may not exist, `Option` from `effect` makes absence explicit in
the type without using `null` or `undefined`:

```ts
import { Option } from 'effect';

const findFirst = <T>(
  items: ReadonlyArray<T>,
  predicate: (item: T) => boolean,
): Option.Option<T> =>
  Option.fromNullable(items.find(predicate));

// Caller must match both cases — no forgotten null check
const label = Option.match(findFirst(items, isActive), {
  onNone: () => 'None active',
  onSome: ({ name }) => name,
});
```

## Anti-patterns

```ts
// ❌ Untyped rejection — callers cannot know what errors to handle
const loadData = async (): Promise<Data> => {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error('failed'); // type erased; caller must guess
  return res.json() as Data;              // cast; no runtime check
};

// ❌ Swallowing in catch — the error disappears, the caller gets a lie
const safe = async (): Promise<Data | null> => {
  try { return await loadData(); }
  catch { return null; } // null is not a type; it is a missing error
};

// ❌ Effect.runPromise inside a pipeline step — runs eagerly in the wrong context
const processItem = (item: Item): Effect.Effect<void> =>
  Effect.sync(() => {
    Effect.runPromise(saveItem(item)); // breaks the lazy composition model
  });

// ❌ Mixing Effect and raw throws — a throw inside an Effect.gen body is untyped
const mixed = Effect.gen(function* () {
  const result = yield* fetchData();
  if (result.count === 0) throw new Error('empty'); // escapes Effect error channel
});
```

## See also

The `parse-dont-validate` article extends this: `Schema.decode` is the preferred form of
boundary validation because it returns an `Effect` with a typed `ParseError`, not a
boolean or an untyped thrown exception.
