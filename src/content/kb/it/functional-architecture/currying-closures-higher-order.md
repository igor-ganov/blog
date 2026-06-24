---
title: 'Currying, closure e funzioni di ordine superiore al posto delle classi'
category: functional-architecture
summary: 'Cattura configurazione e dipendenze con currying e closure invece che con i costruttori delle classi; costruisci il riuso tramite funzioni di ordine superiore e mappe di strategie.'
principle: 'Usa il currying per separare configurazione e dati, le closure per catturare il contesto al posto dei campi di classe, e le funzioni di ordine superiore / mappe di strategie per eliminare le duplicazioni.'
severity: preferred
tags: [functional-architecture, currying, closures, higher-order-functions, composition]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-07
    note: 'Currying (config)=>(data)=>result; closure al posto delle classi; HOF; mappe di strategie al posto delle ramificazioni.'
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-03-24
    note: 'Un obiettivo centrale del refactoring: riuso tramite currying; trattare il progetto come un sistema unificato; composizione/pipe.'
related:
  - functional-architecture/no-branching-switch-and-strategies
  - typescript/prefer-inference-and-import-type
order: 3
updated: 2026-06-10
---

Le classi raggruppano stato e comportamento perché qualcosa possa gestirne il ciclo di
vita. Una codebase funzionale non ha cicli di vita da gestire. Le funzioni pure non
contengono stato, e le dipendenze vengono passate come argomenti oppure catturate una sola
volta nella radice di composizione. Currying e closure coprono lo stesso terreno di un
costruttore, con meno meccanica e una componibilità nettamente migliore.

La forma è `(config) => (data) => result`. La prima chiamata lega la configurazione una
volta, la seconda è la trasformazione pura. Quello che ottieni indietro è una funzione
parzialmente applicata che puoi passare in giro, comporre con `pipe` o inserire in una
mappa di strategie, senza classe, senza `this`, senza `new`.

## Perché conta

Un grosso refactoring di una SPA di amministrazione contenuti (2026-03-24) si era posto
due obiettivi che il currying serve direttamente: **"riuso tramite currying"** e
**"trattare il progetto come un sistema unificato"** usando
**"currying/composizione/pipe"**. Prima del refactoring il riuso arrivava dalle sottoclassi
e dalle classi base astratte, ciascuna trascinandosi dietro la propria catena di
costruttori, l'inizializzazione dei campi e il ciclo di vita. Una nuova variante voleva
dire una nuova sottoclasse, e aggiungere un comportamento condiviso voleva dire modificare
ogni classe nella gerarchia.

Dopo il refactoring il comportamento condiviso viveva in una funzione curried restituita
dalla radice di composizione, e le nuove varianti erano semplici nuove voci in una mappa di
strategie. Nessuna sottoclasse, nessun costruttore, nessun `this`.

Lo standard di ingegneria (2026-06-07) ha messo per iscritto lo schema:

- Il currying separa la *configurazione* dai *dati*: `(config) => (data) => result`.
- Le closure sostituiscono i campi di classe: le dipendenze vengono catturate in uno scope
  esterno, non salvate come `this.dep`.
- Le funzioni di ordine superiore prendono o restituiscono funzioni per eliminare la
  duplicazione strutturale.
- Le mappe di strategie (`Record<Key, Fn>`) sostituiscono le ramificazioni sulle varianti.

## Come applicarlo

**Funzione configurata via currying, riusata in più punti di chiamata.**

La chiamata esterna avviene una sola volta nella radice di composizione. Ogni punto di
chiamata a valle riceve una funzione già configurata e non deve mai sapere da dove arrivi la
configurazione.

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

La forma curried entra dritta dentro `map`, `pipe` e le mappe di strategie. La forma a
classe richiede `.format.bind(formatter)` o una lambda di wrapping ogni singola volta.

**Closure che cattura le dipendenze al posto dei campi di classe.**

Una closure è una funzione restituita da un'altra funzione che cattura variabili dallo scope
esterno. Fa il lavoro di `this.dep` senza `this`.

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

Per testare la forma a closure inietti un `http` finto nella chiamata esterna e hai finito.
Niente `TestBed`, niente `providers`, niente `spyOn(this.http)`.

**Funzioni di ordine superiore che eliminano la duplicazione strutturale.**

Quando due funzioni differiscono solo per un passaggio interno, estrai quel passaggio come
parametro.

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

Il contratto fetch-check-parse è scritto una volta sola. Le nuove risorse diventano
funzioni di una riga, e cambiare il formato dell'errore vuol dire modificare un solo punto.

**Mappe di strategie come lookup di ordine superiore.**

Quando un insieme di funzioni varia in base a una chiave nota a runtime, una mappa
`Record<Key, Fn>` è essa stessa una struttura di ordine superiore, una funzione dalle chiavi
alle funzioni. Abbinala al currying e si estende senza attrito.

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

Aggiungere `'parquet'` a `ExportFormat` e alla mappa `EXPORTERS` è l'intera modifica. Niente
`if`, niente `switch`, niente sottoclassi.

## Anti-pattern

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

In ognuno di questi casi una modifica al comportamento condiviso si trascina dietro più
classi o file, e testare significa costruire (e di solito mockare) il grafo di oggetti
invece di iniettare un semplice argomento di tipo funzione.

## Applicazione

Nessuna regola di lint vieta del tutto le classi in questa codebase.
`eslint-plugin-functional` fornisce una regola `no-class`, ma il team la applica a propria
discrezione, perché alcuni punti di integrazione con i framework (servizi Angular, classi
base dei Web Component) hanno davvero bisogno delle classi. La preferenza viaggia nella code
review e nei record delle decisioni architetturali, non nel lint.

Ciò che il lint impone è l'assenza di `this` nei moduli puri e l'assenza di `let` o di
assegnazione mutabile. `eslint-plugin-functional` con `no-let` e `immutable-data` segnala
esattamente gli schemi che fanno sembrare necessaria una classe. Togli lo stato mutabile e
la classe ricade in una funzione.
