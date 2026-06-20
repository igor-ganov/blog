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

Angular's `@Injectable` class is the conventional container for service logic, and most
teams reach for it far more often than they need to. A service that transforms data,
validates input, or formats a string does not need a class. It needs a function. When the
function needs context it can't carry on its own, supply that context through a closure.
The exception is a service that genuinely has to hold and share reactive state: then use a
class, keep its logic declarative, and expose state through separate read and write
functions instead of one method that does both.

The rule: **arrow function first; injectable class only when you need shared reactive
state**.

## Why this matters

A class drags along implicit affordances: instantiation, `this`, mutable properties,
lifecycle. A service that computes a derived value needs none of them. Wrap that
computation in a class just to satisfy Angular's injection system and you force every
reader to ask where the logic is, whether it's pure, and whether it holds state. A
function answers all three at a glance.

The boundary between business logic and the Angular runtime matters more. DDD practice
puts business rules in a rich model that knows nothing about the framework, and an arrow
function is framework-agnostic by nature. An `@Injectable` class, by contrast, is bound
to Angular's injection tree from the moment you decorate it. Logic that lives in pure
functions stays testable on its own, without `TestBed`, without a component fixture,
without Angular in the room at all.

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
parameter or build a factory function via closure. Don't reach for `@Injectable` just to
hand over the dependency.

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

When a service genuinely has to share reactive state across the application (a selected
user, a notification queue, a feature flag), use an `@Injectable({ providedIn: 'root' })`
class. Keep its public API small: one function or signal to read state, one function to
write it.

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

Splitting read from write stops a component from accidentally mutating global state
through a reference it only grabbed in order to read. It also keeps state changes
auditable, since every write goes through a named function in the store rather than a raw
`.set()` scattered across the codebase.

### Business logic in separate closures

Model logic, like the rule that a ticket can only be closed once it has an assignee,
belongs in neither the store nor the component. Put it in a domain-layer closure.

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

The component or store calls `canClose` and `close` rather than re-implementing the rule
inline. The domain file has zero Angular imports and can be tested with a plain
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

These patterns produce the same symptoms over and over. You end up setting up `TestBed`
for logic that has no Angular dependency. State gets mutated from anywhere with no
traceable write path. Domain rules rot inside the service layer where nobody else can
reuse them.

## See also

- [inject() and host metadata](/kb/angular/inject-and-host-bindings) — the companion
  rule for how dependencies are consumed inside components once the service is in place.
- [Currying, closures, and higher-order functions](/kb/functional-architecture/currying-closures-higher-order) —
  the broader functional-architecture principle that motivates factory functions and
  closure-based service composition.
