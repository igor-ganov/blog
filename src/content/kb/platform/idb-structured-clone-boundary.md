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

IndexedDB uses the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
to serialise values. The algorithm is stricter than `JSON.stringify`: where JSON silently
drops functions and `undefined`, structured clone **throws** a `DOMException`. The
throw is synchronous, it surfaces immediately when `IDBObjectStore.put()` is called,
and if the call site is `void appendEntry(entry)` — fire-and-forget — the exception
lands in a rejected promise that nobody is listening to. The app continues running. The
entry was silently not persisted. The user sees no error.

On a content-admin SPA (2026-04-30) this was the exact failure mode.
`NotificationEntry.cta.action` was a callback function — a value perfectly reasonable
in memory but illegal at the IDB boundary. The persist call was `void`-prefixed fire-
and-forget. The `DOMException: Failed to execute 'put' on 'IDBObjectStore': #<Object>
could not be cloned` was thrown, rejected the internal promise, and disappeared. The
notification history store appeared to work (no console error in normal operation) while
silently accumulating no data.

## Why this matters

### `JSON.stringify` is not a safe analogy

A common assumption is that "if JSON serialisation works, IDB persistence works". This
is wrong.

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

IDB behaves like `structuredClone`, not like `JSON.stringify`. If your existing
persistence "works" but you have callbacks in your data objects, it is failing silently.
Verify with `structuredClone()` locally before trusting IDB persistence.

### The framework proxy problem

Vue 3 reactive objects are JavaScript Proxies. A Vue `ref` wrapping a plain object
is structured-cloneable if and only if `.value` is a plain object with no non-cloneable
fields. However:

- `computed()` refs are not cloneable — they contain a dependency graph.
- Pinia store objects returned from `useStore()` are reactive Proxies.
- `reactive()` objects can contain non-cloneable internal slots.

When you persist a Pinia store slice directly to IDB, you are persisting a Proxy, which
throws. The fix is not to check "is this a Vue ref?" — it is to have an explicit
`toPersistable()` step that materialises the data to a plain-object snapshot before
it touches the persistence layer.

```ts
// Bad: persisting a Pinia store slice directly — it is a Proxy.
const notifStore = useNotificationStore();
await db.put('notifications', notifStore.entries); // DOMException

// Good: materialise to a plain object first.
await db.put('notifications', notifStore.entries.map(toPersistable));
```

### The `void` + no error handler combination

The second factor in the incident was the call site:

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
function becomes a rejected Promise. A rejected Promise with no `.catch()` and no
`await` at any level produces an unhandled rejection. In a service worker, unhandled
rejections are sometimes swallowed silently. The result: the exception is thrown, the
data is not written, and nothing is logged.

The combined lesson: a `toPersistable` boundary is required, AND fire-and-forget IDB
calls must forward their rejection to somewhere it can be seen — see [never swallow an
error](/kb/error-handling/never-swallow-errors).

## How to apply

### Define a `toPersistable` boundary

Create an explicit function at the persistence boundary that transforms the in-memory
representation to a structured-clone-safe plain object. The function strips known
non-cloneable fields and materialises any Proxy or class instance.

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

The development-only `structuredClone(safe)` is a fast local verification. It throws
at the call site — not inside the IDB transaction — and includes the field that failed
in the error message, making the missing `toPersistable` case easy to diagnose.

### Forward IDB errors from fire-and-forget calls

If `appendEntry` is called fire-and-forget (no `await`), the rejection must still be
routed somewhere visible:

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

If an IDB write appears to succeed (no console error in normal operation) but data is
not appearing on read, the structured-clone failure is the first thing to check:

1. Open the browser console.
2. Listen for `pageerror` events (or add a `window.addEventListener('unhandledrejection',
   console.error)` temporarily).
3. Attempt the write operation.
4. If a `DOMException: ... could not be cloned` appears, the boundary is missing.

In Playwright tests, add `page.on('pageerror', (err) => { throw err; })` to the test
setup — it surfaces the DOMException synchronously during the test run, where it
normally disappears into the service worker's void.

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

[Never swallow an error](/kb/error-handling/never-swallow-errors) — the companion
rule: once the `toPersistable` boundary is in place, the IDB write's rejected Promise
must still reach an error handler, not disappear into a `void`.

[Wait for service worker settle](/kb/testing/wait-for-service-worker-settle) — when
IDB persistence runs inside a service worker, tests must wait for SW initialisation
to complete before asserting on stored data.
