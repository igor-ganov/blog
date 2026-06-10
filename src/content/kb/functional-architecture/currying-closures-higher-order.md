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

Classes bundle state and behaviour to manage lifetime. In a functional codebase there is
no lifetime to manage: pure functions have no state, and dependencies are either passed
as arguments or captured once at the composition root. Currying and closures do this
job with less machinery and more composability than a constructor.

The shape is `(config) => (data) => result`. The first call binds configuration once.
The second call is the pure transformation. The result is a partially-applied function
that can be passed around, composed with `pipe`, or stored in a strategy map — all
without a class, `this`, or `new`.

## Why this matters

A major refactoring of a content-admin SPA (2026-03-24) articulated two goals that
currying directly serves: **"reuse via currying"** and **"treat the project as a unified
system"** using **"currying/composition/pipe"**. Before the refactoring, reuse happened
through subclassing and abstract base classes, each carrying its own constructor chain,
field initialisation, and lifecycle. Every new variant required a new subclass. Adding a
shared behaviour meant touching every class in the hierarchy.

After the refactoring, shared behaviour was captured by a curried function returned from
the composition root. New variants were new entries in a strategy map. No subclass, no
constructor, no `this`.

The engineering standard (2026-06-07) formalised the pattern:

- Currying separates *configuration* from *data*: `(config) => (data) => result`.
- Closures replace class fields: dependencies are captured in an outer scope, not stored
  as `this.dep`.
- Higher-order functions take or return functions to eliminate structural duplication.
- Strategy maps (`Record<Key, Fn>`) replace branching over variants.

## How to apply

**Curried configured function, reused across call sites.**

The outer call is done once at the composition root. Every downstream call site receives
a pre-configured function with no knowledge of where the configuration came from.

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

The curried form composes with `map`, `pipe`, and strategy maps without adaptation. The
class form requires `.format.bind(formatter)` or a wrapper lambda every time.

**Closure capturing dependencies instead of class fields.**

A closure is a function returned from another function that captures variables from the
outer scope. It replaces `this.dep` without `this`.

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

The closure form is directly testable by injecting a fake `http` argument in the outer
call. No `TestBed`, no `providers`, no `spyOn(this.http)`.

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

The structural contract — fetch, check, parse — is defined once. New resources are
one-liners. Changing the error format means touching one place.

**Strategy maps as higher-order lookup.**

When a set of functions varies by a key known at runtime, a `Record<Key, Fn>` map is
a higher-order structure: it is a function from keys to functions. Combined with
currying, it extends naturally.

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

Adding `'parquet'` to `ExportFormat` and the `EXPORTERS` map is the entire change. No
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

The symptom of each: a change to shared behaviour requires touching multiple classes or
files, and testing requires constructing (and often mocking) the object graph rather than
injecting a simple function argument.

## Enforcement

No dedicated lint rule enforces "no classes" as a hard ban in this codebase —
`eslint-plugin-functional`'s `no-class` rule is available but is applied at the team's
discretion because some framework integration points (Angular services, Web Component
base classes) require classes. The preference is tracked in code review and architecture
decision records, not in lint.

What lint does enforce is the absence of `this` in pure modules and the absence of
`let` / mutable assignment — `eslint-plugin-functional` with `no-let` and
`immutable-data` flags the patterns that make classes necessary in the first place. When
there is no mutable state, a class becomes a function.
