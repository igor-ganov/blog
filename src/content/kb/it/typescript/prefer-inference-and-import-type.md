---
title: 'Lascia lavorare l''inferenza: import type, readonly, visibilità'
category: typescript
summary: 'Massimizza inferenza e immutabilità: import type per gli import di soli tipi, readonly su ogni superficie adatta, modificatori di visibilità espliciti, arrow function, closure al posto delle classi e globalThis invece di window.'
principle: 'Massimizza inferenza e immutabilità: import type per i tipi, readonly ovunque sia opportuno, modificatori di visibilità espliciti, arrow function, closure al posto delle classi, globalThis invece di window.'
severity: preferred
tags: [typescript, type-safety, immutability, inference]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-02
    note: 'import type, readonly, arrow fn, closure, visibilità, globalThis'
  - project: 'una SPA di content-admin'
    date: 2026-03-25
    note: 'Grande Refactoring: tipi stretti, zero override'
related:
  - typescript/no-casting
  - functional-architecture/currying-closures-higher-order
order: 4
updated: 2026-06-10
---

## Perché conta

La maggior parte delle annotazioni di tipo è rumore. Il compilatore conosce già il tipo, quindi riscriverlo non ti dà alcuna sicurezza in più. Ti dà invece fragilità: cambia il tipo di ritorno di una funzione e ogni annotazione manuale nel punto di chiamata deve cambiare con lui. Appoggiati all'inferenza e i tuoi refactoring restano locali.

Le altre regole qui mantengono quell'inferenza affidabile e il codice prevedibile:

- `import type` dice al bundler che un simbolo viene cancellato in fase di emit, ed è ciò che fa funzionare correttamente `verbatimModuleSyntax` e il tree-shaking.
- `readonly` blocca le mutazioni accidentali che l'inferenza non riesce a cogliere.
- I modificatori di visibilità espliciti (`private`, `public`, `protected`) rendono l'intento cercabile e tengono i membri vaganti fuori dalla superficie pubblica di classi e componenti Angular.
- Le arrow function preservano `this` in modo lessicale e si compongono meglio delle dichiarazioni di metodo.
- Le closure al posto delle classi saltano le gerarchie di ereditarietà e rendono esplicite le dipendenze.
- `globalThis` invece di `window` funziona in ogni ambiente JS (worker, Node, Deno) senza configurazioni particolari.

Il grande refactoring della SPA di content-admin (2026-03-25) ha reso tutte queste regole vincolanti sotto la voce "tipi stretti, zero override". Ogni override di un'opzione di tsconfig o qualsiasi commento di soppressione richiede una giustificazione scritta tracciata nelle note di refactoring. Il default è strictness piena e piena aderenza a questi pattern.

## Come applicarla

### import type per gli import di soli tipi

Quando un import serve solo come annotazione di tipo, usa `import type`. L'import viene allora cancellato in fase di emit, il che evita errori a runtime da riferimenti circolari e soddisfa `verbatimModuleSyntax`.

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

Con `verbatimModuleSyntax` attivo, il compilatore segnala un errore quando un value import viene usato solo come tipo, così nessuno deve ricordarsi la regola.

### readonly ovunque sia opportuno

Annota ogni array, tupla e proprietà d'oggetto che non deve essere mutata dopo la creazione. Preferisci `Readonly<T>` per i parametri la cui forma non viene modificata.

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

Usa `as const` per i valori letterali che non devono mai allargarsi:

```typescript
const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
// type is readonly ['north', 'south', 'east', 'west'], not string[]
```

### Arrow function al posto delle dichiarazioni di metodo

Le arrow function catturano `this` in modo lessicale e si infilano nelle utility di ordine superiore senza `.bind()`. Usale per funzioni standalone e callback.

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

### Closure al posto delle classi

Una closure cattura le sue dipendenze in modo esplicito e restituisce un'interfaccia tipizzata. Non c'è nessuna classe da estendere e i test possono passare le dipendenze come semplici argomenti.

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

Il tipo dell'oggetto restituito (`UserService`) è il contratto pubblico. Il binding `apiUrl` resta privato grazie allo scope lessicale, senza bisogno della keyword `private`. I test passano un `apiUrl` finto come argomento.

### Modificatori di visibilità espliciti

Quando una classe è inevitabile (i componenti Angular, per esempio), marca ogni membro `private` o `public` in modo esplicito. Non affidarti mai al public implicito.

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

### globalThis invece di window

`window` è un global solo del browser, quindi qualunque codice lo tocchi si rompe nei Web Worker, negli script Node e nel server-side rendering. `globalThis` è l'oggetto globale standard che esiste in ogni ambiente JS.

```typescript
// Bad — browser-only
const origin = window.location.origin;

// Good — works in any JS environment that has location
const origin = globalThis.location?.origin ?? 'http://localhost';
```

### Lascia che l'inferenza porti il tipo di ritorno

Annota i tipi di ritorno sulle funzioni dell'API pubblica (funzioni esportate, setter `@Input` di Angular) così che il contratto sia documentato e fissato. Togli l'annotazione dove la funzione è interna e l'inferenza è inequivocabile.

```typescript
// Verbose and redundant — inference already knows the return type
const double = (n: number): number => n * 2;

// Fine — inference works; annotation adds no information
const double = (n: number) => n * 2;

// Annotate when the function is an API contract
export const createUserService = (apiUrl: string): UserService => ({ /* ... */ });
//                                                  ^^^^^^^^^^^^ explicit: this is the contract
```

## Anti-pattern

### Mescolare import di valori e di tipi

```typescript
// Bad — value import for a type-only use; bundler cannot tree-shake it
import { Config } from './config';
type LocalConfig = Pick<Config, 'timeout'>;
```

**Sintomo**: il bundle include il modulo `./config` a runtime anche se ne viene usato solo il tipo.

### Array pubblici mutabili

```typescript
// Bad
class Store {
  items: Item[] = [];
}

// store.items.push(fakeItem); — test pollution; no compile error
```

**Sintomo**: l'array viene mutato dall'esterno della classe nei test o in punti di chiamata inattesi; i bug sono non deterministici e dipendono dall'ordine.

### Riferimenti a window in codice condiviso

```typescript
// Bad — shared utility that breaks in a Web Worker
const getTimezone = () => window.Intl.DateTimeFormat().resolvedOptions().timeZone;
```

**Sintomo**: `ReferenceError: window is not defined` in qualunque ambiente non browser.

### Membri di classe pubblici impliciti

```typescript
// Bad
class Component {
  internalState = 0;     // accidentally public
  public api = 'value';  // public, fine
}
```

**Sintomo**: `internalState` viene letto da template o test e poi diventa portante, impedendo refactoring futuri.

## Come imporla

- `verbatimModuleSyntax: true` in `tsconfig.json` impone `import type`.
- `@typescript-eslint/explicit-member-accessibility` con `option: 'explicit'` impone i modificatori di visibilità.
- `@typescript-eslint/prefer-readonly` segnala le proprietà di classe mutabili che non vengono mai riassegnate dopo la costruzione.
- `@typescript-eslint/no-restricted-globals` può vietare `window` e suggerire `globalThis`.
- `@typescript-eslint/explicit-module-boundary-types` impone le annotazioni del tipo di ritorno sulle funzioni esportate.

## Vedi anche

- [No casting](/kb/typescript/no-casting) — l'inferenza elimina la maggior parte delle situazioni in cui un cast sembra allettante.
- [Currying, closure e funzioni di ordine superiore](/kb/functional-architecture/currying-closures-higher-order) — il pattern delle closure per la composizione dei servizi in dettaglio.
