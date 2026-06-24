---
title: 'Calcola la geometria dalle dimensioni misurate, mai valori fissi'
category: web-components
summary: 'Posizione e dimensioni dai rect misurati degli elementi, così il componente resta indipendente dal contenuto; proteggi le misurazioni vicino ai bordi del viewport perché lo shrink-to-fit del fixed-position non le corrompa.'
principle: 'Posizione e dimensioni dai rect misurati degli elementi, così il componente resta indipendente dal contenuto; proteggi la misurazione vicino ai bordi del viewport.'
severity: strong
tags: [lit, web-components, geometry, positioning, css, accessibility]
sources:
  - project: 'una libreria di web-component headless'
    date: 2026-06-06
    note: 'Geometria dalle dimensioni misurate; wrapper max-content vicino al bordo; aggancio agli angoli e posizionamento del popup consapevole dei bordi.'
related:
  - web-components/lit-functional-core
order: 2
updated: 2026-06-10
---

I valori in pixel scritti a mano dentro un algoritmo di posizionamento danno per scontato
che il contenuto non cambi mai, e quel presupposto salta. Un FAB (floating
action button) codificato come "largo 48 px" resta corretto finché qualcuno non sostituisce
l'icona, aggiunge una label, o l'utente alza la dimensione del font di sistema. Dopodiché il
menu si sovrappone al suo trigger oppure lascia uno spazio vuoto, e per sistemarlo serve un
cambio al codice invece di un cambio allo stile.

Il contratto quindi è semplice: **ogni coordinata deriva da una chiamata viva a
`getBoundingClientRect()`, mai da una costante**. La libreria di web-component headless
(2026-06-06) codifica questo nel suo codice di posizionamento e aggiunge un vincolo che la
maggior parte dei componenti si lascia sfuggire. Qualsiasi wrapper che intendi misurare deve
dichiarare `width: max-content; height: max-content` prima della misurazione, altrimenti il
comportamento shrink-to-fit di `position: fixed` lo collassa a zero e ottieni una geometria
spazzatura.

## Perché conta

La modalità di guasto è subdola. Un elemento `position: fixed` la cui dimensione non è stata
vincolata esplicitamente collassa per adattarsi al contenuto quando viene disegnato la prima
volta. Se lo misuri prima che il browser abbia impaginato quel contenuto (è quello che accade
quando chiami `getBoundingClientRect()` durante `connectedCallback` o all'inizio di
`hostUpdated`), il rect riportato torna con larghezza e altezza pari a zero. L'algoritmo di
posizionamento piazza allora il popup a coordinate che sarebbero corrette per un elemento di
dimensione zero e sbagliate per quello reale. Lo noti solo vicino ai bordi del viewport, dove
scatta l'euristica del flip, perciò passa indenne attraverso i test normali e salta fuori in
produzione, vicino agli angoli.

La correzione nella libreria di componenti è stata impostare `width: max-content;
height: max-content` sul wrapper del popup negli shadow style del componente, prima di
misurare. Questo costringe il browser a dimensionare il popup sul suo contenuto per primo,
così il rect è affidabile ovunque il componente si trovi nella pagina.

C'è una seconda cosa da misurare: il trigger, non solo il popup. Memorizzare la dimensione del
trigger al momento del mount diventa obsoleta nell'istante in cui cambia il contenuto slottato,
che appaia una label, si scambi un'icona o cambi una dimensione di font responsive. Rimisura
entrambi i rect a ogni apertura.

## Come applicarlo

Dichiara il dimensionamento `max-content` sul wrapper che misurerai, chiama
`getBoundingClientRect()` sia sul trigger sia sul popup dopo l'apertura, poi passa quei rect a
una funzione pura che gestisce l'aggancio ai bordi.

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

Dopo che Lit ha renderizzato lo stato aperto, misura e posiziona:

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

La funzione di geometria pura gestisce l'aggancio ai bordi senza sapere nulla del DOM:

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

Poiché `computeGeometry` dipende solo da due valori di forma `DOMRect` e dalle dimensioni del
viewport, Vitest può testare ogni caso limite senza un browser, costruendo rect sintetici e
sovrascrivendo `window.innerWidth` / `window.innerHeight`:

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

Ogni test gira in meno di un millisecondo, senza montare nulla nel DOM.

## Anti-pattern

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

## Vedi anche

I test di geometria qui sopra funzionano solo perché `computeGeometry` è una funzione libera
e pura, tenuta fuori dalla classe dell'elemento. Quell'organizzazione è descritta in
[Un elemento Lit è un guscio sottile su un nucleo puro](/principles/web-components/lit-functional-core).
