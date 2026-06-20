---
title: 'Errors as values — Effect only when you pay for its runtime'
category: functional-architecture
summary: 'Errors and absence are always values in the type, never throws. Reach for Effect when the project already exercises its runtime (concurrency, scope, DI); for plain error-values a hand-rolled Result is ~200× smaller in the bundle.'
principle: 'Model errors and absence as values in the type, composed in pipelines, never thrown. Use Effect when you already use its runtime (structured concurrency, interruption, scope/resource-safety, Layer/DI); if you only need error-as-value, a custom discriminated-union Result is the lighter choice.'
severity: context
tags: [functional-architecture, effect, error-handling, async, pipeline, bundle-size]
sources:
  - project: 'a content-admin SPA'
    date: 2026-03-24
    note: 'A major refactoring adopted Effect at scale: Effect.gen, Effect.tryPromise, Effect.forEach, Match in the SW core; useAuth/useSWBridge on the client. Bundle cost accepted because the runtime was used.'
  - project: 'an engineering standard'
    date: 2026-06-07
    note: 'Errors as values; pipe/gen; Schema at boundary; runSync/runPromise at the edge.'
  - project: 'a frontend app'
    date: 2026-06-10
    note: 'Went without Effect, on custom result functions, over bundle-size concerns when only error-as-value was needed.'
  - project: 'bundle measurement'
    date: 2026-06-11
    note: 'bun build --minify, gzip: custom Result 286 B; Effect Either-only 4.2 KB; full Effect (gen+runPromise) 62 KB. Tree-shaking removes unreachable modules but cannot prune the reachable fiber runtime.'
related:
  - error-handling/never-swallow-errors
  - typescript/validate-at-the-boundary
order: 4
updated: 2026-06-11
---

`throw` is a goto. It exits the current call stack and hands control to whatever `catch`
sits further up, or to the process error handler when nothing catches it. The type system
knows nothing about it. A function that throws has the same signature as one that does not,
so callers cannot reason about what can go wrong without reading the implementation. Ad-hoc
`Promise` chains make it worse: `.catch` is optional, rejections are untyped, and any
`await` can swallow an error without a trace.

Effect models fallible and async logic as values. An `Effect<A, E, R>` describes a
computation that, when run, may succeed with `A`, fail with `E`, or require services `R`.
The error type `E` sits in the signature where it cannot be ignored, and the composition
operators (`pipe`, `Effect.gen`, `Effect.map`, `Effect.flatMap`) force you to handle the
error paths before the pipeline finishes.

## Why this matters

The invariant that is **never** up for debate: errors and absence are *values in the type*,
composed in pipelines, not thrown. `throw` erases the error from the signature, and a
`Result`/`Either`/`Effect` puts it back. That much is settled.

The judgement call is **the vehicle**, and the bundle is what decides it. Effect is a
runtime, not an error-handling library: a fiber scheduler, an interpreter loop,
interruption, scope/resource-safety, and a `Layer` dependency graph. When you run an
`Effect`, you pay for that runtime whether or not you use it.

**Measured (`bun build --minify`, gzipped):**

| Approach | min+gzip | vs custom |
| --- | --- | --- |
| Custom `Result` (discriminated union + `map`/`flatMap`/`match`) | **286 B** | 1× |
| Effect `Either` module only (no runtime) | **4.2 KB** | ~15× |
| Full Effect (`Effect.gen` + `runPromise`) | **62 KB** | ~217× |

Each case runs the *same* trivial parse-double-validate program. The 62 KB in the last
row is a floor rather than a function of program size. It is the fiber runtime, pulled in
the moment you call `runPromise`.

**Why tree-shaking does not rescue the runtime.** Tree-shaking is reachability-based
dead-code elimination: it drops exports nothing references. The middle row proves it
works, since using only `Either` keeps the runtime out and stays at 4.2 KB. But in the
full-Effect case the runtime is *reachable*. Effect is an interpreter, and Effect values
are data rather than a static call graph, so which fiber features fire is decided at run
time by the node tags. The bundler cannot prove you never interrupt, fork, or open a
scope, so the whole interpreter stays. You can tree-shake the leaves (`Effect.map`,
`Either.*`), but not the trunk.

**The decision, with dates.** A 2026-03-24 content-admin SPA adopted Effect at scale:
`Effect.gen`/`tryPromise`/`forEach`/`Match` across the service-worker core, `useAuth`/
`useSWBridge` on the client. There the runtime was *used*, so the bundle cost bought
something and was correctly accepted. A later 2026-06-10 frontend app went the other way.
It needed only error-as-value, so it shipped custom result functions and skipped the
62 KB. **Both are right, because the rule is conditional, not absolute:**

- Using Effect's runtime — structured concurrency, interruption, retries/scheduling,
  scope/resource-safety, `Layer`/DI? **Use Effect.** A hand-rolled equivalent would be a
  worse, unsafe re-implementation of the same runtime. Bundle size is the wrong axis.
- Need only "errors and absence are values"? **Use a custom `Result`.** Effect's runtime
  is then dead weight you cannot tree-shake away, and 286 B does the job.

The earlier "always use Effect" framing was too strong. It generalised one project where
the runtime happened to be used into a universal default. The corrected rule is the
conditional above, which is why this article is `context` rather than `strong`.

## How to apply

**The lightweight path — a custom `Result` (use this when you only need error-as-value).**

A discriminated union plus three pure functions covers map/chain/fold. It is fully
tree-shakeable, carries no runtime, and costs a few hundred bytes:

```ts
// result.ts — the whole "errors as values" toolkit, ~30 lines, no dependency.
type Result<E, A> =
  | { readonly _tag: 'Err'; readonly error: E }
  | { readonly _tag: 'Ok'; readonly value: A };

const ok = <A>(value: A): Result<never, A> => ({ _tag: 'Ok', value });
const err = <E>(error: E): Result<E, never> => ({ _tag: 'Err', error });

const map =
  <A, B>(f: (a: A) => B) =>
  <E>(r: Result<E, A>): Result<E, B> =>
    r._tag === 'Ok' ? ok(f(r.value)) : r;

const flatMap =
  <A, F, B>(f: (a: A) => Result<F, B>) =>
  <E>(r: Result<E, A>): Result<E | F, B> =>
    r._tag === 'Ok' ? f(r.value) : r;

const match =
  <E, A, B>(onErr: (e: E) => B, onOk: (a: A) => B) =>
  (r: Result<E, A>): B =>
    r._tag === 'Ok' ? onOk(r.value) : onErr(r.error);
```

The error type is still in the signature, the caller still cannot ignore the failure
path, and `match` still forces both branches. You get the invariant, errors as values,
without the 62 KB runtime. This is the default for plain fallible logic. Reach for the
Effect version below only when the project already uses its runtime.

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
`ParseError`. There is no implicit throw path, and the type system enforces handling both
cases before the pipeline runs.

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

Each `yield*` is a typed bind. If `fetchUserProfile` fails, execution stops at that line
and the error propagates with its type intact, with no try/catch and no `.catch` callback.

**Schema validation at the boundary.**

Effect's `Schema` module replaces hand-written type guards and `as` casts at the system
boundary. The decoder returns the parsed value, or it fails the `Effect` with a structured
`ParseError`:

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
handlers, service-worker message listeners, or application bootstrap, never inside a pure
pipeline step:

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
the type, with no `null` or `undefined`:

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
