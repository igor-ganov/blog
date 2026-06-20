---
title: 'Currying, closures and higher-order functions over classes'
category: functional-architecture
summary: 'Capture config and dependencies with currying and closures rather than class constructors; build reuse through higher-order functions and strategy maps.'
principle: 'Use currying for config-then-data, closures to capture context instead of class fields, and higher-order functions/strategy maps to remove duplication.'
severity: preferred
tags: [functional-architecture, currying, closures, higher-order-functions, composition]
sources:
  - project: 'an engineering standard'
    date: 2026-06-07
    note: 'Currying (config)=>(data)=>result; closures over classes; HOFs; strategy maps over branching.'
  - project: 'a content-admin SPA'
    date: 2026-03-24
    note: 'A major refactoring goal: reuse via currying; treat project as a unified system; composition/pipe.'
related:
  - functional-architecture/no-branching-switch-and-strategies
  - typescript/prefer-inference-and-import-type
order: 3
updated: 2026-06-10
---

Classes bundle state and behaviour so something can manage their lifetime. A functional
codebase has no lifetime to manage. Pure functions hold no state, and dependencies are
either passed as arguments or captured once at the composition root. Currying and closures
cover the same ground a constructor does, with less machinery and far better composability.

The shape is `(config) => (data) => result`. The first call binds configuration once, and
the second call is the pure transformation. What you get back is a partially-applied
function you can pass around, compose with `pipe`, or drop into a strategy map, with no
class, no `this`, and no `new`.

## Why this matters

A major refactoring of a content-admin SPA (2026-03-24) set out two goals that currying
serves directly: **"reuse via currying"** and **"treat the project as a unified system"**
using **"currying/composition/pipe"**. Before the refactoring, reuse came from subclassing
and abstract base classes, each dragging along its own constructor chain, field
initialisation, and lifecycle. A new variant meant a new subclass, and adding one shared
behaviour meant editing every class in the hierarchy.

After the refactoring, shared behaviour lived in a curried function returned from the
composition root, and new variants were just new entries in a strategy map. No subclass,
no constructor, no `this`.

The engineering standard (2026-06-07) wrote the pattern down:

- Currying separates *configuration* from *data*: `(config) => (data) => result`.
- Closures replace class fields: dependencies are captured in an outer scope, not stored
  as `this.dep`.
- Higher-order functions take or return functions to eliminate structural duplication.
- Strategy maps (`Record<Key, Fn>`) replace branching over variants.

## How to apply

**Curried configured function, reused across call sites.**

The outer call happens once at the composition root. Every downstream call site gets a
pre-configured function and never has to know where the configuration came from.

```ts
// Bad: class with constructor injection — callers must instantiate, carry a reference
class DateFormatter {
  constructor(private readonly locale: string) {}
  format(d: Date): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'short' }).format(d);
  }
}
const formatter = new DateFormatter('en-GB');
const label = formatter.format(new Date());

// Good: curried function — configuration bound once, data flows through
const makeDateFormatter =
  (locale: string) =>
  (d: Date): string =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(d);

// Composition root (once)
const formatDate = makeDateFormatter('en-GB');

// Call sites (data-only, no config concern)
const label = formatDate(new Date());
const labels = dates.map(formatDate);          // composes directly with map
```

The curried form drops straight into `map`, `pipe`, and strategy maps. The class form
needs `.format.bind(formatter)` or a wrapper lambda every single time.

**Closure capturing dependencies instead of class fields.**

A closure is a function returned from another function that captures variables from the
outer scope. It does the work of `this.dep` without `this`.

```ts
// Bad: class capturing an HTTP client as a field
class UserRepository {
  constructor(private readonly http: HttpClient) {}
  getUser(id: string): Promise<User> {
    return this.http.get(`/users/${id}`).then(parseUser);
  }
}

// Good: closure — http is captured, not stored; the returned function is pure in shape
const makeUserRepository =
  (http: HttpClient) =>
  (id: string): Promise<User> =>
    http.get(`/users/${id}`).then(parseUser);

// Composition root
const getUser = makeUserRepository(httpClient);

// Call site
const user = await getUser('u-42');
```

To test the closure form you inject a fake `http` in the outer call and you are done.
No `TestBed`, no `providers`, no `spyOn(this.http)`.

**Higher-order functions removing structural duplication.**

When two functions differ only in one internal step, extract that step as a parameter.

```ts
// Bad: two functions with identical structure, one step differs
const fetchAndParseUser = async (id: string): Promise<User> => {
  const res = await fetch(`/users/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseUser(await res.json());
};

const fetchAndParseTicket = async (id: string): Promise<Ticket> => {
  const res = await fetch(`/tickets/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseTicket(await res.json());
};

// Good: HOF — the fetch-and-parse structure is expressed once
const makeFetcher =
  <T>(path: (id: string) => string, parse: (raw: unknown) => T) =>
  async (id: string): Promise<T> => {
    const res = await fetch(path(id));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parse(await res.json());
  };

const fetchUser   = makeFetcher((id) => `/users/${id}`,   parseUser);
const fetchTicket = makeFetcher((id) => `/tickets/${id}`, parseTicket);
```

The fetch-check-parse contract is written down once. New resources become one-liners, and
changing the error format means editing a single place.

**Strategy maps as higher-order lookup.**

When a set of functions varies by a key known at runtime, a `Record<Key, Fn>` map is
itself a higher-order structure, a function from keys to functions. Pair it with currying
and it extends without friction.

```ts
type ExportFormat = 'csv' | 'json' | 'xlsx';
type Exporter = (rows: Row[]) => Blob;

const EXPORTERS: Record<ExportFormat, Exporter> = {
  csv:  exportToCsv,
  json: exportToJson,
  xlsx: exportToXlsx,
};

const exportData =
  (format: ExportFormat) =>
  (rows: Row[]): Blob =>
    EXPORTERS[format](rows);
```

Adding `'parquet'` to `ExportFormat` and to the `EXPORTERS` map is the whole change. No
`if`, no `switch`, no subclass.

## Anti-patterns

```ts
// ❌ Class used purely for grouping — no lifecycle, no polymorphism; should be
//    curried functions
class StringHelpers {
  static truncate(s: string, n: number): string { ... }
  static capitalise(s: string): string { ... }
}

// ❌ Partially-configured class repeated at every call site — callers carry
//    instantiation boilerplate instead of using a curried function
const format = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short' });

// ❌ this inside a HOF — the function is not pure; it closes over mutable state
//    via the prototype chain
class EventBus {
  emit(type: string) { this.handlers[type]?.(); }
}

// ❌ Abstract base class for variation — variation belongs in a strategy map,
//    not in a hierarchy
abstract class Renderer {
  abstract render(data: unknown): string;
}
```

They share one symptom. A change to shared behaviour drags in multiple classes or files,
and testing means constructing (and usually mocking) the object graph instead of injecting
a plain function argument.

## Enforcement

No lint rule bans classes outright in this codebase. `eslint-plugin-functional` ships a
`no-class` rule, but the team applies it at its own discretion, because some framework
integration points (Angular services, Web Component base classes) genuinely need classes.
The preference rides in code review and architecture decision records rather than in lint.

What lint does enforce is the absence of `this` in pure modules and the absence of `let`
or mutable assignment. `eslint-plugin-functional` with `no-let` and `immutable-data` flags
exactly the patterns that make a class feel necessary. Strip out the mutable state and the
class collapses back into a function.
