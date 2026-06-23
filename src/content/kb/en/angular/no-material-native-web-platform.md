---
title: 'No Material by default; build on the Web Platform'
category: angular
summary: "If the project does not already use Material Design, do not add it — build custom components on modern Web Platform APIs and animate with native CSS."
principle: "If the project doesn't already use Material Design, don't add it — build custom components with modern Web Platform APIs; prefer native CSS over Angular animations."
severity: context
tags: [angular, material, web-platform, css, animations, components]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'No Material unless already used; native Web Platform; native CSS not Angular animations.'
related:
  - web-components/lit-functional-core
  - design-ux/minimalism-no-emoji-schematic
order: 6
updated: 2026-06-10
---

Angular Material is a whole design system. It brings an opinionated visual language, theming
tokens, a suite of pre-built components, and a custom animation library, and that completeness
is what you pay for. If a project has committed to Material Design (its typography scale,
elevation model, and component behaviours), Angular Material earns its place. If the project
already has its own design language, pulling in Angular Material just to get a button or a
dialog means adopting a full system to use one slice of it.

So the rule depends on the project. **Check first.** A project that already uses Angular
Material should keep using it for consistency. A project that does not should reach for the
Web Platform, which already ships dialogs, popovers, transitions, and scroll-driven animations.

## Why this matters

### Bundle cost

Angular Material pulls in `@angular/cdk`, its own theming SCSS, and a set of component
modules. Even with tree-shaking, a single dialog component adds tens of kilobytes of
compiled CSS and JavaScript. A native `<dialog>` element costs zero kilobytes, because it
already ships in the browser.

### Mismatch with a custom design

A custom design system and Angular Material fight each other. Material's component
internals carry their own CSS variable namespace, their own elevation scale, and their own
motion tokens. You can override them in a theme file, but it's brittle work, because
Material's internal variable names change between major versions. A WebRTC platform project
chose headless, custom components on web platform primitives specifically to dodge this
coupling, so that each component's style lives entirely under the project's own design tokens.

### Angular animations vs. native CSS

Angular's `@angular/animations` module is a JavaScript-driven animation system. It ships
its own runtime, has to be bootstrapped with `provideAnimations()`, and drives animations
through programmatic state changes. Native CSS covers the same ground (transitions, keyframe
animations, scroll-driven effects, the `View Transitions API`) with no JavaScript overhead,
lower latency since there is no JS-to-style bridge, and hardware acceleration by default.

For discrete UI state such as a button hover, a badge appearing, or a drawer sliding in, a CSS
`transition` on a class change triggered by a signal does the job with no extra imports.

## How to apply

### Check before adding

Before installing `@angular/material`, check whether `@angular/material` already appears
in `package.json`. If yes, use it consistently. If no, stop — do not add it.

```bash
# If this prints a version number, the project uses Material — stay consistent.
# If it prints nothing, do not add it.
cat package.json | grep '@angular/material'
```

### Use native HTML for interactive elements

Modern HTML ships interactivity that used to require a library.

**Dialog / modal**

```typescript
// Bad — adds @angular/material and MatDialog for a modal
import { MatDialog } from '@angular/material/dialog';

@Component({ /* ... */ })
export class HostComponent {
  private readonly dialog = inject(MatDialog);

  openConfirm(): void {
    this.dialog.open(ConfirmDialogComponent, { width: '400px' });
  }
}

// Good — native <dialog> element, zero dependencies
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <dialog #dialogEl>
      <h2>{{ title() }}</h2>
      <p>{{ message() }}</p>
      <menu>
        <button (click)="cancel()">Cancel</button>
        <button (click)="confirm()">Confirm</button>
      </menu>
    </dialog>
  `,
  styles: [`
    :host { display: contents; }
    dialog {
      border: none;
      border-radius: 0.5rem;
      padding: 1.5rem;
      box-shadow: var(--shadow-lg);
    }
    dialog::backdrop {
      background: rgb(0 0 0 / 0.5);
    }
  `],
})
export class ConfirmDialogComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmed = output<boolean>();

  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dialogEl');

  open(): void {
    this.dialogEl().nativeElement.showModal();
  }

  confirm(): void {
    this.dialogEl().nativeElement.close();
    this.confirmed.emit(true);
  }

  cancel(): void {
    this.dialogEl().nativeElement.close();
    this.confirmed.emit(false);
  }
}
```

**Popover**

The Popover API is now baseline-available across modern browsers. A `popover` attribute
plus a `popovertarget` attribute replace a floating-panel component outright:

```typescript
@Component({
  selector: 'app-action-menu',
  standalone: true,
  template: `
    <button popovertarget="action-menu-popover">Actions</button>
    <menu id="action-menu-popover" popover>
      <li><button (click)="edit.emit()">Edit</button></li>
      <li><button (click)="delete.emit()">Delete</button></li>
    </menu>
  `,
  styles: [`
    :host { display: inline-block; position: relative; }
    menu[popover] {
      border: 1px solid var(--color-border);
      border-radius: 0.375rem;
      padding: 0.25rem;
      list-style: none;
    }
  `],
})
export class ActionMenuComponent {
  readonly edit = output<void>();
  readonly delete = output<void>();
}
```

### Animate with native CSS, not @angular/animations

```typescript
// Bad — BrowserAnimationsModule + trigger() for a simple fade
import { trigger, state, style, animate, transition } from '@angular/animations';

@Component({
  animations: [
    trigger('fade', [
      state('visible', style({ opacity: 1 })),
      state('hidden', style({ opacity: 0 })),
      transition('visible <=> hidden', [animate('200ms ease-in-out')]),
    ]),
  ],
  template: `<section [@fade]="isVisible() ? 'visible' : 'hidden'">...</section>`,
})
export class PanelComponent {
  readonly isVisible = signal(true);
}

// Good — CSS transition triggered by a [class] binding; zero runtime cost
@Component({
  selector: 'app-panel',
  standalone: true,
  template: `
    <section [class.panel--hidden]="!isVisible()">
      <ng-content />
    </section>
  `,
  styles: [`
    section {
      opacity: 1;
      transition: opacity 200ms ease-in-out;
    }
    section.panel--hidden {
      opacity: 0;
      pointer-events: none;
    }
  `],
})
export class PanelComponent {
  readonly isVisible = input(true);
}
```

For entrance and exit animations, CSS `@starting-style` (baseline 2024) takes away the last
reason to use Angular animations for discrete state transitions:

```css
/* Animates opacity from 0 on initial render, then stays at 1 */
section {
  opacity: 1;
  transition: opacity 200ms ease-in-out;
}

@starting-style {
  section {
    opacity: 0;
  }
}
```

For scroll-driven animations, the Scroll-driven Animations API (`animation-timeline:
scroll()`) is baseline 2024 and needs zero JavaScript.

### Headless custom components over library wrappers

A WebRTC platform and a headless web-component library both use headless custom components.
A component defines behaviour and exposes ARIA-correct markup, while all styling comes from
the host project's design tokens. What you get from that:

- No dependency on a third-party component library version.
- No inherited opinionated CSS that you then have to override.
- Accessibility you can audit, because ARIA is explicit in the template.

```typescript
// A headless tabs component — behaviour only; styling entirely via CSS variables
@Component({
  selector: 'app-tabs',
  standalone: true,
  template: `
    <nav role="tablist">
      @for (tab of tabs(); track tab.id) {
        <button
          role="tab"
          [id]="'tab-' + tab.id"
          [attr.aria-controls]="'panel-' + tab.id"
          [attr.aria-selected]="selectedId() === tab.id"
          [class.tab--selected]="selectedId() === tab.id"
          (click)="select(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </nav>
    @for (tab of tabs(); track tab.id) {
      <section
        role="tabpanel"
        [id]="'panel-' + tab.id"
        [attr.aria-labelledby]="'tab-' + tab.id"
        [class.panel--active]="selectedId() === tab.id"
      >
        @if (selectedId() === tab.id) {
          <ng-content [select]="'[slot=' + tab.id + ']'" />
        }
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    nav { display: flex; border-bottom: 1px solid var(--color-border); }
    button[role=tab] { /* base styles; project overrides via CSS variables */ }
    .tab--selected { border-bottom: 2px solid var(--color-primary); }
    .panel--active { display: block; }
    section[role=tabpanel]:not(.panel--active) { display: none; }
  `],
})
export class TabsComponent {
  readonly tabs = input.required<readonly Tab[]>();
  private readonly _selectedId = signal<string | undefined>(undefined);
  readonly selectedId = computed(() => this._selectedId() ?? this.tabs()[0]?.id);
  readonly select = (id: string): void => this._selectedId.set(id);
}
```

No library, no CDK, no Material, just the platform.

## Anti-patterns

```typescript
// Anti-pattern 1: Adding @angular/material for a single component
// The surface area — bundle size, theming, CDK — is disproportionate to the need.
// Build the one component yourself with the Web Platform.
import { MatButtonModule } from '@angular/material/button'; // 23 KB + CDK + theming

// Anti-pattern 2: Using Angular animations for CSS-achievable effects
// @angular/animations is a JavaScript animation runtime. CSS transitions are cheaper,
// simpler, and hardware-accelerated. Use the runtime only when the Web Platform
// genuinely cannot model the animation.
animations: [trigger('slide', [...])]
// Fix: [class.slide-in]="condition" + CSS transition

// Anti-pattern 3: Overriding Material internals with ::ng-deep
// When you override Material's internal selectors, you are depending on its DOM
// structure, which changes without notice between minor versions.
::ng-deep .mat-mdc-dialog-container { padding: 0; }
// Fix: either stay within Material's theming API, or remove Material and build your own.

// Anti-pattern 4: provideAnimations() in a project that doesn't use @angular/animations
// This adds the animation runtime to the bundle even if no animation trigger is used.
bootstrapApplication(AppComponent, {
  providers: [provideAnimations()], // unnecessary if no trigger() is in the app
});
```

## See also

- [ARIA on the real element](/principles/web-components/aria-on-the-real-element) — the
  accessibility approach behind the headless component pattern used here.
- [Minimalism and schematic design](/principles/design-ux/minimalism-no-emoji-schematic) — the
  design philosophy that goes with building lean, token-driven components.
