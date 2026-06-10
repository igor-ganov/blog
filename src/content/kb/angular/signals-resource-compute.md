---
title: 'Signals, resource and computed — not effects for derivation'
category: angular
summary: 'Hold state in signals, derive values with computed, load async data with resource, and restrict effect to side-effects created once in the constructor.'
principle: 'Hold state with signals; derive with computed and load with resource; create effect only in the constructor; never use effect to update values.'
severity: strong
tags: [angular, signals, reactivity, computed, resource, effect]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'signals/resource/compute; effect only in ctor; no effect-to-set.'
related:
  - angular/services-as-functions
  - angular/control-flow-blocks-not-directives
order: 3
updated: 2026-06-10
---

Angular Signals, introduced in Angular 17, replace the RxJS-first mental model for
component state. The core principle is that state is a signal, derivations are computed
values, and async resources are `resource()` calls — none of these require `effect`.
`effect` is an escape hatch for side-effects that cannot be expressed as a pure
transformation. Using it to write derived state back into another signal is an anti-
pattern that recreates the timing and ordering problems that made imperative Angular code
hard to reason about.

The rule has three parts:
1. Mutable state lives in `signal()`.
2. Derived values are `computed()` — never re-assigned signals.
3. Async data is `resource()` — never an effect that fetches and then calls `.set()`.

## Why this matters

The temptation to write `effect(() => { this.derived.set(transform(this.source())); })`
comes from habit. In a world of `@Input()` properties and `ngOnChanges`, you wired up
reactions manually. With signals, `computed` makes that entirely unnecessary — and the
difference is not cosmetic.

An `effect` that sets another signal creates an indirect dependency graph. Angular
evaluates effects asynchronously after the change detection cycle. If two effects both
read and write related signals, their execution order is not guaranteed. The canonical
symptom is a template that renders an intermediate state — the first signal has updated
but the effect that was supposed to update the second has not run yet, so the template
sees an inconsistent pair. `computed` is synchronous and referentially transparent: it
re-evaluates the moment its dependencies change, in the same tick, and never produces an
observable intermediate state.

`resource` solves the same problem for async operations. Before `resource`, the pattern
was `effect(() => { fetchData(this.id()).then(data => this.data.set(data)); })`. That
effect ran every time `id` changed, but you had to manage cancellation manually — or
accept that a slow first request could overwrite a fast second request. `resource` handles
request lifecycle, cancellation (via `AbortSignal`), and loading/error states as first-
class signal values.

Properties must be `readonly` unless they are signals or outputs. Declaring a mutable
class property and assigning to it from a lifecycle hook is the old pattern; it bypasses
change detection tracking entirely with `OnPush`.

## How to apply

### Mutable state: signal()

```typescript
// Bad — plain mutable property; bypasses signal tracking
@Component({ /* ... */ })
export class CounterComponent {
  count = 0;

  increment(): void {
    this.count++;
  }
}

// Good — signal holds state; template auto-tracks reads
@Component({
  selector: 'app-counter',
  standalone: true,
  template: `
    <output>{{ count() }}</output>
    <button (click)="increment()">+</button>
  `,
  styles: [`:host { display: flex; gap: 1rem; align-items: center; }`],
})
export class CounterComponent {
  readonly count = signal(0);

  readonly increment = (): void => this.count.update(n => n + 1);
}
```

All properties are `readonly`. `count` is a `Signal<number>` — a readonly reference to
a reactive container. `signal()` returns a `WritableSignal`; the `readonly` on the
property prevents replacing the signal reference, not its value.

### Derived values: computed()

```typescript
// Bad — effect writes derived state into a second signal
@Component({ /* ... */ })
export class CartComponent {
  readonly items = signal<CartItem[]>([]);
  readonly total = signal(0); // derived — should never be a writable signal

  constructor() {
    effect(() => {
      // Runs asynchronously after CD; total may lag items by one cycle
      this.total.set(this.items().reduce((s, i) => s + i.price * i.qty, 0));
    });
  }
}

// Good — computed is synchronous and always consistent with its dependencies
@Component({
  selector: 'app-cart',
  standalone: true,
  template: `
    <p>Total: {{ total() | currency }}</p>
    @for (item of items(); track item.id) {
      <app-cart-item [item]="item" />
    }
  `,
  styles: [`:host { display: block; }`],
})
export class CartComponent {
  readonly items = signal<readonly CartItem[]>([]);

  // Recomputes synchronously when items() changes; never lags behind
  readonly total = computed(() =>
    this.items().reduce((sum, item) => sum + item.price * item.qty, 0),
  );
}
```

`computed` is lazy and memoized: it only recalculates when a dependency changes, and
only when the computed value is actually read. An `effect`-based equivalent re-runs even
if nothing reads `total`.

### Async data: resource()

`resource` models the full lifecycle of an async operation — idle, loading, resolved,
errored — as signals. The loader function receives a reactive context; Angular
automatically re-runs it when any signal read inside it changes.

```typescript
import { resource, signal, computed } from '@angular/core';

// Bad — effect fetches and mutates; no cancellation; race condition possible
@Component({ /* ... */ })
export class UserProfileComponent {
  readonly userId = input.required<string>();
  readonly user = signal<User | undefined>(undefined);
  readonly loading = signal(false);

  constructor() {
    effect(() => {
      this.loading.set(true);
      fetchUser(this.userId()).then(u => {
        // If userId changed before this resolved, we write stale data
        this.user.set(u);
        this.loading.set(false);
      });
    });
  }
}

// Good — resource manages loading state, cancellation, and error in one call
@Component({
  selector: 'app-user-profile',
  standalone: true,
  template: `
    @if (userResource.isLoading()) {
      <app-spinner />
    } @else if (userResource.error()) {
      <app-error-message [error]="userResource.error()" />
    } @else if (userResource.value(); as user) {
      <app-user-card [user]="user" />
    }
  `,
  styles: [`:host { display: block; }`],
})
export class UserProfileComponent {
  readonly userId = input.required<string>();

  readonly userResource = resource({
    request: () => ({ id: this.userId() }),
    loader: ({ request, abortSignal }) =>
      fetchUser(request.id, { signal: abortSignal }),
  });
}
```

The `abortSignal` is provided by Angular and is cancelled automatically when `userId`
changes before the previous fetch completes. The race condition disappears.

### When effect is legitimate

`effect` is appropriate for side-effects that cannot be expressed as a value: logging,
writing to an external DOM API, setting up a third-party library. It must be created
**in the constructor** and must not call `.set()` on any signal.

```typescript
@Component({ /* ... */ })
export class MapComponent {
  readonly center = input.required<LatLng>();
  private readonly mapInstance: google.maps.Map;

  constructor() {
    this.mapInstance = new google.maps.Map(/* ... */);

    // Legitimate: syncing an external, non-signal API
    effect(() => {
      this.mapInstance.setCenter(this.center());
    });
  }
}
```

Creating an `effect` outside the constructor is not supported by Angular's injection
context rules unless you pass an explicit injector — and doing so is a smell that the
effect belongs inside the constructor.

## Anti-patterns

```typescript
// Anti-pattern 1: effect to derive state — the classic wrong move
effect(() => {
  this.fullName.set(`${this.firstName()} ${this.lastName()}`);
});
// Use: readonly fullName = computed(() => `${this.firstName()} ${this.lastName()}`);

// Anti-pattern 2: effect to fetch data
effect(() => {
  fetch(`/api/users/${this.userId()}`).then(r => r.json()).then(u => this.user.set(u));
});
// Use: resource() with a loader function.

// Anti-pattern 3: writable signal for derived data
// Making total writable implies it can be set externally, which is a lie —
// it is always recalculated from items.
readonly total = signal(0); // should be computed
// Use: readonly total = computed(() => sumItems(this.items()));

// Anti-pattern 4: effect created outside the constructor
ngOnInit(): void {
  // Angular may not have an injection context here; this can throw
  effect(() => { /* ... */ });
}
// Use: move to constructor().

// Anti-pattern 5: unused declared properties
// Declaring a property that is never read in the template or by any method is dead
// code. Signals make this visible because the template only calls what it needs.
readonly legacyFlag = signal(false); // never read — delete it
```

## Enforcement

TypeScript's `readonly` modifier on signal properties prevents accidental re-assignment.
The Angular Language Service flags reads of signals without `()` in templates. Beyond
that, the constraint "effect only in constructor" is a code-review rule:

- Any `effect()` call outside a constructor body is a review blocker.
- Any `effect` body containing a `.set()` or `.update()` call on a signal is a review
  blocker unless accompanied by a recorded justification.

No automated lint rule currently covers the "no `.set()` inside `effect`" case in the
general form, but ESLint's `no-restricted-syntax` can approximate it for common patterns.
The primary enforcement is architectural clarity: if you need to update a signal from a
reactive source, the correct tool is `computed` or `resource`, and the difference is
always obvious once the team knows to look.
