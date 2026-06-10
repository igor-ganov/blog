---
title: 'No null — model absence with undefined'
category: typescript
summary: 'Use undefined as the single absence sentinel; normalize external null at the boundary and model richer absence with discriminated unions.'
principle: 'Never use null. Use undefined for absence; when you need an extra semantic value, create a type for it.'
severity: strong
tags: [typescript, type-safety, null-safety]
sources:
  - project: 'a Jira client app'
    date: 2026-06-08
    note: 'Jira sends assignee:null; mapUser only handled undefined and crashed'
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'No null — use undefined'
related:
  - typescript/no-casting
  - typescript/validate-at-the-boundary
order: 2
updated: 2026-06-10
---

## Why this matters

TypeScript inherits two absence sentinels from JavaScript — `null` and `undefined` — and that inheritance is a trap. Every nullable value forces a double-check: `if (x !== null && x !== undefined)`, or the shorthand `x != null`. Double-checking is noise, but the real cost is inconsistency: one function returns `null`, another returns `undefined`, and the caller has to know which one. That knowledge does not compose.

The rule in this codebase is simple: **`null` does not exist in domain code**. Only `undefined` represents the absence of a value. One sentinel, one check, one mental model.

The concrete incident that made this rule non-negotiable happened in a Jira client app on 2026-06-08. The Jira REST API returns unassigned issues with `"assignee": null` in the JSON payload — a deliberate JSON `null`, not an omitted field. The internal `mapUser` helper was written defensively against `undefined` (the TypeScript absent value) but had no branch for `null`. When an unassigned issue arrived, `mapUser(issue.assignee)` received `null`, fell through the guard, and crashed at runtime while trying to access `.displayName` on it. The fix was two lines: normalize `null` to `undefined` at the deserialization boundary, then delete every `null` reference from the domain. The boundary absorbed the external world's conventions; the domain stayed clean.

The secondary lesson is about richer absence. When `T | undefined` is not expressive enough — when you need to distinguish "not yet loaded" from "loaded but empty" from "loaded with data" — the temptation is to reach for `T | null | undefined` and assign each sentinel a meaning. That way lies madness; meanings are invisible to the type system and invisible to readers. The correct answer is a discriminated union.

## How to apply

### 1. Ban null from domain types

Never declare a property or parameter type as `T | null`. Use `T | undefined`, or make the property optional.

```typescript
// Bad — null leaks into the domain
interface Issue {
  assignee: User | null;
}

// Good — undefined is the single absence sentinel
interface Issue {
  assignee: User | undefined;
}

// Also good — optional property implies undefined when absent
interface Issue {
  assignee?: User;
}
```

### 2. Normalize null at the boundary

External systems — REST APIs, databases, localStorage, third-party SDKs — emit `null`. Accept that reality at the single point where untyped data enters the system, convert it to `undefined`, and let nothing else know it ever existed.

```typescript
// boundary/jira-api.ts

// Raw shape coming off the wire — null is real here
interface JiraIssueRaw {
  id: string;
  assignee: JiraUserRaw | null; // Jira literally sends null
}

// Domain shape — null does not exist
interface Issue {
  id: string;
  assignee: User | undefined;
}

const mapUser = (raw: JiraUserRaw | undefined): User => ({
  id: raw.accountId,
  displayName: raw.displayName,
});

// The one place that knows about null
const mapIssue = (raw: JiraIssueRaw): Issue => ({
  id: raw.id,
  // null → undefined happens here; domain code never sees null
  assignee: raw.assignee != null ? mapUser(raw.assignee) : undefined,
});
```

After `mapIssue`, every consumer checks `if (issue.assignee !== undefined)` and nothing else. The double-sentinel check (`!= null`) is quarantined to the one mapping function.

### 3. Model richer absence with a discriminated union

When the distinction between "no data yet", "empty result", and "data present" is semantically meaningful, encode it in the type rather than overloading two sentinels.

```typescript
// Bad — null and undefined carry hidden meanings that only comments explain
interface IssueState {
  issue: Issue | null | undefined; // null = loaded empty, undefined = not yet loaded?
}

// Good — each state is a named, exhaustive branch
type Loaded<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'empty' }
  | { state: 'ready'; value: T };

// Callers switch on state — the compiler enforces exhaustiveness
const renderIssue = (loaded: Loaded<Issue>): string => {
  switch (loaded.state) {
    case 'idle':    return 'Not started';
    case 'loading': return 'Loading…';
    case 'empty':   return 'No issue found';
    case 'ready':   return loaded.value.id;
  }
};
```

The compiler will error if a new state is added to `Loaded` and `renderIssue` is not updated. No comment can do that.

### 4. Enable strict null checks

`tsconfig.json` must have `"strictNullChecks": true` (or `"strict": true`). Without it, the type system cannot enforce any of the above.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true // implies strictNullChecks
  }
}
```

## Anti-patterns

### Returning null from domain functions

```typescript
// Bad — callers must know to check for null AND handle undefined from other sources
const findUser = (id: string): User | null => {
  const user = store.get(id);
  return user ?? null; // deliberately creates null
};

// Good — one sentinel for all absence
const findUser = (id: string): User | undefined => store.get(id);
```

**Symptom**: call sites accumulate `!== null` checks next to `!== undefined` checks. One is always missing because developers forget which functions return which sentinel.

### Using null and undefined as overloaded signals

```typescript
// Bad — the difference between null and undefined here is documented nowhere permanent
const getConfig = (): Config | null | undefined => {
  if (!initialized) return undefined; // "not ready"
  if (!configExists) return null;     // "ready but absent"
  return config;
};

// Good — discriminated union carries the meaning in the type
type ConfigResult =
  | { status: 'pending' }
  | { status: 'absent' }
  | { status: 'loaded'; config: Config };

const getConfig = (): ConfigResult => { /* ... */ };
```

**Symptom**: the distinction between `null` and `undefined` is only documented in a comment. Comments rot; the type system does not.

### Casting null away instead of normalizing it

```typescript
// Bad — the cast hides a real runtime risk
const assignee = (raw.assignee as User | undefined) ?? undefined;

// Good — normalize explicitly; if raw.assignee is unexpectedly shaped,
//         the boundary validator (see validate-at-the-boundary) catches it
const assignee = raw.assignee != null ? mapUser(raw.assignee) : undefined;
```

**Symptom**: the cast succeeds at compile time but at runtime `raw.assignee` is `null`, so accessing `.displayName` on the "typed" value throws. This is exactly the Jira client app crash scenario from 2026-06-08.

## Enforcement

Add the `no-null-keyword` ESLint rule from `@typescript-eslint`:

```jsonc
// eslint.config.ts (flat config)
{
  "rules": {
    "@typescript-eslint/no-null-assertion": "error",
    // ban the literal null keyword in type positions and expressions
    "@typescript-eslint/ban-types": ["error", {
      "types": { "null": "Use undefined or a discriminated union instead." }
    }]
  }
}
```

For boundary files that must accept external `null`, disable the rule locally with a comment explaining why:

```typescript
// eslint-disable-next-line @typescript-eslint/ban-types -- Jira API emits null for absent assignee
const mapIssue = (raw: JiraIssueRaw): Issue => ({ /* ... */ });
```

The suppression comment is the explicit, recorded reason required by the `strong` severity rule.

## See also

- [Validate at the boundary, compute within](/kb/typescript/validate-at-the-boundary) — the companion rule that explains how to parse and normalize external data in one place.
- [No casting](/kb/typescript/no-casting) — casting masks the same class of bug that null-vs-undefined confusion causes.
