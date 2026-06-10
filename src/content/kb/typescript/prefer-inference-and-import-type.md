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

TypeScript inference is powerful enough that most type annotations are noise: the compiler already knows the type. Redundant annotations do not make code safer; they make it louder and more brittle — when a function return type changes, every manual annotation on the call site also needs updating. Trusting inference reduces ceremony and keeps refactors local.

The corollary rules in this section exist to make inference reliable and the code predictable:

- `import type` tells the bundler a symbol is erased at emit — enabling `verbatimModuleSyntax` and tree-shaking to work correctly.
- `readonly` prevents accidental mutation that inference cannot catch.
- Explicit visibility modifiers (`private`, `public`, `protected`) make intent searchable and prevent accidental surface area on classes or Angular components.
- Arrow functions preserve `this` lexically and compose better than method declarations.
- Closures over classes avoid inheritance hierarchies and make dependencies explicit.
- `globalThis` instead of `window` works in every JS environment (workers, Node, Deno) without special configuration.

The content-admin SPA grand refactoring (2026-03-25) codified all of these as hard rules under "strict types, zero overrides". Every override of a tsconfig option, every suppression comment, requires a written justification tracked in the refactoring notes. The default is full strictness with full adherence to these patterns.

## How to apply

### import type for type-only imports

When an import is only used as a type annotation, use `import type`. This guarantees the import is erased at emit, prevents circular-reference runtime errors, and satisfies `verbatimModuleSyntax`.

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

With `verbatimModuleSyntax`, the compiler errors if a value import is used only as a type — so the rule is mechanically enforced.

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

Arrow functions capture `this` lexically, compose with higher-order utilities without `.bind()`, and serialize consistently. Use them for all standalone functions and callbacks.

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

A closure captures its dependencies explicitly and returns a typed interface. It is simpler than a class, easier to test (pass dependencies as arguments), and avoids inheritance.

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

The returned object type (`UserService`) is the public contract. The `apiUrl` binding is private by lexical scoping, not by a `private` keyword. Tests inject a fake `apiUrl` as a function argument.

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

`window` is a browser-only global. Code that references `window` fails in Web Workers, Node scripts, and server-side rendering. `globalThis` is the standard, environment-agnostic global object.

```typescript
// Bad — browser-only
const origin = window.location.origin;

// Good — works in any JS environment that has location
const origin = globalThis.location?.origin ?? 'http://localhost';
```

### Let inference carry the return type

Annotate return types on public API functions (exported functions, Angular `@Input` setters) for documentation and safety. Omit them where inference is unambiguous and the function is internal.

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
