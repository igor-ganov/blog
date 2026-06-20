---
title: 'inject() and host metadata, not constructors and HostBinding'
category: angular
summary: 'Use inject() for dependency resolution and the host metadata object for host element bindings; keep templates and styles inline.'
principle: 'Resolve dependencies with inject(); bind host state via the host metadata object, not @HostBinding; keep templates and styles inline.'
severity: preferred
tags: [angular, inject, host, bindings, di, signals]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'inject() over constructor DI; host metadata over @HostBinding.'
related:
  - angular/no-div-components-not-containers
  - angular/services-as-functions
order: 4
updated: 2026-06-10
---

Angular accepts two dependency injection styles and two host-binding styles at once, both
syntactically valid. The older form is decorator-based: constructor parameters annotated
with `@Inject` or typed by class, plus `@HostBinding` decorators on properties. The newer
form calls `inject()` at the top of the class body and uses `host` as a metadata key on the
`@Component` decorator.

Use **`inject()` and `host:{}` metadata everywhere**. The decorator forms still work; they
just aren't the default here.

## Why this matters

### inject() over constructor injection

Constructor injection forces a constructor to exist. A class built on `inject()` needs no
constructor at all unless it has real initialisation logic beyond resolving dependencies.
The boilerplate adds up: each injected dependency is a parameter, a property declaration,
and an assignment in the constructor body. Parameter properties shrink that, but they're
still a separate syntactic form you have to read.

```typescript
// Bad — constructor exists only to inject; three tokens of boilerplate per dependency
@Component({ /* ... */ })
export class TicketListComponent {
  private readonly ticketService: TicketService;
  private readonly router: Router;

  constructor(ticketService: TicketService, router: Router) {
    this.ticketService = ticketService;
    this.router = router;
  }
}

// Also bad — parameter properties are shorter but still require the constructor
@Component({ /* ... */ })
export class TicketListComponent {
  constructor(
    private readonly ticketService: TicketService,
    private readonly router: Router,
  ) {}
}
```

With `inject()` the constructor disappears, and each dependency becomes a `readonly`
property initialised right where it's declared:

```typescript
// Good — no constructor; dependencies are properties with clear types
@Component({ /* ... */ })
export class TicketListComponent {
  private readonly ticketService = inject(TicketService);
  private readonly router = inject(Router);
}
```

This pairs well with signals. Since `inject()` runs during construction, inside the
injection context, any `computed` or `resource` that depends on an injected service can be
initialised inline too:

```typescript
@Component({
  selector: 'app-ticket-list',
  standalone: true,
  template: `
    @for (ticket of tickets.value() ?? []; track ticket.id) {
      <app-ticket-row [ticket]="ticket" />
    }
  `,
  styles: [`:host { display: block; }`],
})
export class TicketListComponent {
  private readonly ticketService = inject(TicketService);

  readonly tickets = resource({
    loader: () => this.ticketService.list(),
  });
}
```

There's no constructor here, no lifecycle hook, and nothing to unsubscribe.

### host metadata over @HostBinding

`@HostBinding` decorates a class property and ties it to a host attribute or CSS class. It
works, but it scatters host state through the class body, so understanding what's bound
means reading both the decorator and the property it sits on. The `host` metadata object on
`@Component` or `@Directive` collects every host binding in one place, next to `selector`,
`template`, and `styles`, so the whole host surface is right there.

`@HostBinding` also handles signals awkwardly. Reflecting a signal value as a host class
still means calling the signal as a function inside the binding expression. The `host`
metadata accepts arbitrary template expressions, so signal calls just work.

```typescript
// Bad — @HostBinding decorators scattered in the class body;
//       reading the host surface means scrolling the whole file
@Component({
  selector: 'app-nav-link',
  template: `<ng-content />`,
  styles: [`
    :host { display: block; }
    :host(.active) { font-weight: bold; }
  `],
})
export class NavLinkComponent {
  @Input() href = '';

  @HostBinding('class.active')
  get isActive(): boolean {
    return this.router.url === this.href;
  }

  @HostBinding('attr.aria-current')
  get ariaCurrent(): string | undefined {
    return this.isActive ? 'page' : undefined;
  }

  constructor(private readonly router: Router) {}
}

// Good — host metadata centralises all host bindings; inject() replaces constructor
@Component({
  selector: 'app-nav-link',
  standalone: true,
  template: `<ng-content />`,
  styles: [`
    :host { display: block; }
    :host(.active) { font-weight: bold; }
  `],
  host: {
    '[class.active]': 'isActive()',
    '[attr.aria-current]': 'isActive() ? "page" : null',
  },
})
export class NavLinkComponent {
  readonly href = input.required<string>();

  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
  );

  readonly isActive = computed(() => this.currentUrl() === this.href());
}
```

Everything the host element exposes (classes, attributes, event listeners) sits in the
metadata object where you can read it in one pass. You never scan the class body for stray
decorators.

### Inline templates and styles

Component templates and styles belong in the `@Component` decorator, not in separate
`.html` and `.css` files. The point is cohesion. A component is one unit, and spreading its
template across two files buys you no modularity; it just makes you open two tabs to follow
one thing.

The engineering standard treats this as mandatory, so `templateUrl` and `styleUrls` go
unused.

```typescript
// Bad — split files require switching between tabs
@Component({
  selector: 'app-badge',
  templateUrl: './badge.component.html',
  styleUrls: ['./badge.component.css'],
})
export class BadgeComponent {}

// Good — self-contained; the component is one file
@Component({
  selector: 'app-badge',
  standalone: true,
  template: `<span>{{ label() }}</span>`,
  styles: [`
    :host {
      display: inline-flex;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      background: var(--color-badge-bg);
    }
  `],
})
export class BadgeComponent {
  readonly label = input.required<string>();
}
```

## Anti-patterns

```typescript
// Anti-pattern 1: constructor injection alongside inject()
// Mixing the two styles in one class is inconsistent and forces the constructor to exist.
@Component({ /* ... */ })
export class MixedComponent {
  private readonly a = inject(ServiceA);

  constructor(private readonly b: ServiceB) {} // inconsistent
}
// Fix: convert b to inject(ServiceB).

// Anti-pattern 2: @HostBinding with a getter that reads a signal
// This works but is verbose; the host metadata form is cleaner.
@HostBinding('class.loading')
get isLoading(): boolean {
  return this.loadingSignal();
}
// Fix: host: { '[class.loading]': 'loadingSignal()' }

// Anti-pattern 3: @HostListener for events that can go in host metadata
// @HostListener is the event-binding equivalent of @HostBinding — same problem.
@HostListener('click', ['$event'])
onClick(event: MouseEvent): void { /* ... */ }
// Fix: host: { '(click)': 'onClick($event)' }

// Anti-pattern 4: inject() called outside the class body initializer
// inject() is only valid inside an injection context. Calling it in a method or
// a setTimeout callback throws at runtime.
someMethod(): void {
  const service = inject(SomeService); // throws: not in injection context
}
// Fix: declare as a class property initializer.
```

## Enforcement

At development time the Angular Language Service warns when `inject()` is called outside an
injection context. Set the `@angular-eslint` rule `@angular-eslint/prefer-inject`
(available from angular-eslint v18) to `error` to flag constructor injection in favour of
`inject()`:

```jsonc
{
  "rules": {
    "@angular-eslint/prefer-inject": "error"
  }
}
```

For the `@HostBinding` / `@HostListener` preference, the `@angular-eslint` rules
`@angular-eslint/no-host-metadata-property` and `@angular-eslint/use-component-view-encapsulation`
cover related concerns. The `host` metadata preference itself stays a code-review
convention rather than a lint-enforced rule, so any PR that introduces `@HostBinding` or
`@HostListener` has to justify it explicitly.
