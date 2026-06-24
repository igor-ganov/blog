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

TypeScript inherits both of JavaScript's absence sentinels, `null` and `undefined`, and that inheritance is a trap. Every nullable value forces a double-check: `if (x !== null && x !== undefined)`, or the shorthand `x != null`. The check is noise, but the worse cost is inconsistency. One function returns `null`, another returns `undefined`, and now the caller has to remember which is which. That kind of knowledge doesn't compose across a codebase.

So the rule here is that `null` does not exist in domain code. Only `undefined` means a value is absent, which leaves a single sentinel to check for.

The incident that made this rule non-negotiable was a Jira client app on 2026-06-08. The Jira REST API returns unassigned issues with `"assignee": null` in the JSON payload, which is a deliberate JSON `null` rather than an omitted field. The internal `mapUser` helper guarded against `undefined` (TypeScript's absent value) but had no branch for `null`. When an unassigned issue came through, `mapUser(issue.assignee)` got `null`, slipped past the guard, and crashed at runtime trying to read `.displayName` off it. The fix was two lines: normalize `null` to `undefined` at the deserialization boundary, then strip every `null` reference out of the domain. The boundary swallowed the external convention so the domain never had to know about it.

There's a second lesson here about richer absence. Sometimes `T | undefined` isn't expressive enough and you need to tell "not yet loaded" apart from "loaded but empty" and "loaded with data". The tempting move is to reach for `T | null | undefined` and hand each sentinel a meaning, but those meanings live nowhere the type system or a reader can see them. Use a discriminated union instead.

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

External systems emit `null`: REST APIs, databases, localStorage, third-party SDKs. Take that at the single point where untyped data enters, convert it to `undefined` there, and let nothing downstream know it ever existed.

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

After `mapIssue`, every consumer checks `if (issue.assignee !== undefined)` and nothing else. The double-sentinel check (`!= null`) stays quarantined inside that one mapping function.

### 3. Model richer absence with a discriminated union

When the difference between "no data yet", "empty result", and "data present" actually carries meaning, put it in the type instead of overloading two sentinels.

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

Add a new state to `Loaded` without updating `renderIssue` and the compiler errors out. A comment can't enforce that for you.

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

**Symptom**: call sites pile up `!== null` checks next to `!== undefined` checks, and one of them is always missing because nobody remembers which functions return which sentinel.

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

**Symptom**: the only record of what `null` means versus `undefined` is a comment, and comments rot away from the code they describe.

### Casting null away instead of normalizing it

```typescript
// Bad — the cast hides a real runtime risk
const assignee = (raw.assignee as User | undefined) ?? undefined;

// Good — normalize explicitly; if raw.assignee is unexpectedly shaped,
//         the boundary validator (see validate-at-the-boundary) catches it
const assignee = raw.assignee != null ? mapUser(raw.assignee) : undefined;
```

**Symptom**: the cast passes at compile time, then at runtime `raw.assignee` turns out to be `null`, so reading `.displayName` off the "typed" value throws. That's the Jira client app crash from 2026-06-08.

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

That suppression comment is the recorded justification the `strong` severity rule asks for.

## See also

- [Validate at the boundary, compute within](/principles/typescript/validate-at-the-boundary) — the companion rule that explains how to parse and normalize external data in one place.
- [No casting](/principles/typescript/no-casting) — casting masks the same class of bug that null-vs-undefined confusion causes.
