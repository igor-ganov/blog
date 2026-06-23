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

A `<div>` carries no meaning, no accessibility role, and no structural commitment, and
that is precisely why it causes trouble. A template full of `<div>` wrappers describes
layout rather than semantics. The component stops being a self-contained UI unit and turns
into a bag of markup that only makes sense once you already understand the surrounding
page.

The rule is simple: **no `<div>` inside a component template, ever.** When layout needs a
wrapper, that wrapper becomes a component, or it vanishes because `:host` already gives you
an element to style.

## Why this matters

During the content-admin SPA Grand Refactoring (completed 2026-03-24), phase 7
was titled "Component Cleanup". The target was stated plainly: **zero `<div>` elements,
all semantic HTML**. This was not a cosmetic goal. Before the cleanup we had components
that were really page sections wearing a component costume. Take `UserCardComponent`,
whose template was `<div class="card"><div class="card__header">...`; any parent that
wanted to override a style first had to learn the inner layout. The coupling went both
ways. Templates leaked structure up to parents, and parents leaked padding assumptions
back down through deep CSS selectors.

Removing every `<div>` forced two outcomes:

1. **Real component boundaries appeared.** A `<div class="card__actions">` had to become
   a `<card-actions>` component, which forced the question "what does this thing *do*?".
   Answering it clarified the public API.
2. **Semantic HTML became the default.** Once `<div>` is off the table, you reach for
   `<section>`, `<article>`, `<aside>`, `<nav>`, `<header>`, `<main>`. Assistive
   technology and search engines can then traverse the document tree meaningfully.

The application reached zero violations across more than 70 component files in a single
refactoring phase and has held that state since.

## How to apply

### Use :host for container styles

The host element is the component's root DOM node, and it already exists without any extra
markup. Styling it with `:host` replaces every "outer wrapper" `<div>`.

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

When a logical group of elements belongs together inside a larger template, make a
component for that group instead of wrapping it in a `<div>`.

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
the `common/` subfolder of their nearest common ancestor directory. Do not duplicate it,
and do not promote it to a global `shared/` module before you have to.

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

Before you create a new component, check whether a native element already carries the
right meaning. `<section>`, `<article>`, `<nav>`, `<aside>`, `<header>`, `<footer>`,
`<main>`, `<ul>`, `<ol>`, and `<figure>` all communicate intent to assistive technology
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

These patterns share one symptom. Parent templates break when the inner `<div>` is
restructured, because the parent's CSS referenced `.card .card__header` and that path no
longer exists. Styling through `:host` cuts the coupling, since the parent can only touch
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

Code review is the fallback. Any PR that introduces a `<div>` in an Angular template
needs an explicit, recorded justification, and that justification almost always points
to a missing component boundary.

## See also

- The same "no anonymous wrappers" principle applies to custom elements; see
  [ARIA on the real element](/principles/web-components/aria-on-the-real-element) for the
  accessibility side of this argument.
- Host bindings are the natural companion to `:host` styling — see
  [inject() and host metadata](/principles/angular/inject-and-host-bindings) for how to drive
  host element state from signals.
