---
title: 'Validate at the boundary, compute within'
category: typescript
summary: 'Parse and validate untyped external data once, at the entry point; everywhere inside the system data is already typed and no casting is needed.'
principle: 'Untyped data is validated once, at the edge, with a real runtime check; inside the system everything is already typed, so nothing is cast.'
severity: strong
tags: [typescript, type-safety, validation, parsing]
sources:
  - project: 'a content-admin SPA'
    date: 2026-03-24
    note: 'Effect.Schema decoders in src/validation; validate at boundary, compute internally; deterministic type transformations'
  - project: 'an edge bot (Cloudflare Workers)'
    date: 2026-05-23
    note: 'runtime guards in src/util/json.ts kept no-any/no-as'
related:
  - typescript/no-casting
  - functional-architecture/parse-dont-validate
  - functional-architecture/errors-as-values-with-effect
order: 3
updated: 2026-06-10
---

## Why this matters

TypeScript's type system covers every line of code it can see. It cannot see what arrives over the network, out of `localStorage`, from a CLI argument, or from a third-party webhook. At those entry points, the runtime value is `unknown`. The instinctive response is to cast it: `const config = JSON.parse(raw) as Config`. The cast makes the red squiggle disappear and introduces a silent lie — the type annotation says `Config` but the runtime value might be anything.

When the lie survives long enough to reach a function that depends on a specific shape, the failure is far from the bad cast, the stack trace is confusing, and the true cause is invisible.

The correct response is to **validate once, at the edge**. Parse the unknown value into a typed one, or produce an explicit error. After that single checkpoint, every internal function receives a type it can trust — no casts, no defensive `typeof` checks, no `as unknown as T` chains.

Two projects codified this rule with real infrastructure:

**A content-admin SPA (2026-03-24/25)**: a grand refactoring introduced `src/validation/` containing Effect.Schema decoders for every external data shape — API responses, form submissions, persisted state. The design note reads: "validate at boundaries / compute internally; deterministic type transformations." Every API layer passes its response through a decoder before returning to domain code. Violating this was the root cause of a class of silent data corruption bugs the refactoring fixed.

**An edge bot (Cloudflare Workers) (2026-05-23)**: a lightweight CLI tool with no framework dependency. Rather than pulling in Effect, the team wrote manual runtime guards in `src/util/json.ts`. The constraint was the same: no `any`, no `as`. The guards returned typed results or threw descriptive errors. Internal code had zero type assertions.

## How to apply

### 1. Treat every external input as unknown

Assign `unknown` to the raw value and force a parse step before use.

```typescript
// src/boundary/api.ts

// Bad — cast silences the compiler, but the value is still unknown at runtime
const fetchConfig = async (): Promise<Config> => {
  const res = await fetch('/api/config');
  return res.json() as Config; // lie
};

// Good — parse and validate; return a typed result or fail explicitly
import { Schema } from 'effect';

const ConfigSchema = Schema.Struct({
  apiUrl: Schema.String,
  timeout: Schema.Number,
  featureFlags: Schema.Array(Schema.String),
});

type Config = Schema.Schema.Type<typeof ConfigSchema>;

const fetchConfig = async (): Promise<Config> => {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw: unknown = await res.json();
  return Schema.decodeUnknownSync(ConfigSchema)(raw);
  // Throws a descriptive ParseError if the shape is wrong.
  // Domain code receives a Config it can trust.
};
```

### 2. Write runtime guard functions for lightweight contexts

When Effect is not in scope, a narrow type guard is sufficient. It still validates, still returns a typed value, and still avoids `as`.

```typescript
// src/util/json.ts  (edge bot pattern, 2026-05-23)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasStringField = (obj: Record<string, unknown>, key: string): boolean =>
  key in obj && typeof obj[key] === 'string';

interface StoredSession {
  token: string;
  expiresAt: number;
}

const parseStoredSession = (raw: unknown): StoredSession => {
  if (!isRecord(raw)) throw new Error('session: expected object');
  if (!hasStringField(raw, 'token')) throw new Error('session: missing token');
  if (typeof raw['expiresAt'] !== 'number') throw new Error('session: expiresAt must be a number');
  return { token: raw['token'] as string, expiresAt: raw['expiresAt'] };
  //                            ^^^^^^^^ only cast after the runtime check proves the type
};

// Caller
const session = parseStoredSession(JSON.parse(localStorage.getItem('session') ?? '{}'));
// session is StoredSession — no assertion needed downstream
```

The one `as string` after the explicit `typeof` check is legitimate: the guard already proved the type; the cast reflects a known fact rather than an assumption. Compare this to casting the whole parsed object at once.

### 3. Centralise decoders in one layer

Place all boundary decoders in a dedicated module (`src/validation/`, `src/boundary/`, or `src/decoders/`). Domain code imports typed values from that layer; it never imports `Schema` or guard utilities directly.

```
src/
  boundary/
    api.ts          ← fetchConfig, fetchIssues — all decoders live here
    local-storage.ts ← parseStoredSession, parseUserPrefs
  domain/
    config.ts       ← uses Config type; no decoding logic
    issue.ts        ← uses Issue type; no decoding logic
```

This makes it trivial to audit: if a schema changes, there is exactly one file to update.

### 4. Return typed errors instead of throwing where appropriate

For code that uses Effect or Result types, decode into an `Either` rather than throwing. This makes validation failures part of the explicit return type and forces callers to handle them.

```typescript
import { Schema, Either } from 'effect';

const decodeConfig = (raw: unknown): Either.Either<Config, string> =>
  Either.mapLeft(
    Schema.decodeUnknownEither(ConfigSchema)(raw),
    (err) => `Config parse error: ${err.message}`,
  );

// Caller
const result = decodeConfig(raw);
if (Either.isLeft(result)) {
  logger.error(result.left);
  return;
}
const config = result.right; // Config — fully typed
```

See [errors-as-values-with-effect](/kb/functional-architecture/errors-as-values-with-effect) for the full pattern.

## Anti-patterns

### Casting the parsed value

```typescript
// Bad
const config = JSON.parse(raw) as Config;

// Symptom: config.featureFlags.map(...) throws "featureFlags is not a function"
// because featureFlags was actually a string in the stored JSON.
// The error appears in domain code, not at the parse site.
```

The cast is a deferred runtime exception with a misleading origin.

### Validating deep inside domain logic

```typescript
// Bad — domain function does its own ad-hoc shape check
const applyConfig = (config: Config): void => {
  if (typeof config.timeout !== 'number') {
    console.warn('bad config, using default');
    config = defaultConfig; // mutation + hidden fallback
  }
  // ...
};
```

**Symptom**: validation logic is scattered across the domain, defaults silently hide corrupt data, and the "validated" type is never actually guaranteed.

### Using any as a transit type

```typescript
// Bad
const raw: any = await res.json();
const config: Config = raw; // no error, no check

// Symptom: identical to the cast case — silent lie, remote failure.
```

`any` disables the type checker entirely. Once a value is `any`, there is no recovery; the lie propagates to every function it touches.

### Partial validation

```typescript
// Bad — validates one field, ignores the rest
const parseConfig = (raw: unknown): Config => {
  if (!isRecord(raw)) throw new Error('not an object');
  return raw as Config; // cast after minimal check
};
```

**Symptom**: the unchecked fields blow up in domain code. Partial validation is worse than no validation because it gives a false sense of safety.

## Enforcement

- Enable `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unsafe-assignment` — both flag the patterns above at lint time.
- In CI, run `tsc --noEmit` with `strict: true`. A properly parsed value never needs `as`; if a cast appears, it is a signal the boundary was bypassed.
- Code review checklist: any function that calls `JSON.parse`, `res.json()`, `localStorage.getItem`, `process.env`, or `process.argv` must pipe its result through a decoder in the same file before returning.

## See also

- [No casting](/kb/typescript/no-casting) — explains why `as` is not a substitute for a real runtime check.
- [No null — model absence with undefined](/kb/typescript/no-null-use-undefined) — null normalization is part of boundary validation.
- [Parse, don't validate](/kb/functional-architecture/parse-dont-validate) — the functional-architecture framing of the same principle.
