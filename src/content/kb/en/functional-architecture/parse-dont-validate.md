---
title: 'Parse, don''t validate'
category: functional-architecture
summary: 'At every system boundary, parse raw input into a precise type once; downstream code operates on the parsed type and never re-checks or casts.'
principle: 'At the boundary, parse untyped input into a precise type once; downstream code receives the parsed type and never re-checks or casts.'
severity: strong
tags: [functional-architecture, parsing, validation, effect-schema, type-safety, boundaries]
sources:
  - project: 'a content-admin SPA'
    date: 2026-03-24
    note: 'Effect.Schema decoders in src/validation/ used throughout a major refactoring.'
  - project: 'an edge bot (Cloudflare Workers)'
    date: 2026-05-23
    note: 'Typed producer client with runtime guards parsing JSON at the boundary in src/util/json.ts.'
related:
  - typescript/validate-at-the-boundary
  - typescript/no-casting
  - functional-architecture/errors-as-values-with-effect
order: 6
updated: 2026-06-10
---

A function that validates returns `boolean`. It computes whether the input conforms to a
shape, then throws that answer away. The caller is left holding the same untyped value it
started with, so to use it as the expected type it has to cast. The cast is unverified.
It asserts the exact shape the validator just checked, but nothing in the compiler ties
those two facts together. You are trusted on your word.

A function that parses returns the typed value or an error. The conformance check and the
type assignment are the same operation, so there is no cast. Downstream code receives a
value that already has the precise type. It never re-checks, and it can't forget to check.

The phrase comes from Alexis King's 2019 essay "Parse, don't validate". In this codebase
the practice rests on Effect.Schema and on runtime guards written at explicit boundary
points.

## Why this matters

A major refactoring of a content-admin SPA (2026-03-24) put Effect.Schema decoders in
`src/validation/`. Every value entering the service-worker or client layer, whether from
a network response, a `postMessage`, or `IndexedDB`, was decoded through a Schema. The
decoder returned a fully-typed value or failed the Effect pipeline with a structured
`ParseError`. Inside the boundary you won't find `as`, a bare `JSON.parse`, or defensive
`typeof` checks.

An edge bot project (2026-05-23) used the same discipline in `src/util/json.ts`. The
producer client pulled raw JSON off an external queue, and all of the parsing happened in
`json.ts` before anything reached business logic. The typed client interface downstream
never saw `unknown`.

The boundary file works as a physical marker in both cases. Code above it is untyped, code
below it is typed, and the parser is what carries you across.

## How to apply

**Contrast: validate (information lost) vs. parse (information kept).**

```ts
// Bad: validator — returns boolean; caller must cast; type system is bypassed
const isUser = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof (value as { id: unknown }).id === 'string'; // already forced to cast here

const handleResponse = async (res: Response): Promise<void> => {
  const raw = await res.json();
  if (!isUser(raw)) throw new Error('Invalid user');
  const user = raw as User;   // ← cast; compiler trusts you, not the check
  processUser(user);
};

// Good: parser — returns User or fails; no cast anywhere
import { Schema, Effect } from 'effect';

const UserSchema = Schema.Struct({
  id:    Schema.String,
  name:  Schema.String,
  email: Schema.String,
});

type User = Schema.Schema.Type<typeof UserSchema>;

const parseUser = Schema.decode(UserSchema);
// Type: (u: unknown) => Effect.Effect<User, ParseError>

const handleResponse = (res: Response): Effect.Effect<void, ParseError | HttpError> =>
  pipe(
    Effect.tryPromise({ try: () => res.json(), catch: (e) => new HttpError(e) }),
    Effect.flatMap(parseUser),
    Effect.flatMap(processUser), // processUser receives User, not unknown
  );
```

`processUser` never sees `unknown`, and it can't run until parsing has already succeeded.
There is no cast to write, none to audit, and none left to go stale when `User` changes
shape.

**Boundary file as the transition point.**

```ts
// src/util/json.ts — the boundary; only file that touches `unknown`
import { Schema, Effect, pipe } from 'effect';

export const decodeJson =
  <A, I>(schema: Schema.Schema<A, I>) =>
  (raw: unknown): Effect.Effect<A, ParseError> =>
    Schema.decode(schema)(raw);

// All other files import typed values, never raw JSON
```

```ts
// src/sync/process-sync-message.ts — downstream; no unknown, no cast
import { decodeJson } from '../util/json';
import { SyncMessageSchema, type SyncMessage } from './sync-message-schema';

const parseSyncMessage = decodeJson(SyncMessageSchema);

export const processSyncMessage = (
  raw: unknown,
): Effect.Effect<void, ParseError | SyncError> =>
  pipe(
    parseSyncMessage(raw),
    Effect.flatMap(dispatchSyncMessage),
  );
```

**Incremental narrowing with Schema.**

When the full type is only known after you check a discriminant, reach for `Schema.Union`
with `Schema.Literal` and let it narrow for you:

```ts
const ApiResponseSchema = Schema.Union(
  Schema.Struct({ _tag: Schema.Literal('ok'),    data: UserSchema }),
  Schema.Struct({ _tag: Schema.Literal('error'), message: Schema.String }),
);

type ApiResponse = Schema.Schema.Type<typeof ApiResponseSchema>;

// After decode, _tag narrows the union — no manual type guard needed
const render = (response: ApiResponse): string => {
  switch (response._tag) {
    case 'ok':    return response.data.name;   // data: User — fully typed
    case 'error': return response.message;
    default: {
      const _: never = response;
      return _;
    }
  }
};
```

**Type guards as a fallback (when Effect is unavailable).**

Where the Effect bundle cost is too high to justify (see
[errors-as-values-with-effect](/principles/functional-architecture/errors-as-values-with-effect)
for when that exception applies), write a proper type-predicate guard instead of a boolean
validator:

```ts
// Acceptable fallback: predicate guard — the check and the type are connected
const parseUser = (value: unknown): User | undefined => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value && typeof (value as Record<string, unknown>).id === 'string' &&
    'name' in value && typeof (value as Record<string, unknown>).name === 'string' &&
    'email' in value && typeof (value as Record<string, unknown>).email === 'string'
  ) {
    return value as User; // the only acceptable cast: immediately after exhaustive check
  }
  return undefined;
};
```

Even here the cast stays inside the one function that ran the check. No other file casts.

## Anti-patterns

```ts
// ❌ Boolean validator — caller must cast; two separate operations, easy to skip one
const validate = (v: unknown): boolean => typeof v === 'object' && v !== null && 'id' in v;
const data = raw as Entity; // ← cast without running the validator

// ❌ Parsing deep inside business logic — the boundary is invisible; unknown leaks in
const applyDiscount = (raw: unknown): number => {
  const order = raw as Order; // trust, no check
  return order.total * 0.9;
};

// ❌ Re-parsing at multiple call sites — parsing is not centralised; schema drift
//    between sites is invisible
// component-a.ts: Schema.decode(OrderSchemaV1)(raw)
// component-b.ts: Schema.decode(OrderSchemaV2)(raw)  // different schema, no error

// ❌ JSON.parse without decoding — raw object flows into business logic as unknown
const order: Order = JSON.parse(localStorage.getItem('order')!); // cast + no check
```

Every one of these has the same flaw. Untyped input reaches code that assumes it is typed,
and the compiler never checked that assumption. When the input doesn't match, the error
surfaces far away from where the untyped value first entered.

## Enforcement

- `@typescript-eslint/no-explicit-any` and `biome/noExplicitAny` prevent `any` from
  masking untyped input.
- `biome/noNonNullAssertion` and `@typescript-eslint/no-non-null-assertion` prevent
  non-null assertions on values that have not been parsed.
- Architectural convention: any file that imports from a boundary-layer module
  (`src/util/json.ts`, `src/validation/`) receives a typed value; it must not call
  `JSON.parse` or access `.json()` on a `Response` directly.

The boundary files are the only place where `unknown` is allowed, and lint rules cover the
rest. The only `as` cast permitted lives inside the parser function that ran the exhaustive
check.
