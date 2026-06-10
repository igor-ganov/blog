---
title: 'Services as arrow functions; state in a root-provided class'
category: angular
summary: 'Implement stateless services as arrow functions and move state into an @Injectable({providedIn:"root"}) class resolved through inject(), with separate read and write functions.'
principle: "Implement a service as an arrow function; if it needs state, move state into an @Injectable({providedIn:'root'}) class resolved via inject, with separate read/write functions."
severity: preferred
tags: [angular, services, functional, inject, signals, architecture]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'Arrow-fn services; state in root Injectable; read/write fns.'
related:
  - angular/inject-and-host-bindings
  - functional-architecture/currying-closures-higher-order
order: 5
updated: 2026-06-10
---

Angular's `@Injectable` class is the conventional container for service logic, and it
is often overused. A service that transforms data, validates input, or formats a string
does not need a class — it needs a function. When the function needs context it does not
carry itself, inject that context through a closure. When the service genuinely needs to
hold and share reactive state, use a class — but keep its logic declarative, and expose
state through separate read and write functions rather than mixing them.

The rule: **arrow function first; injectable class only when you need shared reactive
state**.

## Why this matters

A class carries implicit affordances: instantiation, `this`, mutable properties, and
lifecycle. A service that computes a derived value needs none of these. Wrapping that
computation in a class just to satisfy Angular's injection system adds cognitive
overhead: where is the logic? Is it pure? Does it hold state? Reading a class requires
all of these questions to be answered; reading a function does not.

The deeper concern is the boundary between business logic and the Angular runtime. DDD
practice puts business rules in a rich model that is ignorant of the framework. An
arrow function is framework-agnostic by nature. An `@Injectable` class is bound to
Angular's injection tree from the moment you decorate it. Business logic that lives
in pure functions is independently testable without `TestBed`, without a component
fixture, without Angular at all.

The engineering standard captures this as: "when creating a service implement it as an
arrow function; if it needs state, move state into a class with `@Injectable providedIn
root`, resolve via `inject`, create separate read/write functions if needed; move
business logic into separate closures aiming for a rich model as a class but keep its
code declarative."

## How to apply

### Stateless service: an arrow function

A service that maps, filters, computes, or formats is a pure function. Export it
directly from a module — no class, no decorator.

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

When the function needs a dependency (say, the base URL for an API call), pass it as a
parameter or create a factory function via closure — do not make it `@Injectable` just
to provide the dependency.

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

### Stateful service: root-provided class with read/write separation

When a service genuinely needs to share reactive state across the application — a
selected user, a notification queue, a feature flag — use an `@Injectable({ providedIn: 'root' })`
class. Keep its public API minimal: one function (or signal) to read state, one function
to write state.

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

The store is resolved in components via `inject()`:

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

Separation of read and write prevents components from accidentally mutating global state
through a signal reference they obtained for reading. It also makes the flow of state
changes auditable: every write goes through a named function in the store, not a raw
`.set()` scattered across the codebase.

### Business logic in separate closures

Model logic — rules like "a ticket can only be closed if it has an assignee" — does not
belong in either the store or the component. It belongs in a domain-layer closure.

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

The component or store calls `canClose` and `close`; they do not re-implement the
rule inline. The domain file has zero Angular imports and can be tested with a plain
`describe`/`it` block.

## Anti-patterns

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

The symptoms these patterns produce are consistent: `TestBed` must be set up for logic
that has no Angular dependency; state can be mutated from anywhere without a traceable
write path; domain rules rot inside the service layer and are never reused.

## See also

- [inject() and host metadata](/kb/angular/inject-and-host-bindings) — the companion
  rule for how dependencies are consumed inside components once the service is in place.
- [Currying, closures, and higher-order functions](/kb/functional-architecture/currying-closures-higher-order) —
  the broader functional-architecture principle that motivates factory functions and
  closure-based service composition.
