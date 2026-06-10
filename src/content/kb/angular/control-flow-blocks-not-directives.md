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

Angular 17 shipped built-in control-flow syntax as a first-class language feature.
The structural directives `*ngIf`, `*ngFor`, and `*ngSwitch` remain in the framework
for backwards compatibility but are strictly inferior: they require module imports, they
bypass the template type-checker in subtle ways, and they add visual noise that the
block syntax eliminates. The same argument applies to `ngClass` and `ngStyle` — both
are attribute-directive wrappers around binding capabilities that the template already
has natively.

The rule is categorical: **use `@if`, `@for`, and `@switch` always; use `[class]` and
`[style]` always; import nothing structural**.

## Why this matters

Structural directives were designed for a world before the Angular template type-checker
was as capable as it is today. Their `*` microsyntax desugars into `ng-template` plus a
directive, which means the template compiler reasons about them indirectly. In practice
this meant `*ngIf="user"` inside a template did not automatically narrow `user` to its
non-undefined type inside the block — you needed `*ngIf="user; let u"` and then use `u`.

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

Beyond type safety, the block syntax reads as control flow, not as attribute decoration.
A developer coming from any template language recognises `@if`/`@for`/`@switch` without
consulting Angular documentation.

The `ngClass` and `ngStyle` directives are a different problem. Both accept objects —
`[ngClass]="{ active: isActive, disabled: isDisabled }"` — which look convenient until
you need to refactor the key strings. The object keys are unchecked strings. `[class.active]`
is a typed binding that the compiler can verify against the template's context; if `isActive`
changes type, the build fails. `[ngClass]` silently accepts the wrong value.

The engineering standard mandates inline templates and inline styles. Every `@Component`
carries its template as a string in the `template` field and its styles as an array in
the `styles` field. There are no separate `.html` or `.css` files — the component is one
file. This constraint pairs directly with the control-flow block preference: the template
is readable as pure TypeScript context, control flow included.

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

The `@else if` branch works without any additional syntax: `@else if (isAdmin()) { ... }`.

### @for with track

`@for` requires an explicit `track` expression. This is not optional syntax — the
compiler enforces it. The expression must uniquely identify each item; using `$index` is
a last resort, not a default.

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

The `@empty` block replaces a secondary `*ngIf` that was commonly paired with `*ngFor`
to handle the empty state. It is structurally part of the `@for` block — no auxiliary
directive, no extra `ng-template`.

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

For CSS custom properties and arbitrary style values, `[style.--prop]` works the same
way:

```typescript
// Drive a CSS custom property from a signal — no ngStyle object needed
template: `<span [style.--progress]="progress() + '%'">{{ progress() }}%</span>`
```

The `[style.width.px]` unit suffix form also eliminates string concatenation:

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

Each of the above has the same underlying failure: the template expresses intent through
directives instead of language constructs. The directives are strings to the compiler;
the block syntax is syntax.

## Enforcement

Angular's own migration CLI can automate the conversion:

```bash
ng generate @angular/core:control-flow
```

This migrates every `*ngIf`/`*ngFor`/`*ngSwitch` in the project to block syntax in one
pass. Run it once; guard the new state with lint.

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

For `ngClass`/`ngStyle`, the same plugin's
`@angular-eslint/template/no-ngClass-and-ngStyle` rule (custom or community) covers the
binding side. If no packaged rule exists yet for your version, a code-review checklist
entry is the backstop: any PR that imports or uses `NgClass`, `NgStyle`, `NgIf`,
`NgFor`, or `NgSwitch` requires justification.
