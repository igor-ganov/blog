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

Angular has two dependency injection styles and two host-binding styles that are
syntactically valid at the same time. The decorator-based style — constructor parameters
annotated with `@Inject` or typed by class, and `@HostBinding` decorators on properties
— is the older form. The function-based style — `inject()` called at the top of the
class body, and `host` as a metadata key on the `@Component` decorator — is the modern
form.

The preference is clear: **`inject()` and `host:{}` metadata everywhere**. The decorator
forms are not forbidden but they are not the default.

## Why this matters

### inject() over constructor injection

Constructor injection requires the constructor to exist. A class that uses `inject()`
needs no constructor at all unless it has initialisation logic beyond dependency
resolution. The boilerplate cost is real: every injected dependency means a parameter,
a property declaration, and an assignment in the constructor body (or, with parameter
properties, a compact but still syntactically distinct form).

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

With `inject()`, the constructor disappears and each dependency is a `readonly` property
initialised at the point of declaration:

```typescript
// Good — no constructor; dependencies are properties with clear types
@Component({ /* ... */ })
export class TicketListComponent {
  private readonly ticketService = inject(TicketService);
  private readonly router = inject(Router);
}
```

This composes naturally with signals. Because `inject()` runs during the construction
phase (inside the injection context), `computed` and `resource` that depend on injected
services can also be initialised inline:

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

No constructor, no lifecycle hook, no subscription management.

### host metadata over @HostBinding

`@HostBinding` decorates a class property and links it to a host attribute or CSS
class. It works, but it scatters host state across the class body in a way that requires
reading both the decorator and the property to understand what is bound. The `host`
metadata object in `@Component` or `@Directive` puts every host binding in one place —
alongside `selector`, `template`, and `styles` — making the host surface area
immediately visible.

`@HostBinding` also does not compose well with signals. To reflect a signal value as a
host class you still need to call the signal as a function in the binding expression.
The `host` metadata supports arbitrary template expressions, so signal calls work
directly.

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

The entire host surface — what classes, attributes, and event listeners the host element
exposes — is visible at a glance in the metadata object. No scanning the class body for
decorators.

### Inline templates and styles

All component templates and styles belong in the `@Component` decorator, not in
separate `.html` and `.css` files. The reasoning is cohesion: a component is a unit, and
splitting its template across two files does not improve modularity — it just makes you
open two tabs to understand one thing.

The engineering standard makes this mandatory. The `templateUrl` and `styleUrls` keys are
not used.

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

The Angular Language Service warns when `inject()` is called outside an injection
context at development time. The `@angular-eslint` rule
`@angular-eslint/prefer-inject` (available from angular-eslint v18) can be set to
`error` to flag constructor injection in favour of `inject()`:

```jsonc
{
  "rules": {
    "@angular-eslint/prefer-inject": "error"
  }
}
```

For the `@HostBinding` / `@HostListener` preference, the `@angular-eslint` rules
`@angular-eslint/no-host-metadata-property` and `@angular-eslint/use-component-view-encapsulation`
cover related concerns. The `host` metadata preference is currently a code-review
convention rather than a lint-enforced rule: any PR that introduces `@HostBinding` or
`@HostListener` requires an explicit justification.
