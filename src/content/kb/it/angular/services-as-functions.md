---
title: 'I servizi come arrow function; lo stato in una classe fornita a root'
category: angular
summary: 'Implementa i servizi senza stato come arrow function e sposta lo stato in una classe @Injectable({providedIn:"root"}) risolta con inject(), separando le funzioni di lettura e di scrittura.'
principle: "Implementa un servizio come arrow function; se gli serve lo stato, spostalo in una classe @Injectable({providedIn:'root'}) risolta tramite inject, con funzioni di lettura/scrittura distinte."
severity: preferred
tags: [angular, services, functional, inject, signals, architecture]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-02
    note: 'Servizi come arrow function; stato in un Injectable a root; funzioni di lettura/scrittura.'
related:
  - angular/inject-and-host-bindings
  - functional-architecture/currying-closures-higher-order
order: 5
updated: 2026-06-10
---

La classe `@Injectable` di Angular è il contenitore convenzionale per la logica di un
servizio, e la maggior parte dei team la usa molto più spesso di quanto serva davvero. Un
servizio che trasforma dati, valida un input o formatta una stringa non ha bisogno di una
classe. Ha bisogno di una funzione. Quando la funzione ha bisogno di un contesto che non
può portarsi da sola, glielo fornisci tramite una closure. L'eccezione è il servizio che
deve davvero mantenere e condividere uno stato reattivo: allora usa una classe, mantieni
la sua logica dichiarativa ed esponi lo stato attraverso funzioni di lettura e di
scrittura separate, invece di un unico metodo che fa entrambe le cose.

La regola: **prima l'arrow function; la classe injectable solo quando ti serve uno stato
reattivo condiviso**.

## Perché conta

Una classe si trascina dietro affordance implicite: istanziazione, `this`, proprietà
mutabili, ciclo di vita. Un servizio che calcola un valore derivato non ne ha bisogno di
nessuna. Avvolgi quel calcolo in una classe solo per accontentare il sistema di injection
di Angular e costringi chi legge a chiedersi dov'è la logica, se è pura e se mantiene
dello stato. Una funzione risponde a tutte e tre le domande a colpo d'occhio.

Il confine tra la logica di business e il runtime di Angular conta ancora di più. La
pratica DDD mette le regole di business in un modello ricco che non sa nulla del
framework, e un'arrow function è agnostica rispetto al framework per sua natura. Una
classe `@Injectable`, al contrario, è legata all'albero di injection di Angular dal
momento in cui la decori. La logica che vive in funzioni pure resta testabile da sola,
senza `TestBed`, senza una fixture di componente, senza che Angular sia presente nella
stanza.

Lo standard di ingegneria lo riassume così: "quando crei un servizio implementalo come
arrow function; se gli serve lo stato, spostalo in una classe con `@Injectable providedIn
root`, risolvi tramite `inject`, crea funzioni di lettura/scrittura separate se serve;
sposta la logica di business in closure dedicate puntando a un modello ricco come classe
ma mantenendone il codice dichiarativo."

## Come applicarla

### Servizio senza stato: un'arrow function

Un servizio che mappa, filtra, calcola o formatta è una funzione pura. Esportala
direttamente da un modulo — niente classe, niente decoratore.

```typescript
// Bad — a class that exists only to hold one method
@Injectable({ providedIn: 'root' })
export class TicketFormatterService {
  format(ticket: Ticket): string {
    return `[${ticket.id}] ${ticket.title} (${ticket.status})`;
  }
}

// Bad — it is injected in the component as a class just to call one method
@Component({ /* ... */ })
export class TicketRowComponent {
  private readonly formatter = inject(TicketFormatterService);
  readonly label = computed(() => this.formatter.format(this.ticket()));
}

// Good — a pure function in a dedicated file
// features/tickets/common/ticket-formatter.ts
export const formatTicket = (ticket: Ticket): string =>
  `[${ticket.id}] ${ticket.title} (${ticket.status})`;

// The component imports and calls it directly — no injection needed
@Component({
  selector: 'app-ticket-row',
  standalone: true,
  template: `<span>{{ label() }}</span>`,
  styles: [`:host { display: block; }`],
})
export class TicketRowComponent {
  readonly ticket = input.required<Ticket>();
  readonly label = computed(() => formatTicket(this.ticket()));
}
```

Quando la funzione ha bisogno di una dipendenza (per esempio l'URL base di una chiamata
API), passala come parametro o costruisci una factory function tramite closure. Non
ricorrere a `@Injectable` solo per passarle la dipendenza.

```typescript
// Factory function pattern: the dependency is captured in the closure
export const createTicketApi = (baseUrl: string) => ({
  list: (): Promise<readonly Ticket[]> =>
    fetch(`${baseUrl}/tickets`).then(r => r.json()),
  get: (id: string): Promise<Ticket> =>
    fetch(`${baseUrl}/tickets/${id}`).then(r => r.json()),
});

// Usage in a component or store — the baseUrl comes from an injected config
@Component({ /* ... */ })
export class TicketListComponent {
  private readonly config = inject(AppConfig);
  private readonly api = createTicketApi(this.config.apiBaseUrl);
}
```

### Servizio con stato: classe fornita a root con lettura/scrittura separate

Quando un servizio deve davvero condividere uno stato reattivo in tutta l'applicazione (un
utente selezionato, una coda di notifiche, un feature flag), usa una classe
`@Injectable({ providedIn: 'root' })`. Tieni piccola la sua API pubblica: una funzione o
un signal per leggere lo stato, una funzione per scriverlo.

```typescript
// features/tickets/ticket-selection.store.ts

@Injectable({ providedIn: 'root' })
export class TicketSelectionStore {
  // Private writable signal — internal to the store
  private readonly _selectedId = signal<string | undefined>(undefined);

  // Public read — a readonly view; callers cannot .set() through this reference
  readonly selectedId: Signal<string | undefined> = this._selectedId.asReadonly();

  // Explicit write function — naming makes the intent clear
  readonly select = (id: string): void => this._selectedId.set(id);
  readonly clear = (): void => this._selectedId.set(undefined);
}
```

Lo store viene risolto nei componenti tramite `inject()`:

```typescript
@Component({ /* ... */ })
export class TicketDetailComponent {
  private readonly selection = inject(TicketSelectionStore);

  readonly ticketId = this.selection.selectedId;

  readonly ticket = resource({
    request: () => ({ id: this.ticketId() }),
    loader: ({ request }) =>
      request.id !== undefined
        ? fetchTicket(request.id)
        : Promise.resolve(undefined),
  });
}
```

Separare la lettura dalla scrittura impedisce a un componente di mutare per sbaglio lo
stato globale tramite un riferimento che aveva preso solo per leggerlo. Inoltre rende le
modifiche di stato tracciabili, perché ogni scrittura passa per una funzione con un nome
nello store, invece di una `.set()` grezza sparsa nel codice.

### Logica di business in closure separate

La logica del modello, come la regola per cui un ticket può essere chiuso solo dopo che ha
un assegnatario, non appartiene né allo store né al componente. Mettila in una closure del
livello di dominio.

```typescript
// domain/ticket.ts — framework-agnostic domain logic

export type Ticket = {
  readonly id: string;
  readonly title: string;
  readonly status: 'open' | 'in-progress' | 'closed';
  readonly assignee: string | undefined;
};

export const canClose = (ticket: Ticket): boolean =>
  ticket.assignee !== undefined && ticket.status !== 'closed';

export const close = (ticket: Ticket): Ticket =>
  canClose(ticket) ? { ...ticket, status: 'closed' } : ticket;
```

Il componente o lo store chiama `canClose` e `close` invece di reimplementare la regola
inline. Il file di dominio non ha nessun import di Angular e si può testare con un semplice
blocco `describe`/`it`.

## Anti-pattern

```typescript
// Anti-pattern 1: @Injectable for a stateless helper
// This forces TestBed into every test of the logic, adds DI boilerplate,
// and signals to readers that there is state — there is not.
@Injectable({ providedIn: 'root' })
export class DateFormatterService {
  formatShort = (date: Date): string =>
    date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
// Fix: export const formatShortDate = (date: Date): string => ...

// Anti-pattern 2: Store with a public writable signal
@Injectable({ providedIn: 'root' })
export class UserStore {
  readonly currentUser = signal<User | undefined>(undefined); // writable signal, public!
}
// Any component can call userStore.currentUser.set(hackedUser).
// Fix: expose asReadonly() and a named mutator.

// Anti-pattern 3: Business logic inside the injectable
@Injectable({ providedIn: 'root' })
export class TicketService {
  canAssign(ticket: Ticket, user: User): boolean {
    // Domain rule buried inside an Angular service — untestable without DI
    return user.role === 'agent' && ticket.status === 'open';
  }
}
// Fix: extract canAssign to a pure function in the domain layer.

// Anti-pattern 4: Mixing read and write into one function
@Injectable({ providedIn: 'root' })
export class FilterStore {
  private readonly _filters = signal<Filter[]>([]);

  // A function that both returns the current state and mutates it — confusing
  filtersWithDefault(defaults: Filter[]): Filter[] {
    if (this._filters().length === 0) this._filters.set(defaults); // side-effect!
    return this._filters();
  }
}
// Fix: separate filters = this._filters.asReadonly() and setFilters = (f) => this._filters.set(f)
```

Questi pattern producono gli stessi sintomi all'infinito. Finisci per allestire `TestBed`
per una logica che non ha nessuna dipendenza da Angular. Lo stato viene mutato da qualsiasi
punto senza un percorso di scrittura rintracciabile. Le regole di dominio marciscono dentro
il livello dei servizi, dove nessun altro può riutilizzarle.

## Vedi anche

- [inject() e i metadati di host](/principles/angular/inject-and-host-bindings) — la regola
  complementare su come le dipendenze vengono consumate dentro i componenti una volta che
  il servizio è al suo posto.
- [Currying, closure e funzioni di ordine superiore](/principles/functional-architecture/currying-closures-higher-order) —
  il principio più ampio dell'architettura funzionale che motiva le factory function e la
  composizione di servizi basata su closure.
