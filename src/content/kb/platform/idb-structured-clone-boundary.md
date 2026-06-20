---
title: 'Only structured-cloneable data reaches IndexedDB'
category: platform
summary: 'Every value persisted to IndexedDB must pass the structured-clone algorithm; functions, symbols, DOM nodes, class instances, and framework proxies all throw — materialise them at a toPersistable boundary before writing.'
principle: 'Pass reactive store state through a toPersistable boundary before IndexedDB (or postMessage, or caches): drop functions, symbols, DOM nodes, class instances and framework proxies; materialise proxies to plain objects.'
severity: strong
tags: [platform, indexeddb, structured-clone, vue, proxy, persistence]
sources:
  - project: 'a content-admin SPA'
    date: 2026-04-30
    note: 'toPersistable boundary strips non-cloneable fields before IDB; proxies not cloneable; pageerror surfaces the throw'
related:
  - error-handling/never-swallow-errors
  - testing/wait-for-service-worker-settle
order: 1
updated: 2026-04-30
---

IndexedDB serialises values with the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm),
which is stricter than `JSON.stringify`. Where JSON silently drops functions and
`undefined`, structured clone **throws** a `DOMException`. The throw is synchronous and
surfaces the moment `IDBObjectStore.put()` runs. If the call site is fire-and-forget
(`void appendEntry(entry)`), that exception lands in a rejected promise nobody listens
to, so the app keeps running, the entry never gets persisted, and the user sees nothing.

That was the exact failure on a content-admin SPA (2026-04-30).
`NotificationEntry.cta.action` was a callback function, fine to hold in memory but
illegal at the IDB boundary. The persist call was `void`-prefixed fire-and-forget, so
the `DOMException: Failed to execute 'put' on 'IDBObjectStore': #<Object> could not be
cloned` was thrown, rejected the internal promise, and vanished. The notification
history store looked like it worked (no console error during normal use) while quietly
storing nothing.

## Why this matters

### `JSON.stringify` is not a safe analogy

People assume that if JSON serialisation works, IDB persistence works. It doesn't.

```ts
const entry = {
  id: '123',
  message: 'Deploy ready',
  cta: {
    label: 'View',
    action: () => console.log('clicked'), // a function
  },
};

// JSON.stringify silently drops the function — no throw, no warning.
JSON.stringify(entry);
// → '{"id":"123","message":"Deploy ready","cta":{"label":"View"}}'
// The 'action' field is gone. Silent data loss, but no error.

// structured-clone throws — this is what IDB does internally.
structuredClone(entry);
// → DOMException: Failed to execute 'structuredClone': () => ... could not be cloned.
```

IDB matches `structuredClone`, not `JSON.stringify`. If your persistence appears to
work but you have callbacks sitting in your data objects, it is failing silently.
Run the value through `structuredClone()` locally before you trust IDB to hold it.

### The framework proxy problem

Vue 3 reactive objects are JavaScript Proxies. A Vue `ref` wrapping a plain object
is structured-cloneable if and only if `.value` is a plain object with no non-cloneable
fields. However:

- `computed()` refs are not cloneable — they contain a dependency graph.
- Pinia store objects returned from `useStore()` are reactive Proxies.
- `reactive()` objects can contain non-cloneable internal slots.

Persist a Pinia store slice straight to IDB and you are persisting a Proxy, which
throws. Don't try to sniff out "is this a Vue ref?" at write time. Add an explicit
`toPersistable()` step that materialises the data into a plain-object snapshot before
it ever touches the persistence layer.

```ts
// Bad: persisting a Pinia store slice directly — it is a Proxy.
const notifStore = useNotificationStore();
await db.put('notifications', notifStore.entries); // DOMException

// Good: materialise to a plain object first.
await db.put('notifications', notifStore.entries.map(toPersistable));
```

### The `void` + no error handler combination

The second factor in the incident was the call site itself:

```ts
// The call site — fire-and-forget with no error handler.
void appendEntry(entry);

// Inside appendEntry (simplified):
const appendEntry = async (entry: NotificationEntry): Promise<void> => {
  const db = await openDb();
  await db.put('history', entry); // throws DOMException if entry is not cloneable
};
```

`void` discards the returned Promise. A `DOMException` thrown inside an `async`
function becomes a rejected Promise, and a rejected Promise with no `.catch()` and no
`await` anywhere up the chain produces an unhandled rejection. Service workers sometimes
swallow those silently. So the exception is thrown, the data is not written, and nothing
is logged.

Two things have to be true together: you need a `toPersistable` boundary, and any
fire-and-forget IDB call has to forward its rejection somewhere visible. See [never
swallow an error](/kb/error-handling/never-swallow-errors).

## How to apply

### Define a `toPersistable` boundary

Put a single function at the persistence boundary that turns the in-memory
representation into a structured-clone-safe plain object. It strips the known
non-cloneable fields and materialises any Proxy or class instance into plain data.

```ts
// src/notifications/to-persistable.ts

import type { NotificationEntry, PersistedEntry } from './types';

/**
 * Strips non-structured-clone-safe fields from a NotificationEntry before IDB write.
 * Must be called on every entry before db.put() / db.add().
 */
export const toPersistable = (entry: NotificationEntry): PersistedEntry => {
  // Destructure to drop the non-cloneable callback field.
  const { cta: _cta, ...rest } = entry;
  // Spread ensures we get a plain object snapshot, not a Proxy.
  return { ...rest };
};

// If you need to persist a subset of cta (label only, not action):
export const toPersistableWithLabel = (entry: NotificationEntry): PersistedEntry => {
  const { cta, ...rest } = entry;
  return {
    ...rest,
    ...(cta ? { ctaLabel: cta.label } : {}),
  };
};
```

```ts
// src/notifications/history-store.ts

import { toPersistable } from './to-persistable';

export const appendEntry = async (
  db: IDBDatabase,
  entry: NotificationEntry,
): Promise<void> => {
  const safe = toPersistable(entry);

  // Verify cloneability in development to catch missing cases early.
  if (import.meta.env.DEV) {
    structuredClone(safe); // throws immediately if toPersistable missed something
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('history', 'readwrite');
    const req = tx.objectStore('history').put(safe);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};
```

The development-only `structuredClone(safe)` is a cheap local check. It throws at the
call site rather than deep inside the IDB transaction, and it names the offending field
in the error message, so a missing `toPersistable` case is easy to track down.

### Forward IDB errors from fire-and-forget calls

When `appendEntry` runs fire-and-forget with no `await`, route the rejection somewhere
you can actually see it:

```ts
// src/notifications/history-store.ts

// Bad: rejection silently dropped.
void appendEntry(db, entry);

// Good: rejection routed to the global handler so it appears in Sentry / the console.
appendEntry(db, entry).catch((error) => {
  console.error('[history-store] appendEntry failed:', error);
  // In a service worker: self.registration.showNotification() or structured logging.
});
```

### Diagnosing an existing IDB silent failure

When an IDB write looks like it succeeded (no console error during normal use) but the
data never shows up on read, check for a structured-clone failure first:

1. Open the browser console.
2. Listen for `pageerror` events (or add a `window.addEventListener('unhandledrejection',
   console.error)` temporarily).
3. Attempt the write operation.
4. If a `DOMException: ... could not be cloned` appears, the boundary is missing.

In Playwright tests, add `page.on('pageerror', (err) => { throw err; })` to the test
setup. It surfaces the DOMException synchronously during the run, in the spot where it
would otherwise disappear into the service worker.

## Anti-patterns

```ts
// Anti-pattern 1: Persisting the Pinia store object directly.
// useStore() returns a Proxy; structuredClone throws on Proxies.
const store = useNotificationStore();
await idb.put('store', store); // DOMException

// Anti-pattern 2: Persisting an object with a method.
await idb.put('actions', { id: 'x', handle: () => {} }); // DOMException

// Anti-pattern 3: Using JSON.parse(JSON.stringify(obj)) as a "safe" boundary.
// JSON round-trip silently drops the function field instead of throwing.
// toPersistable must explicitly account for every non-cloneable field.
const pseudoSafe = JSON.parse(JSON.stringify(entry));
await idb.put('history', pseudoSafe); // No throw — but 'action' field is now missing
                                       // without any record that it was dropped.

// Anti-pattern 4: void appendEntry(entry) with no catch.
// If appendEntry throws (DOMException or anything else), the rejection disappears.
void appendEntry(entry); // rejection silently swallowed
```

### What is and is not structured-cloneable

| Cloneable | Not cloneable |
|---|---|
| Plain objects (`{}`, `[]`) | Functions / arrow functions |
| Primitive values | Symbols |
| `Date`, `Map`, `Set`, `RegExp` | DOM nodes (`Element`, `Document`) |
| `ArrayBuffer`, `TypedArray` | Class instances with methods |
| `Blob`, `File`, `FileList` | Vue `computed()` refs |
| `Error` objects | Pinia store Proxies |
| `URLSearchParams` | `WeakMap`, `WeakSet` |

## See also

[Never swallow an error](/kb/error-handling/never-swallow-errors) is the companion
rule. Once the `toPersistable` boundary is in place, the IDB write's rejected Promise
still has to reach an error handler instead of disappearing into a `void`.

[Wait for service worker settle](/kb/testing/wait-for-service-worker-settle) covers the
case where IDB persistence runs inside a service worker: tests have to wait for SW
initialisation before asserting on stored data.
