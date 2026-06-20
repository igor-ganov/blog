---
title: 'A Lit element is a thin shell over a pure core'
category: web-components
summary: 'Keep the component class minimal — reactive properties, query refs, one controller, one-line lifecycle delegates — and push all behaviour into pure free functions that Vitest can test in isolation.'
principle: 'Keep the component class minimal — reactive properties, query refs, a single controller and one-line lifecycle delegates; all real behaviour lives in pure free functions tested in isolation.'
severity: strong
tags: [lit, web-components, functional-programming, testing, vitest, playwright]
sources:
  - project: 'a headless web-component library'
    date: 2026-06-06
    note: 'Lit 3 + Vite; Vitest happy-dom for pure src/core; Playwright E2E against the Vite demo.'
  - project: 'an engineering standard'
    date: 2026-06-07
    note: '≤50-line shell; behaviour in free functions taking the host.'
related:
  - web-components/measured-geometry-not-hardcoded
  - web-components/lit-legacy-decorators-no-accessor
  - functional-architecture/one-function-per-file-folder-by-usage
order: 1
updated: 2026-06-10
---

A Lit `LitElement` is a class, and classes accumulate. Left unchecked, a custom element
grows a shadow DOM, a positioning engine, an animation scheduler, ARIA bookkeeping,
keyboard handling, and external API methods all in one file. None of that logic is
testable without a real browser, and none of it is reusable outside this one element.

The discipline that prevents this came out of the headless web-component library
(2026-06-06). Treat the element class as a **thin shell**: a place to declare reactive
properties, hold `@query` refs and one controller, and delegate lifecycle calls. Put
every real decision in pure free functions that live in `src/element/*.ts`. Vitest runs
against those functions with `happy-dom`, and Playwright runs the E2E against the real
Vite demo. The two test layers never overlap.

## Why this matters

The cost of a fat component class stays invisible until you try to test it. Lit's
`@property()` and `@state()` tie values to `requestUpdate`, which needs the full custom
element machinery, which needs a browser. A Vitest suite that imports a fat element has
to mount it (`fixture()` or `render()`), wait for updates, and then assert. Every test
carries that overhead. With 30 tests, the mount/unmount cycle dominates the run time,
and a failure reports the component's wiring rather than the logic you wanted to check.

Pure free functions like `openMenu(host, event)`, `computeGeometry(trigger, menu)`, and
`trapFocus(container)` are synchronous or return plain values. Vitest imports them,
calls them, and asserts on the return value. No DOM, no custom element registry, no
async lifecycle. The component suite runs in a few hundred milliseconds and points at
exactly the function that failed.

Reuse is the second payoff. `computeGeometry` is testable with any pair of
`DOMRect`-shaped objects, so if the geometry algorithm has to move to a different
component, it carries zero Lit dependency.

## How to apply

Once you know the boundary, the split is mechanical. The class holds:

- `@property()` / `@state()` declarations
- `@query` refs to shadow DOM nodes that cannot exist outside a mounted element
- a single `_ctl` controller that drives the component's lifecycle
- one-line lifecycle methods that delegate into the controller or into free functions

Everything else is a free function in `src/element/`.

```ts
// src/element/floating-menu-element.ts — the shell (~40 lines)
import { LitElement, html } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { FloatingMenuController } from './floating-menu-controller.js';

@customElement('floating-menu')
export class FloatingMenuElement extends LitElement {
  // ── Reactive props ────────────────────────────────────────────────────────
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: String }) placement: 'top' | 'bottom' | 'auto' = 'auto';

  // ── Query refs ────────────────────────────────────────────────────────────
  @query('.menu-popup') private _popup!: HTMLElement;
  @query('slot[name="trigger"]') private _triggerSlot!: HTMLSlotElement;

  // ── Controller ────────────────────────────────────────────────────────────
  private readonly _ctl = new FloatingMenuController(this);

  // ── Lifecycle delegates ───────────────────────────────────────────────────
  override connectedCallback(): void {
    super.connectedCallback();
    this._ctl.connect();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ctl.disconnect();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  openMenu(): void  { this._ctl.open(); }
  closeMenu(): void { this._ctl.close(); }
  toggle(): void    { this._ctl.toggle(); }

  // ── Render ────────────────────────────────────────────────────────────────
  protected override render() {
    return html`
      <slot name="trigger"></slot>
      <div class="menu-popup" role="menu" ?hidden=${!this.open}>
        <slot></slot>
      </div>
    `;
  }
}
```

The controller has the real logic, but it only orchestrates free functions:

```ts
// src/element/floating-menu-controller.ts
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { FloatingMenuElement } from './floating-menu-element.js';
import { computeGeometry } from '../core/geometry.js';
import { trapFocus, releaseFocus } from '../core/focus.js';
import { applyGeometry } from '../core/dom.js';

export class FloatingMenuController implements ReactiveController {
  constructor(private readonly host: FloatingMenuElement) {
    host.addController(this);
  }

  open(): void {
    this.host.open = true;
    this.host.updateComplete.then(() => this._position());
  }

  close(): void {
    this.host.open = false;
    releaseFocus(this.host);
  }

  toggle(): void { this.host.open ? this.close() : this.open(); }

  connect(): void {
    this.host.addEventListener('keydown', this._onKeydown);
  }

  disconnect(): void {
    this.host.removeEventListener('keydown', this._onKeydown);
    releaseFocus(this.host);
  }

  hostUpdated(): void {
    if (this.host.open) this._position();
  }

  private _position(): void {
    const trigger = this.host.querySelector('[slot="trigger"]');
    const popup   = this.host.shadowRoot?.querySelector('.menu-popup');
    if (!trigger || !popup) return;
    const geo = computeGeometry(
      trigger.getBoundingClientRect(),
      popup.getBoundingClientRect(),
      this.host.placement,
    );
    applyGeometry(popup as HTMLElement, geo);
    trapFocus(popup as HTMLElement);
  }

  private readonly _onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };
}
```

The pure core — `src/core/geometry.ts`, `src/core/focus.ts`, `src/core/dom.ts` — has
no Lit import. Vitest tests it directly:

```ts
// src/core/geometry.test.ts
import { describe, it, expect } from 'vitest';
import { computeGeometry } from './geometry.js';

const rect = (x: number, y: number, w: number, h: number): DOMRect =>
  ({ x, y, width: w, height: h, top: y, right: x + w, bottom: y + h, left: x, toJSON: () => ({}) } as DOMRect);

describe('computeGeometry', () => {
  it('places the menu below the trigger by default', () => {
    const geo = computeGeometry(rect(100, 200, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.top).toBe(240); // trigger.bottom
    expect(geo.left).toBe(100);
  });

  it('flips above when insufficient space below', () => {
    // trigger near the bottom of a 600px viewport
    const geo = computeGeometry(rect(100, 520, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.top).toBe(440); // trigger.top - menu.height
  });
});
```

Playwright covers the mounted element end-to-end: clicking the trigger, asserting the
popup opens, checking the focus trap and keyboard dismiss. It never tests geometry
arithmetic or focus logic in isolation, because Vitest already covers those without a
browser.

## Anti-patterns

```ts
// ❌ Fat element: geometry, focus, and ARIA logic all inside the class.
//    Nothing here is testable without a mounted custom element.
@customElement('floating-menu')
export class FloatingMenuElement extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;

  openMenu(): void {
    this.open = true;
    this.updateComplete.then(() => {
      const popup = this.shadowRoot!.querySelector('.menu-popup')!;
      const trigger = this.querySelector('[slot="trigger"]')!;
      const tr = trigger.getBoundingClientRect();
      const pr = popup.getBoundingClientRect();
      const top = tr.bottom + window.scrollY;
      // ...50 more lines of layout and focus management inline...
      (popup as HTMLElement).style.top = `${top}px`;
    });
  }
}
```

The symptom is that unit test coverage drops to zero. `getBoundingClientRect()` always
returns zeros in jsdom, so every geometry assertion either skips or uselessly asserts
`0 === 0`. Playwright becomes the only safety net, and since it runs against a browser,
feedback is slow. A geometry regression then goes undetected until CI.

```ts
// ❌ Multiple controllers: the element has grown a FocusController, a
//    GeometryController, an AnimationController, and a KeyboardController.
//    They share no agreed call order and each one monkey-patches the host.
private readonly _focusCtl  = new FocusController(this);
private readonly _geoCtl    = new GeometryController(this);
private readonly _animCtl   = new AnimationController(this);
private readonly _keyCtl    = new KeyboardController(this);
```

Controllers that compose into one coordinator belong inside a single controller, with
each separate concern expressed as a free function it calls.

## Enforcement

Count the lines in the element class in CI. A shell that has grown past 60 lines
including whitespace is a review signal that logic is leaking back in. The Vitest suite
adds a mechanical check on top of that: if coverage of `src/core/**` drops below a
threshold, something that should be a free function is hiding inside the class.

The split also pairs with the [one-function-per-file-folder-by-usage](/kb/functional-architecture/one-function-per-file-folder-by-usage)
rule. Each free function in `src/core/` lives in its own file, named for what it does,
so the import graph stays navigable and the test file sits next to the source file.

## See also

The geometry functions tested in isolation here depend on measured `DOMRect` values, not
hardcoded sizes. That constraint is covered in
[compute geometry from measured sizes](/kb/web-components/measured-geometry-not-hardcoded).
The decorator configuration that keeps `@property()` and `@state()` working correctly
with the class-field split is covered in
[Lit legacy decorators, never the accessor keyword](/kb/web-components/lit-legacy-decorators-no-accessor).
