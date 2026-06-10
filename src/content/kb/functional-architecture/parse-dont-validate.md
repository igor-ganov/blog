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

A function that validates returns `boolean`. The information — whether the input
conforms to a shape — is computed and then discarded. The caller still has the untyped
value. To use it as the expected type, the caller must cast. That cast is unverified: it
asserts the shape the validator just checked, but the compiler connects the two with
nothing but trust.

A function that parses returns the typed value or an error. The conformance check and
the type assignment are one operation. There is no cast. Downstream code receives a
value already in the precise type; it does not need to check again, and it cannot
forget to check.

The phrase is from Alexis King's 2019 essay "Parse, don't validate". The practice in
this codebase is grounded in Effect.Schema and in runtime guards written at explicit
boundary points.

## Why this matters

A major refactoring of a content-admin SPA (2026-03-24) placed Effect.Schema
decoders in `src/validation/`. Every value entering the service-worker or client layer
from a network response, a `postMessage`, or `IndexedDB` was decoded through a Schema.
The decoder either returned a fully-typed value or failed the Effect pipeline with a
structured `ParseError`. No code inside the boundary used `as`, `JSON.parse` without
decoding, or defensive `typeof` checks.

An edge bot project (2026-05-23) applied the same discipline in
`src/util/json.ts`. The producer client consumed raw JSON from an external queue; all
parsing happened in `json.ts` before the value was passed to any business logic. The
typed client interface downstream never saw `unknown`.

In both cases, the boundary file is a clear physical marker: code above it is untyped;
code below it is typed. The parser is the transition.

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

`processUser` never sees `unknown`. It cannot be called before parsing succeeds. There
is no cast to write, no cast to audit, no cast to become stale when `User` changes shape.

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

When the full type is only known after checking a discriminant, use `Schema.Union` with
`Schema.Literal` to narrow automatically:

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

In a context where the Effect bundle cost is prohibitive (see
[errors-as-values-with-effect](/kb/functional-architecture/errors-as-values-with-effect)
for when that exception applies), use a proper type-predicate guard rather than a
boolean validator:

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

Even here the cast is localised to the single function that performed the check. No
other file casts.

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

Each pattern shares a flaw: untyped input reaches code that assumes it is typed. The
assumption is not verified by the compiler. When the input does not match, the error
surfaces far from where the untyped value entered.

## Enforcement

- `@typescript-eslint/no-explicit-any` and `biome/noExplicitAny` prevent `any` from
  masking untyped input.
- `biome/noNonNullAssertion` and `@typescript-eslint/no-non-null-assertion` prevent
  non-null assertions on values that have not been parsed.
- Architectural convention: any file that imports from a boundary-layer module
  (`src/util/json.ts`, `src/validation/`) receives a typed value; it must not call
  `JSON.parse` or access `.json()` on a `Response` directly.

The boundary files are the single location where `unknown` is permissible. Lint rules
enforce the rest. No `as` casts appear outside the parser function that performed the
exhaustive check.
