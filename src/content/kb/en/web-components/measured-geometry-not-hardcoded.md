---
title: 'Compute geometry from measured sizes, never hardcode'
category: web-components
summary: 'Position and size from measured element rects so the component is content-independent; guard measurements near viewport edges to prevent fixed-position shrink-to-fit from corrupting them.'
principle: 'Position and size from measured element rects so the component is content-independent; guard measurement near viewport edges.'
severity: strong
tags: [lit, web-components, geometry, positioning, css, accessibility]
sources:
  - project: 'a headless web-component library'
    date: 2026-06-06
    note: 'Geometry from measured sizes; max-content wrappers near edge; corner-snapping and edge-aware popup placement.'
related:
  - web-components/lit-functional-core
order: 2
updated: 2026-06-10
---

Hardcoded pixel values in a positioning algorithm are a bet that the content never
changes, and that bet loses. A FAB (floating action button) coded as "48 px wide"
stays correct until someone swaps the icon, adds a label, or the user bumps their
system font size. After that the menu overlaps its trigger or leaves a gap, and fixing
it means a code change instead of a style change.

So the contract is simple: **every coordinate is derived from a live
`getBoundingClientRect()` call, never from a constant**. The headless web-component
library (2026-06-06) encodes this in its positioning code and adds one constraint that
most components miss. Any wrapper you intend to measure must declare
`width: max-content; height: max-content` before the measurement, otherwise
`position: fixed` shrink-to-fit behaviour collapses it to zero and you get garbage
geometry.

## Why this matters

The failure mode is subtle. A `position: fixed` element whose size has not been
explicitly constrained collapses to fit its content when first painted. If you measure
it before the browser has laid out that content (which is what happens when you call
`getBoundingClientRect()` during `connectedCallback` or early in `hostUpdated`), the
reported rect comes back with zero width and height. The positioning algorithm then
places the popup at coordinates that would be correct for a zero-size element and wrong
for the real one. You only see it near viewport edges where the flip heuristic kicks in,
so it slips through normal testing and shows up in production, near corners.

The fix in the component library was to set `width: max-content; height: max-content` on
the popup wrapper in the component's shadow styles before measuring. That forces the
browser to size the popup to its content first, so the rect is reliable wherever on the
page the component sits.

There is a second thing to measure: the trigger, not only the popup. Storing the trigger
size at mount time goes stale the moment the slotted content changes, whether a label
appears, an icon swaps, or a responsive font size shifts. Re-measure both rects on every
open.

## How to apply

Declare `max-content` sizing on the wrapper you will measure, call
`getBoundingClientRect()` on both the trigger and the popup after open, then feed those
rects into a pure function that handles edge-snapping.

```ts
// src/element/floating-menu-element.ts (shadow styles)
static override styles = css`
  :host {
    display: inline-block;
    position: relative;
  }

  .menu-popup {
    position: fixed;
    /* max-content prevents shrink-to-fit before measurement */
    width: max-content;
    height: max-content;
    /* hidden until positioned; visibility not display so the rect is non-zero */
    visibility: hidden;
    pointer-events: none;
  }

  .menu-popup.placed {
    visibility: visible;
    pointer-events: auto;
  }
`;
```

After Lit has rendered the open state, measure and place:

```ts
// src/element/floating-menu-controller.ts
private _position(): void {
  const popup = this.host.shadowRoot?.querySelector<HTMLElement>('.menu-popup');
  const trigger = this.host.querySelector('[slot="trigger"]');
  if (!popup || !trigger) return;

  // Remove 'placed' so visibility is hidden during measurement,
  // ensuring the popup is in the layout without being shown.
  popup.classList.remove('placed');

  const triggerRect = trigger.getBoundingClientRect();
  const popupRect   = popup.getBoundingClientRect();   // reliable: max-content sized

  const geo = computeGeometry(triggerRect, popupRect, this.host.placement);
  applyGeometry(popup, geo);

  popup.classList.add('placed');
}
```

The pure geometry function handles edge snapping without knowing anything about the DOM:

```ts
// src/core/geometry.ts
export interface Geometry {
  readonly top: number;
  readonly left: number;
}

const VIEWPORT_MARGIN = 8; // px to stay clear of the viewport edge

export const computeGeometry = (
  trigger: DOMRect,
  popup: DOMRect,
  placement: 'top' | 'bottom' | 'auto',
): Geometry => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceBelow = vh - trigger.bottom;
  const spaceAbove = trigger.top;

  const placeBelow =
    placement === 'bottom' ||
    (placement === 'auto' && spaceBelow >= popup.height + VIEWPORT_MARGIN) ||
    spaceAbove < popup.height + VIEWPORT_MARGIN;

  const rawTop  = placeBelow ? trigger.bottom : trigger.top - popup.height;
  const rawLeft = trigger.left;

  // Edge-snap: keep the popup inside the viewport with a margin.
  const top  = Math.max(VIEWPORT_MARGIN, Math.min(rawTop,  vh - popup.height - VIEWPORT_MARGIN));
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rawLeft, vw - popup.width  - VIEWPORT_MARGIN));

  return { top, left };
};

// src/core/dom.ts
export const applyGeometry = (el: HTMLElement, geo: Geometry): void => {
  el.style.top  = `${geo.top}px`;
  el.style.left = `${geo.left}px`;
};
```

Because `computeGeometry` depends only on two `DOMRect`-shaped values and the viewport
dimensions, Vitest can test every edge case without a browser by constructing synthetic
rects and overriding `window.innerWidth` / `window.innerHeight`:

```ts
// src/core/geometry.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeGeometry } from './geometry.js';

const rect = (x: number, y: number, w: number, h: number): DOMRect =>
  ({ x, y, left: x, top: y, width: w, height: h,
     right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;

afterEach(() => vi.restoreAllMocks());

const mockViewport = (w: number, h: number): void => {
  vi.spyOn(window, 'innerWidth',  'get').mockReturnValue(w);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(h);
};

describe('computeGeometry', () => {
  it('places the menu below when there is space', () => {
    mockViewport(1024, 768);
    const geo = computeGeometry(rect(100, 200, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.top).toBe(240);  // trigger.bottom
    expect(geo.left).toBe(100);
  });

  it('flips above when insufficient space below', () => {
    mockViewport(1024, 600);
    // trigger.bottom = 560, spaceBelow = 40, popup.height = 80 → flip
    const geo = computeGeometry(rect(100, 520, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.top).toBe(440);  // trigger.top - popup.height
  });

  it('clamps to viewport left edge', () => {
    mockViewport(1024, 768);
    // trigger at x=4 → rawLeft=4, clamp to margin=8
    const geo = computeGeometry(rect(4, 100, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.left).toBe(8);
  });

  it('clamps to viewport right edge', () => {
    mockViewport(200, 768);
    // trigger at x=100, popup.width=120 → rawLeft=100, max=200-120-8=72
    const geo = computeGeometry(rect(100, 100, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.left).toBe(72);
  });
});
```

Each test runs in under one millisecond with no DOM mounting.

## Anti-patterns

```ts
// ❌ Hardcoded FAB size. When the icon changes from 24px to 32px or the
//    label "More" is added, all placement math is wrong.
const FAB_SIZE = 48;
const top = buttonTop + FAB_SIZE + 8;
const left = buttonLeft;
applyGeometry(popup, { top, left });
```

```ts
// ❌ Measuring a fixed-position element before declaring its intrinsic size.
//    getBoundingClientRect() may return { width: 0, height: 0 } during the
//    first render pass, causing the popup to land at the wrong coordinates.
const popupRect = popup.getBoundingClientRect(); // possibly zeros
const geo = computeGeometry(triggerRect, popupRect, 'auto');
// → popup placed as if it has no size → wrong near edges
```

```ts
// ❌ Storing the trigger size at mount time and reusing it on open.
//    Slotted content can change between mount and open; stale measurements
//    cause misalignment whenever the trigger is dynamically resized.
override connectedCallback(): void {
  super.connectedCallback();
  this._cachedTriggerRect = this.querySelector('[slot="trigger"]')
    ?.getBoundingClientRect();
}

openMenu(): void {
  this.open = true;
  // uses this._cachedTriggerRect — stale if trigger content changed
}
```

## See also

The geometry tests above only work because `computeGeometry` is a pure free function
kept out of the element class. That organisation is described in
[A Lit element is a thin shell over a pure core](/kb/web-components/lit-functional-core).
