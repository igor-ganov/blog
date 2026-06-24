---
title: 'Control-flow blocks and bindings, not structural directives'
category: angular
summary: 'Replace *ngIf/*ngFor/*ngSwitch with @if/@for/@switch blocks and replace ngClass/ngStyle with [class]/[style] bindings for leaner, type-safe templates.'
principle: 'Use @if/@for/@switch, never ngIf/ngFor; use [class]/[style] bindings, never ngClass/ngStyle.'
severity: strong
tags: [angular, templates, control-flow, directives, signals]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: '@if/@for/@switch; [class]/[style]; inline templates and styles.'
related:
  - angular/no-div-components-not-containers
  - angular/signals-resource-compute
order: 2
updated: 2026-06-10
---

Angular 17 made control flow part of the template language. The old structural
directives `*ngIf`, `*ngFor`, and `*ngSwitch` still ship for backwards compatibility,
but there's no reason to reach for them anymore. They need a module import, they confuse
the template type-checker in ways that bite you later, and they clutter the markup that
block syntax keeps clean. `ngClass` and `ngStyle` are the same kind of baggage:
attribute directives wrapping bindings the template already supports on its own.

So the rule has no exceptions. **Use `@if`, `@for`, and `@switch` everywhere, use
`[class]` and `[style]` everywhere, and import nothing structural.**

## Why this matters

Structural directives predate today's template type-checker. The `*` microsyntax
desugars into an `ng-template` plus a directive, so the compiler only reasons about them
at one remove. The practical fallout: `*ngIf="user"` never narrowed `user` to its
non-undefined type inside the block. You had to write `*ngIf="user; let u"` and then
reference `u`.

The `@if` block narrows the type directly:

```typescript
// The type of user() inside this block is User, not User | undefined.
@if (user()) {
  <app-user-card [user]="user()!" />  // still needs the ! — bad
}

// With @if narrowing applied correctly through a local binding:
@if (user(); as u) {
  <app-user-card [user]="u" />  // u: User — no assertion needed
}
```

There's a readability win too. Block syntax looks like control flow instead of attribute
decoration, so anyone who has used another template language reads `@if`/`@for`/`@switch`
without opening the Angular docs.

`ngClass` and `ngStyle` fail in a different way. Both take objects, like
`[ngClass]="{ active: isActive, disabled: isDisabled }"`, which feels handy right up to
the moment you rename one of those keys. The keys are unchecked strings. Compare that to
`[class.active]`, a typed binding the compiler verifies against the template context: if
`isActive` changes type, the build breaks. `[ngClass]` just swallows the wrong value.

The standard also requires inline templates and styles. Every `@Component` keeps its
template as a string in the `template` field and its styles as an array in the `styles`
field, with no separate `.html` or `.css` files. The whole component lives in one file,
which is exactly why the block syntax fits: you read the template, control flow and all,
as plain TypeScript context.

## How to apply

### @if and @else

```typescript
// Bad
@Component({
  template: `
    <div *ngIf="isLoggedIn; else loginBlock">
      <app-dashboard />
    </div>
    <ng-template #loginBlock>
      <app-login />
    </ng-template>
  `,
})
export class AppShellComponent {
  readonly isLoggedIn = false;
}

// Good — inline template, block syntax, no ng-template
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [DashboardComponent, LoginComponent],
  template: `
    @if (isLoggedIn()) {
      <app-dashboard />
    } @else {
      <app-login />
    }
  `,
  styles: [`:host { display: contents; }`],
})
export class AppShellComponent {
  readonly isLoggedIn = signal(false);
}
```

An `@else if` branch needs no extra ceremony: `@else if (isAdmin()) { ... }`.

### @for with track

`@for` requires an explicit `track` expression, and the compiler enforces it. The
expression has to uniquely identify each item. Falling back to `$index` is a last
resort, not a default.

```typescript
// Bad — *ngFor without trackBy; every change re-creates all DOM nodes
@Component({
  template: `
    <li *ngFor="let ticket of tickets">{{ ticket.title }}</li>
  `,
})
export class TicketListComponent {
  readonly tickets: Ticket[] = [];
}

// Good — @for with a stable identity track; DOM nodes are reused on updates
@Component({
  selector: 'app-ticket-list',
  standalone: true,
  template: `
    <ul>
      @for (ticket of tickets(); track ticket.id) {
        <app-ticket-row [ticket]="ticket" />
      } @empty {
        <li>No tickets found.</li>
      }
    </ul>
  `,
  styles: [`:host { display: block; }`],
})
export class TicketListComponent {
  readonly tickets = input.required<readonly Ticket[]>();
}
```

The `@empty` block replaces the secondary `*ngIf` people used to pair with `*ngFor` for
the empty case. It belongs to the `@for` block itself, so there's no auxiliary directive
and no extra `ng-template`.

### @switch

```typescript
// Bad — nested *ngIf chain to implement a switch
@Component({
  template: `
    <span *ngIf="status === 'open'">Open</span>
    <span *ngIf="status === 'closed'">Closed</span>
    <span *ngIf="status === 'pending'">Pending</span>
  `,
})
export class StatusBadgeComponent {
  @Input() status: TicketStatus = 'open';
}

// Good — @switch reads as a switch statement; [class] drives visual state
@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    @switch (status()) {
      @case ('open')    { <span [class.badge--open]="true">Open</span> }
      @case ('closed')  { <span [class.badge--closed]="true">Closed</span> }
      @case ('pending') { <span [class.badge--pending]="true">Pending</span> }
      @default          { <span>Unknown</span> }
    }
  `,
  styles: [`
    :host { display: inline-block; }
    .badge--open    { color: var(--color-success); }
    .badge--closed  { color: var(--color-neutral); }
    .badge--pending { color: var(--color-warning); }
  `],
})
export class StatusBadgeComponent {
  readonly status = input.required<TicketStatus>();
}
```

### [class] and [style] bindings

```typescript
// Bad — ngClass with an object literal; keys are unverified strings
@Component({
  template: `
    <button [ngClass]="{ 'btn--primary': isPrimary, 'btn--disabled': isDisabled }">
      {{ label }}
    </button>
  `,
})
export class ButtonComponent {
  @Input() isPrimary = false;
  @Input() isDisabled = false;
  @Input() label = '';
}

// Good — [class.x] bindings; the compiler checks isPrimary() exists on the component
@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button
      [class.btn--primary]="isPrimary()"
      [class.btn--disabled]="isDisabled()"
      [disabled]="isDisabled()"
    >
      {{ label() }}
    </button>
  `,
  styles: [`
    :host { display: inline-block; }
    .btn--primary  { background: var(--color-primary); }
    .btn--disabled { opacity: 0.4; pointer-events: none; }
  `],
})
export class ButtonComponent {
  readonly isPrimary = input(false);
  readonly isDisabled = input(false);
  readonly label = input.required<string>();
}
```

CSS custom properties and arbitrary style values bind the same way through `[style.--prop]`:

```typescript
// Drive a CSS custom property from a signal — no ngStyle object needed
template: `<span [style.--progress]="progress() + '%'">{{ progress() }}%</span>`
```

The `[style.width.px]` unit-suffix form drops the string concatenation entirely:

```typescript
// Bad
template: `<div [ngStyle]="{ width: width + 'px' }">...</div>`

// Good
template: `<section [style.width.px]="width()">...</section>`
```

## Anti-patterns

```typescript
// Anti-pattern 1: Importing CommonModule "for convenience"
// CommonModule re-exports all structural directives. Importing it is an implicit
// opt-in to *ngIf, *ngFor, and ngClass. Import only what is needed.
@Component({
  standalone: true,
  imports: [CommonModule],  // pulls in every legacy directive
})

// Fix: import the specific components/pipes needed; use block syntax for control flow.

// Anti-pattern 2: ngStyle for a single property
// ngStyle creates an Observable-like dirty-checking mechanism for a property that
// a single [style.x] binding handles in one token.
template: `<div [ngStyle]="{ opacity: isVisible ? 1 : 0 }">...</div>`
// Fix:
template: `<section [style.opacity]="isVisible() ? 1 : 0">...</section>`

// Anti-pattern 3: *ngFor without trackBy
// Without tracking, Angular destroys and recreates every list item on any change to
// the array reference. For a 200-row table, this is hundreds of DOM mutations per
// keystroke in a search box.
template: `<tr *ngFor="let row of rows">...</tr>`
// Fix:
template: `@for (row of rows(); track row.id) { <tr>...</tr> }`

// Anti-pattern 4: Nested *ngIf to simulate @if/@else
template: `
  <app-content *ngIf="loaded" />
  <app-spinner *ngIf="!loaded" />
`
// Fix:
template: `
  @if (loaded()) {
    <app-content />
  } @else {
    <app-spinner />
  }
`
```

All four share one root cause: the template states intent through directives rather than
language constructs. The compiler treats those directives as opaque strings. It parses
block syntax as real syntax and can check it.

## Enforcement

Angular's own migration CLI can automate the conversion:

```bash
ng generate @angular/core:control-flow
```

It rewrites every `*ngIf`/`*ngFor`/`*ngSwitch` in the project to block syntax in a
single pass. Run it once, then guard the result with lint so nothing regresses.

The `@angular-eslint/template` plugin provides the
`@angular-eslint/template/no-legacy-template-syntax` rule that rejects structural
directive syntax. Add it to the template lint config:

```jsonc
{
  "files": ["**/*.html"],
  "rules": {
    "@angular-eslint/template/no-legacy-template-syntax": "error"
  }
}
```

The binding side is covered by the same plugin's
`@angular-eslint/template/no-ngClass-and-ngStyle` rule (custom or community). When no
packaged rule exists for your version yet, fall back to a code-review checklist entry:
any PR that imports or uses `NgClass`, `NgStyle`, `NgIf`, `NgFor`, or `NgSwitch` has to
justify it.
