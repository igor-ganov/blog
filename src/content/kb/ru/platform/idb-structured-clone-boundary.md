---
title: 'В IndexedDB попадают только данные, пригодные для structured clone'
category: platform
summary: 'Любое значение, сохраняемое в IndexedDB, проходит через алгоритм structured clone; функции, символы, DOM-узлы, экземпляры классов и прокси фреймворков выбрасывают исключение — материализуйте их на границе toPersistable перед записью.'
principle: 'Прогоняйте состояние реактивного стора через границу toPersistable перед IndexedDB (или postMessage, или caches): выбрасывайте функции, символы, DOM-узлы, экземпляры классов и прокси фреймворков; материализуйте прокси в обычные объекты.'
severity: strong
tags: [platform, indexeddb, structured-clone, vue, proxy, persistence]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-04-30
    note: 'граница toPersistable срезает несериализуемые поля перед IDB; прокси не клонируются; pageerror всплывает с этим исключением'
related:
  - error-handling/never-swallow-errors
  - testing/wait-for-service-worker-settle
order: 1
updated: 2026-04-30
---

IndexedDB сериализует значения через [алгоритм structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm),
который строже, чем `JSON.stringify`. Там, где JSON молча выбрасывает функции и
`undefined`, structured clone **бросает** `DOMException`. Исключение синхронное и
всплывает в тот момент, когда выполняется `IDBObjectStore.put()`. Если вызов сделан в
режиме fire-and-forget (`void appendEntry(entry)`), это исключение оседает в отклонённом
промисе, который никто не слушает, поэтому приложение продолжает работать, запись так и
не сохраняется, а пользователь ничего не видит.

Именно так всё и сломалось в SPA для администрирования контента (2026-04-30).
`NotificationEntry.cta.action` был колбэком — нормально держать его в памяти, но
недопустимо на границе IDB. Сохранение шло через fire-and-forget с префиксом `void`,
поэтому `DOMException: Failed to execute 'put' on 'IDBObjectStore': #<Object> could not be
cloned` был выброшен, отклонил внутренний промис и исчез. Стор с историей уведомлений
выглядел рабочим (при обычном использовании в консоли не было ошибок), но втихую ничего
не сохранял.

## Почему это важно

### `JSON.stringify` — небезопасная аналогия

Считают, что если сериализация в JSON работает, то и сохранение в IDB сработает. Это не так.

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

IDB ведёт себя как `structuredClone`, а не как `JSON.stringify`. Если сохранение вроде бы
работает, но в объектах данных у вас лежат колбэки, то на самом деле оно отказывает молча.
Прогоните значение через `structuredClone()` локально, прежде чем доверять его IDB.

### Проблема прокси фреймворка

Реактивные объекты Vue 3 — это JavaScript-прокси. Vue-`ref`, оборачивающий обычный объект,
пригоден для structured clone тогда и только тогда, когда `.value` — обычный объект без
несериализуемых полей. Однако:

- `computed()`-ref не клонируется — внутри него граф зависимостей.
- Объекты стора Pinia, которые возвращает `useStore()`, — реактивные прокси.
- В `reactive()`-объектах могут быть несериализуемые внутренние слоты.

Сохраните срез стора Pinia прямиком в IDB — и вы сохраняете прокси, который бросает
исключение. Не пытайтесь вычислять «а это случайно не Vue-ref?» в момент записи. Добавьте
явный шаг `toPersistable()`, который материализует данные в снимок из обычных объектов до
того, как они вообще коснутся слоя сохранения.

```ts
// Bad: persisting a Pinia store slice directly — it is a Proxy.
const notifStore = useNotificationStore();
await db.put('notifications', notifStore.entries); // DOMException

// Good: materialise to a plain object first.
await db.put('notifications', notifStore.entries.map(toPersistable));
```

### Сочетание `void` с отсутствием обработчика ошибок

Вторым фактором инцидента стал сам вызов:

```ts
// The call site — fire-and-forget with no error handler.
void appendEntry(entry);

// Inside appendEntry (simplified):
const appendEntry = async (entry: NotificationEntry): Promise<void> => {
  const db = await openDb();
  await db.put('history', entry); // throws DOMException if entry is not cloneable
};
```

`void` отбрасывает возвращённый промис. `DOMException`, выброшенный внутри `async`-функции,
превращается в отклонённый промис, а отклонённый промис без `.catch()` и без `await`
где-либо выше по цепочке порождает необработанное отклонение. Service worker иногда молча
их проглатывает. Так что исключение выброшено, данные не записаны, и нигде ничего не
залогировано.

Должны выполняться сразу два условия: вам нужна граница `toPersistable`, и любой
fire-and-forget-вызов IDB обязан переправить своё отклонение туда, где оно видно. См. [никогда
не проглатывайте ошибку](/kb/error-handling/never-swallow-errors).

## Как применять

### Заведите границу `toPersistable`

Поставьте на границе сохранения одну функцию, которая превращает представление из памяти
в обычный объект, безопасный для structured clone. Она срезает известные несериализуемые
поля и материализует любой прокси или экземпляр класса в обычные данные.

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

Вызов `structuredClone(safe)` только в dev-сборке — дешёвая локальная проверка. Он бросает
исключение в месте вызова, а не где-то в глубине IDB-транзакции, и называет проблемное поле
в тексте ошибки, так что пропущенный случай в `toPersistable` легко отследить.

### Переправляйте ошибки IDB из fire-and-forget-вызовов

Когда `appendEntry` идёт в режиме fire-and-forget без `await`, направьте отклонение туда,
где вы его реально увидите:

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

### Как диагностировать молчаливый сбой IDB

Когда запись в IDB вроде бы прошла (при обычном использовании в консоли нет ошибок), но при
чтении данные так и не появляются, в первую очередь проверьте сбой structured clone:

1. Откройте консоль браузера.
2. Слушайте события `pageerror` (или временно добавьте `window.addEventListener('unhandledrejection',
   console.error)`).
3. Выполните операцию записи.
4. Если появилась `DOMException: ... could not be cloned`, значит, границы нет.

В тестах Playwright добавьте `page.on('pageerror', (err) => { throw err; })` в настройку
теста. Это синхронно вытаскивает DOMException прямо во время прогона — в той точке, где иначе
оно исчезло бы в service worker.

## Антипаттерны

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

### Что клонируется через structured clone, а что нет

| Клонируется | Не клонируется |
|---|---|
| Обычные объекты (`{}`, `[]`) | Функции / стрелочные функции |
| Примитивные значения | Символы |
| `Date`, `Map`, `Set`, `RegExp` | DOM-узлы (`Element`, `Document`) |
| `ArrayBuffer`, `TypedArray` | Экземпляры классов с методами |
| `Blob`, `File`, `FileList` | Vue-`computed()`-ref |
| Объекты `Error` | Прокси стора Pinia |
| `URLSearchParams` | `WeakMap`, `WeakSet` |

## См. также

[Никогда не проглатывайте ошибку](/kb/error-handling/never-swallow-errors) — это парное
правило. Когда граница `toPersistable` уже на месте, отклонённый промис записи в IDB всё
равно должен дойти до обработчика ошибок, а не сгинуть в `void`.

[Дождитесь устаканивания service worker](/kb/testing/wait-for-service-worker-settle) разбирает
случай, когда сохранение в IDB происходит внутри service worker: тесты обязаны дождаться
инициализации SW, прежде чем проверять сохранённые данные.
