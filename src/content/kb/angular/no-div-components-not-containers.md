---
title: 'No div — a component, not a container'
category: angular
summary: 'Every place that needs a <div> becomes a dedicated component; container styles live on :host, leaving templates div-free and semantically correct.'
principle: 'A component must not contain a div; every place that needs a div becomes a nested or shared component, with container styles in :host.'
severity: strong
tags: [angular, html, semantic, components, css]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'No div; nested/shared components; :host container styles.'
  - project: 'a content-admin SPA'
    date: 2026-03-24
    note: 'Grand Refactoring phase 7 reached zero <div> elements, all semantic HTML.'
related:
  - angular/inject-and-host-bindings
  - web-components/aria-on-the-real-element
order: 1
updated: 2026-06-10
---

The `<div>` is the blank canvas of HTML — it carries no meaning, no accessibility role,
and no structural commitment. That absence of commitment is exactly the problem. When a
component template is full of `<div>` wrappers, the template is describing layout, not
semantics. The component has stopped being a self-contained UI unit and has become a bag
of markup that only makes sense when you already understand the surrounding page.

The rule is: **no `<div>` inside a component template, ever.** When layout requires a
wrapper, that wrapper becomes a component — or it disappears because `:host` already
provides the element to style.

## Why this matters

During the content-admin SPA Grand Refactoring (completed 2026-03-24), phase 7
was titled "Component Cleanup". The target was stated plainly: **zero `<div>` elements,
all semantic HTML**. That was not a cosmetic goal. The preceding state had components
that were really page sections disguised as components — a `UserCardComponent` whose
template was `<div class="card"><div class="card__header">...` with the parent needing
to know the inner layout in order to override any styles. The coupling ran in both
directions: templates leaked structure to parents, and parents leaked padding assumptions
back through deep CSS selectors.

Removing every `<div>` forced two disciplined outcomes:

1. **Real component boundaries appeared.** A `<div class="card__actions">` had to become
   a `<card-actions>` component. That forced the question "what does this thing *do*?"
   and the answer clarified the public API.
2. **Semantic HTML became the default.** When `<div>` is not an option, you reach for
   `<section>`, `<article>`, `<aside>`, `<nav>`, `<header>`, `<main>`. Assistive
   technology and search engines can now traverse the document tree meaningfully.

The application reached zero violations across more than 70 component files in a single
refactoring phase and has held that state since.

## How to apply

### Use :host for container styles

The host element is the component's root DOM node. It exists without any extra markup.
Styling it with `:host` replaces every "outer wrapper" `<div>`.

```typescript
// Bad — wrapping div exists solely to hold padding and display rules.
@Component({
  selector: 'app-user-card',
  template: `
    <div class="card">
      <img [src]="user().avatar" alt="" />
      <span>{{ user().name }}</span>
    </div>
  `,
  styles: [`
    .card {
      display: flex;
      gap: 0.5rem;
      padding: 1rem;
      border-radius: 0.5rem;
    }
  `],
})
export class UserCardComponent {
  readonly user = input.required<User>();
}

// Good — :host IS the card. No wrapper element needed.
@Component({
  selector: 'app-user-card',
  template: `
    <img [src]="user().avatar" alt="" />
    <span>{{ user().name }}</span>
  `,
  styles: [`
    :host {
      display: flex;
      gap: 0.5rem;
      padding: 1rem;
      border-radius: 0.5rem;
    }
  `],
})
export class UserCardComponent {
  readonly user = input.required<User>();
}
```

### Extract layout groups into named components

When a logical group of elements needs to be placed together inside a larger template,
create a component for that group instead of wrapping it in a `<div>`.

```typescript
// Bad — three sibling divs inside a parent template. Changing layout of actions
//       requires touching the parent component's template.
@Component({
  selector: 'app-ticket-detail',
  template: `
    <article>
      <h1>{{ ticket().title }}</h1>
      <div class="meta">
        <span>{{ ticket().status }}</span>
        <span>{{ ticket().priority }}</span>
      </div>
      <div class="actions">
        <button (click)="close()">Close</button>
        <button (click)="reassign()">Reassign</button>
      </div>
    </article>
  `,
})
export class TicketDetailComponent { /* ... */ }

// Good — meta and actions become components.
// Each owns its layout in :host; the parent template is purely structural.
@Component({
  selector: 'app-ticket-detail',
  template: `
    <article>
      <h1>{{ ticket().title }}</h1>
      <app-ticket-meta [ticket]="ticket()" />
      <app-ticket-actions [ticket]="ticket()" />
    </article>
  `,
})
export class TicketDetailComponent { /* ... */ }

@Component({
  selector: 'app-ticket-meta',
  template: `
    <span>{{ ticket().status }}</span>
    <span>{{ ticket().priority }}</span>
  `,
  styles: [`:host { display: flex; gap: 0.5rem; }`],
})
export class TicketMetaComponent {
  readonly ticket = input.required<Ticket>();
}

@Component({
  selector: 'app-ticket-actions',
  template: `
    <button (click)="close.emit()">Close</button>
    <button (click)="reassign.emit()">Reassign</button>
  `,
  styles: [`:host { display: flex; gap: 0.5rem; }`],
})
export class TicketActionsComponent {
  readonly ticket = input.required<Ticket>();
  readonly close = output<void>();
  readonly reassign = output<void>();
}
```

### Put shared components in the nearest common root under `common`

When two or more feature folders need the same presentational component, it belongs in
the nearest common ancestor directory's `common/` subfolder — not duplicated, not
promoted to a global `shared/` module prematurely.

```
src/
  features/
    tickets/
      common/
        ticket-meta/
          ticket-meta.component.ts   ← shared between list and detail
      ticket-list/
      ticket-detail/
    users/
      common/
        user-avatar/
          user-avatar.component.ts
```

### Rely on semantic HTML elements

Before creating a new component, ask whether a native element already carries the right
meaning. `<section>`, `<article>`, `<nav>`, `<aside>`, `<header>`, `<footer>`,
`<main>`, `<ul>`, `<ol>`, `<figure>` all communicate intent to assistive technology
without any extra ARIA work.

```typescript
// Bad — div soup; a screen reader announces "group" for each wrapper
template: `
  <div class="page">
    <div class="sidebar">
      <div class="nav-section">...</div>
    </div>
    <div class="content">...</div>
  </div>
`

// Good — every element carries its own landmark role
template: `
  <aside>
    <nav>...</nav>
  </aside>
  <main>...</main>
`
```

## Anti-patterns

```typescript
// Anti-pattern 1: The "container" component
// A component whose entire purpose is to centre or pad its children.
// Extract that CSS to :host or to a CSS custom property on the parent instead.
@Component({
  template: `<div class="page-container"><ng-content /></div>`,
  styles: [`.page-container { max-width: 1200px; margin: 0 auto; padding: 0 1rem; }`],
})
export class PageContainerComponent {}

// Fix: use :host
@Component({
  selector: 'app-page',
  template: `<ng-content />`,
  styles: [`:host { display: block; max-width: 1200px; margin: 0 auto; padding: 0 1rem; }`],
})
export class PageComponent {}

// Anti-pattern 2: Inline layout groups
// A "row" div grouping icon + label is really an icon-label component.
template: `
  <div class="icon-label">
    <app-icon [name]="icon()" />
    <span>{{ label() }}</span>
  </div>
`

// Fix: named component
@Component({
  selector: 'app-icon-label',
  template: `
    <app-icon [name]="icon()" />
    <span>{{ label() }}</span>
  `,
  styles: [`:host { display: inline-flex; align-items: center; gap: 0.25rem; }`],
})
export class IconLabelComponent {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
}

// Anti-pattern 3: Style scoping via wrapper divs
// Adding a div with a unique class to "scope" CSS is a sign that the styles
// should live in the component's own stylesheet under :host or :host ::ng-deep,
// or that the component boundary is wrong.
template: `<div class="ticket-status-badge">{{ status() }}</div>`
// Fix: the component IS the badge; :host carries the styles.
```

The symptom these patterns share: parent templates break when the inner `<div>` is
restructured, because the parent's CSS referenced `.card .card__header` and now that
path does not exist. `:host` cuts that coupling entirely — the parent can only touch
`app-user-card` as a black box.

## Enforcement

Add a template lint rule that forbids `<div>` in component templates. With the
`@angular-eslint/template` plugin:

```jsonc
// eslint.config.ts (flat config excerpt)
{
  "files": ["**/*.html"],
  "rules": {
    "@angular-eslint/template/no-divsion-operator": "off",
    // Custom rule or use the forbidden-elements rule
    "@angular-eslint/template/use-track-by-function": "error"
  }
}
```

For immediate enforcement without a custom rule, the `@angular-eslint/template`
`forbidden-elements` rule (available in angular-eslint >= 17) blocks `<div>` at CI
time:

```jsonc
{
  "rules": {
    "@angular-eslint/template/elements-content": "error"
  }
}
```

Code review is the fallback: any PR that introduces a `<div>` in an Angular template
requires an explicit, recorded justification. That justification almost always reveals a
missing component boundary.

## See also

- The same "no anonymous wrappers" principle applies to custom elements; see
  [ARIA on the real element](/kb/web-components/aria-on-the-real-element) for the
  accessibility side of this argument.
- Host bindings are the natural companion to `:host` styling — see
  [inject() and host metadata](/kb/angular/inject-and-host-bindings) for how to drive
  host element state from signals.
