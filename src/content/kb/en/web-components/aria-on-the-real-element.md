---
title: 'ARIA on the real interactive element, not the wrapper'
category: web-components
summary: 'Put ARIA on the slotted or real button element, not a roleless wrapper div; and name public methods for what they do because reflected attributes like `open` must not be shadowed by a method of the same name.'
principle: 'Put ARIA on the slotted/real button, not a roleless wrapper; name methods for what they do because attributes like `open` are reflected.'
severity: strong
tags: [lit, web-components, accessibility, aria, reflected-attributes, api-design]
sources:
  - project: 'a headless web-component library'
    date: 2026-06-06
    note: 'ARIA on slotted button; openMenu/closeMenu because open is a reflected attribute.'
related:
  - web-components/lit-functional-core
  - testing/aria-label-test-locator-hygiene
order: 3
updated: 2026-06-10
---

A web component wraps the real interactive content, so the custom element looks like a
reasonable place to hang `role` and `aria-*` attributes. Don't. A roleless wrapper that
carries ARIA misleads the accessibility tree, because the element the screen reader
announces is not the one that receives focus and keyboard events.

A separate mistake shows up in the same codebases: naming a public method `open()` when
the component already has a `@property({ reflect: true }) open` field. In JavaScript a
method and a property compete for the same name slot on the prototype. The method shadows
the reflected attribute, `this.open = true` stops working from the outside, and the bug
stays invisible until someone writes a test that drives the component through its
attribute.

Both showed up in the headless web-component library (2026-06-06) and were fixed there.

## Why this matters

**Accessibility.** Accessible-name computation for an interactive element looks at the
element that carries `role="button"` (or the native `<button>`) and resolves
`aria-label`, `aria-labelledby`, or text content against that element. Put
`aria-label="Open menu"` on a roleless `<div>` wrapper and the label attaches to
something the accessibility tree never exposes as interactive, while the `<button>` inside
keeps its own unlabelled interactive node. You end up with two nodes: the wrapper carries
the label but no role, and the button carries the role but no label.

Screen readers cope with this inconsistently. VoiceOver on macOS often reads the wrapper
text and then re-reads the button as an unlabelled control; NVDA on Windows may skip the
wrapper entirely. The safe rule is to put **ARIA on the element that receives focus**.

**Reflected attribute shadowing.** A `LitElement` property decorated with
`@property({ reflect: true })` lives on the element instance, while a method of the same
name lives on the prototype. On a read, own (instance) properties win over prototype ones,
so `element.open` returns the boolean. Assigning `element.open = true` runs the Lit
property setter, which Lit installs via `Object.defineProperty` on the prototype chain.
Add a method `open()` to the class body and the compiler emits it on the prototype; under
some TypeScript targets and decorator transforms that method overwrites the property
descriptor. Now `element.open = true` no longer triggers `requestUpdate`, and the
component looks frozen.

The fix is naming. The method that transitions to the open state is `openMenu()`, the one
that transitions to closed is `closeMenu()`, and the convenience wrapper is `toggle()`.
That keeps the reflected attribute `open` as the observable state and the methods as
imperative commands.

## How to apply

**ARIA on the real button.** Slot the trigger and add ARIA to the slotted element at the
call site, or forward ARIA via `aria-controls` / `aria-expanded` on the trigger element
inside the component.

```html
<!-- ✅ At the call site: ARIA on the real button inside the slot -->
<floating-menu>
  <button slot="trigger" aria-label="Open actions menu" aria-haspopup="true">
    <svg aria-hidden="true"><!-- icon --></svg>
  </button>
  <menu-item>Edit</menu-item>
  <menu-item>Delete</menu-item>
</floating-menu>
```

The component itself keeps `aria-expanded` in sync with the `open` state by reflecting
it onto the slotted trigger:

```ts
// src/element/floating-menu-controller.ts
private _syncAriaExpanded(): void {
  const trigger = this.host.querySelector<HTMLElement>('[slot="trigger"]');
  if (trigger) {
    trigger.setAttribute('aria-expanded', String(this.host.open));
  }
}

// Called from hostUpdated() after every render cycle:
hostUpdated(): void {
  this._syncAriaExpanded();
  if (this.host.open) this._position();
}
```

The popup gets `role="menu"` in the shadow template, and each item is expected to carry
`role="menuitem"`. The component documents this contract but does not force it, since the
caller owns the slotted content and its roles.

**Naming to avoid attribute shadowing.** The public API uses verb phrases, not attribute
mirrors:

```ts
// src/element/floating-menu-element.ts

// ✅ Reflected attribute — the observable boolean state on the element.
@property({ type: Boolean, reflect: true }) open = false;

// ✅ Named methods that do not shadow the attribute.
openMenu(): void  { this._ctl.open(); }
closeMenu(): void { this._ctl.close(); }
toggle(): void    { this._ctl.toggle(); }
```

```ts
// Usage from outside:
const menu = document.querySelector('floating-menu');

// ✅ Read the reflected attribute — works correctly.
console.log(menu.open); // false

// ✅ Transition via a named method.
menu.openMenu();
console.log(menu.open); // true

// ✅ Or set the attribute directly (Lit's property setter fires requestUpdate).
menu.open = false;
```

A test that covers both paths:

```ts
// e2e/floating-menu.spec.ts (Playwright)
test('opens via openMenu() and reflects the attribute', async ({ page }) => {
  await page.goto('/demo');

  const menu = page.locator('floating-menu');
  await expect(menu).not.toHaveAttribute('open');

  await menu.evaluate((el: HTMLElement & { openMenu(): void }) => el.openMenu());
  await expect(menu).toHaveAttribute('open', '');
});

test('trigger button has aria-expanded synced to open state', async ({ page }) => {
  await page.goto('/demo');

  const trigger = page.locator('floating-menu [slot="trigger"]');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await page.locator('floating-menu').evaluate(
    (el: HTMLElement & { openMenu(): void }) => el.openMenu(),
  );
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});
```

## Anti-patterns

```html
<!-- ❌ ARIA on the custom element wrapper — no role, so the label floats
         disconnected from any interactive context. -->
<floating-menu aria-label="Actions menu">
  <button slot="trigger">
    <svg aria-hidden="true"><!-- icon --></svg>
  </button>
</floating-menu>
```

```ts
// ❌ Method named `open()` shadows the reflected `open` property.
//    After this declaration, `element.open = true` may stop triggering
//    reactivity depending on how the decorator transform resolves.
@customElement('floating-menu')
export class FloatingMenuElement extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;

  // This method name collides with the `open` property.
  open(): void {   // TypeScript will actually error here, but JS won't.
    this.open = true;
  }
}
```

```ts
// ❌ aria-expanded placed on the popup instead of the trigger.
//    Screen readers expect `aria-expanded` on the control that activates the
//    popup (the trigger), not on the popup itself.
hostUpdated(): void {
  const popup = this.host.shadowRoot?.querySelector('.menu-popup');
  popup?.setAttribute('aria-expanded', String(this.host.open)); // wrong element
}
```

## Enforcement

Accessibility violations are best caught with `axe-core` wired into the Playwright
suite. The Deque `@axe-core/playwright` package can assert zero violations against the
demo page in every browser:

```ts
// e2e/accessibility.spec.ts
import AxeBuilder from '@axe-core/playwright';

test('no axe violations on the demo page', async ({ page }) => {
  await page.goto('/demo');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toHaveLength(0);
});
```

The `aria-label-test-locator-hygiene` article covers using ARIA attributes as stable test
locators. The same labels that serve accessibility also serve the test suite, so it is
worth getting them onto the correct element.

## See also

The `aria-expanded` sync in `hostUpdated` is a lifecycle delegate of the controller
described in [A Lit element is a thin shell over a pure core](/principles/web-components/lit-functional-core).
The interaction between reflected properties and TypeScript's decorator transforms is
covered in [Lit legacy decorators — never the accessor keyword](/principles/web-components/lit-legacy-decorators-no-accessor).
