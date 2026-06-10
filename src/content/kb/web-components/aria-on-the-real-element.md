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

Web components introduce a structural illusion: the custom element wraps the real
interactive content, so it looks like a reasonable place to put `role` and `aria-*`
attributes. It is not. A roleless wrapper element that receives ARIA attributes hands
the accessibility tree a lie: the element the screen reader announces is not the element
that receives focus and keyboard events.

The second, unrelated mistake that commonly appears in the same codebase: naming a
public method `open()` when the component has a `@property({ reflect: true }) open`
field. In JavaScript a method and a property share the same name slot on the prototype.
The method silently shadows the reflected attribute, `this.open = true` stops working
from the outside, and the bug is invisible until someone writes a test that drives the
component through its attribute.

Both were encountered and resolved in the headless web-component library (2026-06-06).

## Why this matters

**Accessibility.** The accessible name computation for an interactive element looks at
the element that has `role="button"` (or the native `<button>`) and resolves
`aria-label`, `aria-labelledby`, or its text content against that element. When you put
`aria-label="Open menu"` on a `<div>` wrapper that has no role, the label is attached
to an element that the accessibility tree does not expose as interactive. The `<button>`
inside still has its own, unlabelled interactive node. The result is two nodes: one with
a label but no role, one with a role but no label.

Screen readers handle this inconsistently. VoiceOver on macOS often reads the wrapper
text and then re-reads the button as an unlabelled control. NVDA on Windows may skip the
wrapper entirely. Neither is correct and neither is predictable. The only safe rule is
**ARIA goes on the element that receives focus**.

**Reflected attribute shadowing.** A `LitElement` property decorated with
`@property({ reflect: true })` is stored on the element instance. A method with the same
name is on the prototype. When JavaScript resolves a property access, own properties
(instance) win over prototype properties. So `element.open` returns the boolean
value — fine — but assigning `element.open = true` calls the Lit property setter because
it is defined via `Object.defineProperty` on the prototype chain. If you then add a
method `open()` to the class body, the compiler emits it on the prototype, and depending
on the TypeScript target and decorator transform, the method may overwrite the property
descriptor. The symptom is that `element.open = true` no longer triggers `requestUpdate`
and the component appears frozen.

The fix is naming: the method that transitions to the open state is `openMenu()`, the
method that transitions to the closed state is `closeMenu()`, and the convenience
wrapper is `toggle()`. The reflected attribute `open` is the observable state; the
methods are imperative commands.

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

The popup gets `role="menu"` in the shadow template, and each item is expected to have
`role="menuitem"`. The component documents this contract but does not enforce it
forcibly — the caller owns the slotted content and its roles.

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

The `aria-label-test-locator-hygiene` article covers using ARIA attributes as stable
test locators — the same labels that serve accessibility serve the test suite, which is
why getting them right on the correct element pays double.

## See also

The `aria-expanded` sync in `hostUpdated` is a lifecycle delegate of the controller
described in [A Lit element is a thin shell over a pure core](/kb/web-components/lit-functional-core).
The interaction between reflected properties and TypeScript's decorator transforms is
covered in [Lit legacy decorators — never the accessor keyword](/kb/web-components/lit-legacy-decorators-no-accessor).
