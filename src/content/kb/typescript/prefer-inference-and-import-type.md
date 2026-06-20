---
title: 'Let inference work: import type, readonly, visibility'
category: typescript
summary: 'Maximize inference and immutability: import type for type-only imports, readonly on every appropriate surface, explicit visibility modifiers, arrow functions, closures over classes, and globalThis instead of window.'
principle: 'Maximize inference and immutability: import type for types, readonly everywhere appropriate, explicit visibility modifiers, arrow functions, closures over classes, globalThis not window.'
severity: preferred
tags: [typescript, type-safety, immutability, inference]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'import type, readonly, arrow fns, closures, visibility, globalThis'
  - project: 'a content-admin SPA'
    date: 2026-03-25
    note: 'Grand Refactoring: strict types, zero overrides'
related:
  - typescript/no-casting
  - functional-architecture/currying-closures-higher-order
order: 4
updated: 2026-06-10
---

## Why this matters

Most type annotations are noise. The compiler already knows the type, so writing it again does not buy you any safety. What it buys you is brittleness: change a function's return type and every manual annotation at the call site has to change too. Lean on inference and your refactors stay local.

The rest of the rules here keep that inference reliable and the code predictable:

- `import type` tells the bundler a symbol is erased at emit, which is what lets `verbatimModuleSyntax` and tree-shaking work correctly.
- `readonly` blocks accidental mutation that inference cannot catch.
- Explicit visibility modifiers (`private`, `public`, `protected`) make intent searchable and keep stray members off the public surface of classes and Angular components.
- Arrow functions preserve `this` lexically and compose more cleanly than method declarations.
- Closures over classes skip inheritance hierarchies and make dependencies explicit.
- `globalThis` instead of `window` works in every JS environment (workers, Node, Deno) without special configuration.

The content-admin SPA grand refactoring (2026-03-25) made all of these hard rules under "strict types, zero overrides". Any override of a tsconfig option or any suppression comment needs a written justification tracked in the refactoring notes. The default is full strictness and full adherence to these patterns.

## How to apply

### import type for type-only imports

When an import is only used as a type annotation, use `import type`. The import then gets erased at emit, which avoids circular-reference runtime errors and satisfies `verbatimModuleSyntax`.

```typescript
// Bad — value import used only as a type annotation
import { User } from './user';

const greet = (user: User): string => `Hello, ${user.displayName}`;

// Good — type-only import; erased at emit
import type { User } from './user';

const greet = (user: User): string => `Hello, ${user.displayName}`;
```

In `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "verbatimModuleSyntax": true // enforces import type for type-only imports
  }
}
```

With `verbatimModuleSyntax` on, the compiler errors when a value import is used only as a type, so nobody has to remember the rule.

### readonly everywhere appropriate

Annotate every array, tuple, and object property that should not be mutated after creation. Prefer `Readonly<T>` for parameter shapes that are not modified.

```typescript
// Bad — mutable by default; callers can push() or reassign
interface Config {
  featureFlags: string[];
  timeout: number;
}

const applyFlags = (flags: string[]): void => {
  flags.push('debug'); // accidental mutation; compiler silent
};

// Good — mutation is a compile error
interface Config {
  readonly featureFlags: readonly string[];
  readonly timeout: number;
}

const applyFlags = (flags: readonly string[]): void => {
  // flags.push('debug'); // Error: Property 'push' does not exist on type 'readonly string[]'
  const withDebug = [...flags, 'debug']; // return new array instead
};
```

Use `as const` for literal values that should never widen:

```typescript
const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
// type is readonly ['north', 'south', 'east', 'west'], not string[]
```

### Arrow functions over method declarations

Arrow functions capture `this` lexically and drop into higher-order utilities without `.bind()`. Use them for standalone functions and callbacks.

```typescript
// Bad — method declaration; this is dynamic; requires .bind() in callbacks
class IssueService {
  fetchIssue(id: string) {
    return fetch(`/api/issues/${id}`).then(r => r.json());
  }
}

// Good — arrow function; no class needed for a stateless operation
const fetchIssue = (id: string): Promise<unknown> =>
  fetch(`/api/issues/${id}`).then(r => r.json());
```

### Closures over classes

A closure captures its dependencies explicitly and returns a typed interface. There is no class to subclass, and tests get to pass dependencies in as plain arguments.

```typescript
// Bad — class with implicit dependency through a property
class UserService {
  private readonly apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  fetchUser(id: string): Promise<unknown> {
    return fetch(`${this.apiUrl}/users/${id}`).then(r => r.json());
  }
}

// Good — closure; dependency is a parameter; return type is explicit
interface UserService {
  fetchUser: (id: string) => Promise<unknown>;
}

const createUserService = (apiUrl: string): UserService => ({
  fetchUser: (id) => fetch(`${apiUrl}/users/${id}`).then(r => r.json()),
});
```

The returned object type (`UserService`) is the public contract. The `apiUrl` binding stays private through lexical scoping, no `private` keyword required. Tests pass in a fake `apiUrl` as an argument.

### Explicit visibility modifiers

When a class is unavoidable (Angular components, for example), mark every member `private` or `public` explicitly. Never rely on implicit public.

```typescript
// Bad — implicit visibility; it is not clear what is part of the public API
class FeatureComponent {
  label = 'Features';
  items: string[] = [];

  loadItems() { /* ... */ }
  private formatItem(item: string) { return item.trim(); }
}

// Good — explicit; public API is obvious at a glance
class FeatureComponent {
  public readonly label = 'Features';
  private items: readonly string[] = [];

  public loadItems(): void { /* ... */ }
  private formatItem(item: string): string { return item.trim(); }
}
```

### globalThis instead of window

`window` is a browser-only global, so any code that touches it breaks in Web Workers, Node scripts, and server-side rendering. `globalThis` is the standard global object that exists in every JS environment.

```typescript
// Bad — browser-only
const origin = window.location.origin;

// Good — works in any JS environment that has location
const origin = globalThis.location?.origin ?? 'http://localhost';
```

### Let inference carry the return type

Annotate return types on public API functions (exported functions, Angular `@Input` setters) so the contract is documented and pinned. Drop the annotation where the function is internal and inference is unambiguous.

```typescript
// Verbose and redundant — inference already knows the return type
const double = (n: number): number => n * 2;

// Fine — inference works; annotation adds no information
const double = (n: number) => n * 2;

// Annotate when the function is an API contract
export const createUserService = (apiUrl: string): UserService => ({ /* ... */ });
//                                                  ^^^^^^^^^^^^ explicit: this is the contract
```

## Anti-patterns

### Mixing value and type imports

```typescript
// Bad — value import for a type-only use; bundler cannot tree-shake it
import { Config } from './config';
type LocalConfig = Pick<Config, 'timeout'>;
```

**Symptom**: bundle includes the `./config` module at runtime even though only the type is used.

### Mutable public arrays

```typescript
// Bad
class Store {
  items: Item[] = [];
}

// store.items.push(fakeItem); — test pollution; no compile error
```

**Symptom**: array is mutated from outside the class in tests or in unexpected call sites; bugs are non-deterministic and order-dependent.

### window references in shared code

```typescript
// Bad — shared utility that breaks in a Web Worker
const getTimezone = () => window.Intl.DateTimeFormat().resolvedOptions().timeZone;
```

**Symptom**: `ReferenceError: window is not defined` in any non-browser environment.

### Implicit public class members

```typescript
// Bad
class Component {
  internalState = 0;     // accidentally public
  public api = 'value';  // public, fine
}
```

**Symptom**: `internalState` is accessed from templates or tests and then becomes load-bearing, preventing future refactoring.

## Enforcement

- `verbatimModuleSyntax: true` in `tsconfig.json` enforces `import type`.
- `@typescript-eslint/explicit-member-accessibility` with `option: 'explicit'` enforces visibility modifiers.
- `@typescript-eslint/prefer-readonly` flags mutable class properties that are never reassigned after construction.
- `@typescript-eslint/no-restricted-globals` can ban `window` and suggest `globalThis`.
- `@typescript-eslint/explicit-module-boundary-types` enforces return type annotations on exported functions.

## See also

- [No casting](/kb/typescript/no-casting) — inference eliminates most situations where a cast is tempting.
- [Currying, closures, and higher-order functions](/kb/functional-architecture/currying-closures-higher-order) — the closure pattern for service composition in depth.
