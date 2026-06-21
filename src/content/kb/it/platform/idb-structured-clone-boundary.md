---
title: 'Solo dati clonabili con structured-clone arrivano a IndexedDB'
category: platform
summary: "Ogni valore salvato su IndexedDB deve superare l'algoritmo di structured-clone; funzioni, simboli, nodi DOM, istanze di classe e proxy dei framework lanciano un'eccezione: materializzali in un confine toPersistable prima di scrivere."
principle: 'Fai passare lo stato dello store reattivo per un confine toPersistable prima di IndexedDB (o postMessage, o caches): elimina funzioni, simboli, nodi DOM, istanze di classe e proxy dei framework; materializza i proxy in oggetti semplici.'
severity: strong
tags: [platform, indexeddb, structured-clone, vue, proxy, persistence]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-04-30
    note: "il confine toPersistable rimuove i campi non clonabili prima dell'IDB; i proxy non sono clonabili; pageerror fa emergere l'eccezione"
related:
  - error-handling/never-swallow-errors
  - testing/wait-for-service-worker-settle
order: 1
updated: 2026-04-30
---

IndexedDB serializza i valori con l'[algoritmo di structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm),
che è più severo di `JSON.stringify`. Dove JSON scarta in silenzio funzioni e
`undefined`, lo structured clone **lancia** una `DOMException`. L'eccezione è sincrona ed
emerge nel momento in cui gira `IDBObjectStore.put()`. Se il punto di chiamata è
fire-and-forget (`void appendEntry(entry)`), quell'eccezione finisce in una promise
rifiutata che nessuno ascolta: l'app continua a girare, la voce non viene mai salvata e
l'utente non vede niente.

È esattamente il guasto capitato su una SPA di amministrazione contenuti (2026-04-30).
`NotificationEntry.cta.action` era una funzione di callback, va benissimo tenerla in
memoria ma è illegale al confine dell'IDB. La chiamata di persistenza era fire-and-forget
con il prefisso `void`, quindi la `DOMException: Failed to execute 'put' on
'IDBObjectStore': #<Object> could not be cloned` veniva lanciata, rifiutava la promise
interna e spariva. Lo store della cronologia notifiche sembrava funzionare (nessun errore
in console durante l'uso normale) mentre in realtà non salvava niente.

## Perché conta

### `JSON.stringify` non è un'analogia sicura

Si dà per scontato che se la serializzazione JSON funziona, allora funziona anche la
persistenza su IDB. Non è così.

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

L'IDB segue `structuredClone`, non `JSON.stringify`. Se la persistenza sembra
funzionare ma hai callback piazzate dentro i tuoi oggetti dati, sta fallendo in silenzio.
Fai passare il valore per `structuredClone()` in locale prima di fidarti che l'IDB lo
conservi.

### Il problema dei proxy dei framework

Gli oggetti reattivi di Vue 3 sono Proxy JavaScript. Un `ref` di Vue che avvolge un
oggetto semplice è clonabile con structured-clone se e solo se `.value` è un oggetto
semplice senza campi non clonabili. Però:

- i ref di `computed()` non sono clonabili: contengono un grafo di dipendenze.
- gli oggetti store di Pinia restituiti da `useStore()` sono Proxy reattivi.
- gli oggetti `reactive()` possono contenere slot interni non clonabili.

Salva una porzione di store Pinia direttamente su IDB e stai salvando un Proxy, che
lancia un'eccezione. Non provare a indovinare "è questo un ref di Vue?" in fase di
scrittura. Aggiungi un passo `toPersistable()` esplicito che materializza i dati in uno
snapshot di oggetto semplice prima che tocchino lo strato di persistenza.

```ts
// Bad: persisting a Pinia store slice directly — it is a Proxy.
const notifStore = useNotificationStore();
await db.put('notifications', notifStore.entries); // DOMException

// Good: materialise to a plain object first.
await db.put('notifications', notifStore.entries.map(toPersistable));
```

### La combinazione `void` + nessun gestore d'errore

Il secondo fattore dell'incidente era il punto di chiamata stesso:

```ts
// The call site — fire-and-forget with no error handler.
void appendEntry(entry);

// Inside appendEntry (simplified):
const appendEntry = async (entry: NotificationEntry): Promise<void> => {
  const db = await openDb();
  await db.put('history', entry); // throws DOMException if entry is not cloneable
};
```

`void` scarta la Promise restituita. Una `DOMException` lanciata dentro una funzione
`async` diventa una Promise rifiutata, e una Promise rifiutata senza `.catch()` e senza
`await` da nessuna parte lungo la catena produce un rifiuto non gestito. I service worker
a volte li ingoiano in silenzio. Quindi l'eccezione viene lanciata, i dati non vengono
scritti e niente viene registrato.

Devono valere due cose insieme: ti serve un confine `toPersistable`, e qualsiasi chiamata
IDB fire-and-forget deve inoltrare il suo rifiuto in un posto visibile. Vedi [non
ingoiare mai un errore](/kb/error-handling/never-swallow-errors).

## Come applicarlo

### Definisci un confine `toPersistable`

Metti una singola funzione al confine della persistenza che trasforma la rappresentazione
in memoria in un oggetto semplice sicuro per lo structured clone. Rimuove i campi non
clonabili noti e materializza qualsiasi Proxy o istanza di classe in dati semplici.

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

Lo `structuredClone(safe)` riservato allo sviluppo è un controllo locale a buon mercato.
Lancia l'eccezione al punto di chiamata invece che nel profondo della transazione IDB, e
nomina il campo incriminato nel messaggio d'errore, così un caso che `toPersistable`
si è perso è facile da rintracciare.

### Inoltra gli errori IDB dalle chiamate fire-and-forget

Quando `appendEntry` gira fire-and-forget senza `await`, indirizza il rifiuto in un posto
dove puoi davvero vederlo:

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

### Diagnosticare un fallimento silenzioso esistente su IDB

Quando una scrittura IDB sembra riuscita (nessun errore in console durante l'uso normale)
ma i dati non compaiono mai in lettura, controlla prima un fallimento dello structured
clone:

1. Apri la console del browser.
2. Mettiti in ascolto degli eventi `pageerror` (oppure aggiungi temporaneamente un
   `window.addEventListener('unhandledrejection', console.error)`).
3. Prova l'operazione di scrittura.
4. Se compare una `DOMException: ... could not be cloned`, manca il confine.

Nei test Playwright, aggiungi `page.on('pageerror', (err) => { throw err; })` al setup del
test. Fa emergere la DOMException in modo sincrono durante l'esecuzione, nel punto dove
altrimenti sparirebbe dentro il service worker.

## Anti-pattern

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

### Cosa è e cosa non è clonabile con structured-clone

| Clonabile | Non clonabile |
|---|---|
| Oggetti semplici (`{}`, `[]`) | Funzioni / arrow function |
| Valori primitivi | Simboli |
| `Date`, `Map`, `Set`, `RegExp` | Nodi DOM (`Element`, `Document`) |
| `ArrayBuffer`, `TypedArray` | Istanze di classe con metodi |
| `Blob`, `File`, `FileList` | Ref di `computed()` di Vue |
| Oggetti `Error` | Proxy di store Pinia |
| `URLSearchParams` | `WeakMap`, `WeakSet` |

## Vedi anche

[Non ingoiare mai un errore](/kb/error-handling/never-swallow-errors) è la regola gemella.
Una volta messo a posto il confine `toPersistable`, la Promise rifiutata della scrittura
IDB deve comunque raggiungere un gestore d'errore invece di sparire in un `void`.

[Aspetta la stabilizzazione del service worker](/kb/testing/wait-for-service-worker-settle)
copre il caso in cui la persistenza IDB gira dentro un service worker: i test devono
aspettare l'inizializzazione del SW prima di fare assert sui dati memorizzati.
