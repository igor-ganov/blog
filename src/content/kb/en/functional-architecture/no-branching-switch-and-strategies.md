---
title: 'No if, no ternary — express choice exhaustively'
category: functional-architecture
summary: 'Replace if statements and ternary expressions with exhaustive switch, strategy lookup maps, or Effect/Match so the compiler proves every branch is handled.'
principle: 'No if statements, no ternary ?:, no &&/|| for control flow. Express choice with exhaustive switch, effect/Match, strategy lookup maps (Record<Key,Fn>), or Option/Either match.'
severity: strong
tags: [functional-architecture, exhaustiveness, strategy-pattern, switch, effect]
sources:
  - project: 'an engineering standard'
    date: 2026-06-07
    note: 'Ban IfStatement + ConditionalExpression; require switch/Match/strategy maps; switch-exhaustiveness-check.'
  - project: 'a content-admin SPA'
    date: 2026-03-24
    note: 'A major refactoring target: zero if statements, zero imperative loops across the entire codebase.'
related:
  - functional-architecture/currying-closures-higher-order
  - functional-architecture/lint-enforces-architecture
order: 2
updated: 2026-06-10
---

An `if` statement says nothing about how many cases exist. A ternary tells the compiler
there are exactly two, but not whether those two are the only ones possible. Neither
construct forces exhaustiveness. Add a third case to a union and the compiler stays
silent: the unhandled case reaches the runtime, and the error surfaces far from where the
branch should have been.

**`??` for value-defaulting is acceptable.** It selects a fallback value when a result is
absent, which is not control flow. The ban applies to branching on application logic:
`if (status === 'pending')`, `type === 'admin' ? adminView : userView`,
`isLoading && <Spinner />`.

## Why this matters

A major refactoring of a content-admin SPA (2026-03-24) set an explicit goal: **zero
`if` statements, zero imperative loops** across the entire codebase. That requirement
came from pain. Branching was scattered through service-worker message handlers, UI
components, and data-transform pipelines, so every new message type or status forced
developers to grep for each branch point and add a case by hand. The misses stayed silent
until production.

The engineering standard (2026-06-07) formalised the rule: every multi-branch must be
**exhaustive over a closed union** so the compiler proves totality. The mechanism matters
less than that guarantee, whether it's `switch` with a `never` default, `Effect/Match`,
or a `Record<Key, Fn>` strategy map.

The enforcement is lint, not review:

- `no-restricted-syntax` banning `IfStatement` and `ConditionalExpression` in `src/`.
- `@typescript-eslint/switch-exhaustiveness-check` requiring every `switch` to handle
  the full union.

## How to apply

**Replace an if-chain with a Record strategy map.**

The strategy map is a plain object that maps every member of a closed union to a
function. Add a new union member and you must add a new key to the map; the compiler flags
the map as incomplete before the build passes.

```ts
// Bad: if-chain over status — silent when a new status is added
const describeStatus = (status: TicketStatus): string => {
  if (status === 'open') return 'Awaiting triage';
  if (status === 'in-progress') return 'Being worked on';
  if (status === 'closed') return 'Resolved';
  return 'Unknown'; // ← silent fallthrough; compiler never flags this
};

// Good: strategy map — Record forces every key to be present
type TicketStatus = 'open' | 'in-progress' | 'closed';

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Awaiting triage',
  'in-progress': 'Being worked on',
  closed: 'Resolved',
  // compiler error if a union member is missing
};

const describeStatus = (status: TicketStatus): string => STATUS_LABEL[status];
```

When the handler needs to run a function rather than return a value, the map value is
a function:

```ts
type SyncMessage = { type: 'PUSH' } | { type: 'PULL' } | { type: 'FLUSH' };

type MessageHandler = (msg: SyncMessage) => void;

const SYNC_HANDLERS: Record<SyncMessage['type'], MessageHandler> = {
  PUSH:  handlePush,
  PULL:  handlePull,
  FLUSH: handleFlush,
};

const dispatchSyncMessage = (msg: SyncMessage): void =>
  SYNC_HANDLERS[msg.type](msg);
```

**Replace a ternary with an exhaustive switch.**

```ts
// Bad: ternary that silently mishandles a third role
const homeRoute = (role: UserRole): string =>
  role === 'admin' ? '/admin' : '/dashboard';

// Good: exhaustive switch — compiler errors when UserRole gains a new member
type UserRole = 'admin' | 'editor' | 'viewer';

const homeRoute = (role: UserRole): string => {
  switch (role) {
    case 'admin':  return '/admin';
    case 'editor': return '/editor';
    case 'viewer': return '/dashboard';
    default: {
      const _exhaustive: never = role;
      return _exhaustive; // unreachable; compiler proves it
    }
  }
};
```

**Use Effect/Match for pattern matching over ADTs.**

When the choice is over a discriminated union with payloads, `Match` from the `effect`
package provides exhaustive matching without a switch statement:

```ts
import { Match } from 'effect';

type ApiResult =
  | { _tag: 'Success'; data: User }
  | { _tag: 'NotFound' }
  | { _tag: 'Unauthorized'; reason: string };

const toDisplayMessage = Match.type<ApiResult>().pipe(
  Match.tag('Success',      ({ data }) => `Welcome, ${data.name}`),
  Match.tag('NotFound',     ()         => 'Resource not found'),
  Match.tag('Unauthorized', ({ reason }) => `Access denied: ${reason}`),
  Match.exhaustive,   // ← compile error if a tag is unhandled
);
```

`Match.exhaustive` is the compiler proof. Remove a `Match.tag` case and you get a type
error at the declaration site rather than a runtime crash at the call site.

**`??` is not banned.**

Value-defaulting is not control flow and is not subject to this rule:

```ts
// Acceptable: ?? selects a fallback when a value is absent
const label = config.label ?? 'Untitled';
```

The rule targets branching on application logic. `??` only says "use the right side if the
left is null or undefined", so there is no application-specific decision being made.

## Anti-patterns

```ts
// ❌ if-else chain — not exhaustive; new cases are silently unhandled
if (event.type === 'click') handleClick(event);
else if (event.type === 'keydown') handleKey(event);
// missing 'focus', 'blur', ... — no compiler warning

// ❌ Ternary standing in for a business rule — hides the case set
const icon = isError ? <ErrorIcon /> : <InfoIcon />;
// when a 'warning' state is added, this silently renders InfoIcon

// ❌ Short-circuit && for conditional render in JSX/Angular templates
// (use @if control-flow blocks or strategy maps instead)
{isVisible && <Component />}

// ❌ Nested ternaries — unreadable and still not exhaustive
const label = a ? 'A' : b ? 'B' : c ? 'C' : 'other';

// ❌ switch without a never default — the compiler cannot prove exhaustiveness
switch (status) {
  case 'active': return render();
  case 'inactive': return null;
  // 'pending' was added to the union; this switch silently falls through
}
```

Every pattern above shares one symptom: a union grows, the compiler stays silent, and the
new case reaches production unhandled.

## Enforcement

```js
// eslint.config.js (excerpt)
{
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'IfStatement',
        message: 'No if statements. Use switch, strategy maps, or Effect/Match.',
      },
      {
        selector: 'ConditionalExpression',
        message: 'No ternary. Use switch, strategy maps, or Effect/Match.',
      },
      {
        // ban logical && / || when used as control flow (short-circuit rendering)
        selector: 'LogicalExpression[operator="&&"]',
        message: 'No && for control flow. Use strategy maps or @if blocks.',
      },
    ],
    '@typescript-eslint/switch-exhaustiveness-check': 'error',
  },
}
```

These rules run in CI, and `eslint-disable` comments are not permitted. When the lint rule
fires, the fix is to introduce a strategy map or a proper `switch`, never to suppress the
warning.
