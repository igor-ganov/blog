---
title: 'Un elemento Lit è un guscio sottile sopra un nucleo puro'
category: web-components
summary: 'Tieni la classe del componente al minimo — proprietà reattive, riferimenti query, un solo controller, deleghe del ciclo di vita su una riga — e sposta tutto il comportamento in funzioni libere e pure che Vitest può testare isolate.'
principle: 'Tieni la classe del componente al minimo — proprietà reattive, riferimenti query, un singolo controller e deleghe del ciclo di vita su una riga; il comportamento reale vive in funzioni libere e pure, testate isolate.'
severity: strong
tags: [lit, web-components, functional-programming, testing, vitest, playwright]
sources:
  - project: 'una libreria di web component headless'
    date: 2026-06-06
    note: 'Lit 3 + Vite; Vitest con happy-dom per il src/core puro; Playwright E2E contro la demo Vite.'
  - project: 'uno standard ingegneristico'
    date: 2026-06-07
    note: 'guscio ≤50 righe; comportamento in funzioni libere che ricevono l''host.'
related:
  - web-components/measured-geometry-not-hardcoded
  - web-components/lit-legacy-decorators-no-accessor
  - functional-architecture/one-function-per-file-folder-by-usage
order: 1
updated: 2026-06-10
---

Un `LitElement` di Lit è una classe, e le classi si gonfiano. Se lo lasci correre, un
custom element finisce per contenere shadow DOM, motore di posizionamento, scheduler di
animazioni, gestione ARIA, gestione della tastiera e metodi dell'API esterna tutti in un
unico file. Niente di quella logica è testabile senza un browser reale, e niente è
riutilizzabile fuori da questo singolo elemento.

La disciplina che lo evita è nata dalla libreria di web component headless
(2026-06-06). Tratta la classe dell'elemento come un **guscio sottile**: un posto dove
dichiarare le proprietà reattive, tenere i riferimenti `@query` e un controller, e
delegare le chiamate del ciclo di vita. Metti ogni decisione reale in funzioni libere e
pure che vivono in `src/element/*.ts`. Vitest gira contro quelle funzioni con
`happy-dom`, mentre Playwright esegue l'E2E contro la demo Vite vera. I due livelli di
test non si sovrappongono mai.

## Perché conta

Il costo di una classe-componente grassa resta invisibile finché non provi a testarla.
I decoratori `@property()` e `@state()` di Lit legano i valori a `requestUpdate`, che ha
bisogno dell'intera macchineria dei custom element, che ha bisogno di un browser. Una
suite Vitest che importa un elemento grasso deve montarlo (`fixture()` o `render()`),
aspettare gli aggiornamenti e poi fare l'assert. Ogni test si porta dietro quell'onere.
Con 30 test il ciclo di mount/unmount domina il tempo di esecuzione, e un fallimento
segnala il cablaggio del componente invece della logica che volevi verificare.

Funzioni libere e pure come `openMenu(host, event)`, `computeGeometry(trigger, menu)` e
`trapFocus(container)` sono sincrone o restituiscono valori semplici. Vitest le importa,
le chiama e fa l'assert sul valore di ritorno. Niente DOM, niente registry dei custom
element, niente ciclo di vita asincrono. La suite del componente gira in poche centinaia
di millisecondi e punta esattamente alla funzione che ha fallito.

Il riutilizzo è il secondo vantaggio. `computeGeometry` è testabile con qualunque coppia
di oggetti a forma di `DOMRect`, quindi se l'algoritmo della geometria deve spostarsi su
un altro componente, si porta dietro zero dipendenze da Lit.

## Come applicarlo

Una volta che conosci il confine, la separazione è meccanica. La classe contiene:

- le dichiarazioni `@property()` / `@state()`
- i riferimenti `@query` ai nodi dello shadow DOM che non possono esistere fuori da un elemento montato
- un singolo controller `_ctl` che guida il ciclo di vita del componente
- metodi del ciclo di vita su una riga che delegano al controller o alle funzioni libere

Tutto il resto è una funzione libera in `src/element/`.

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

Il controller ha la logica reale, ma si limita a orchestrare funzioni libere:

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

Il nucleo puro — `src/core/geometry.ts`, `src/core/focus.ts`, `src/core/dom.ts` — non
ha alcun import da Lit. Vitest lo testa direttamente:

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

Playwright copre l'elemento montato end-to-end: il clic sul trigger, l'assert che il
popup si apra, il controllo del focus trap e della chiusura da tastiera. Non testa mai
l'aritmetica della geometria o la logica del focus isolate, perché Vitest le copre già
senza un browser.

## Anti-pattern

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

Il sintomo è che la copertura degli unit test crolla a zero. `getBoundingClientRect()`
restituisce sempre zeri in jsdom, quindi ogni assert sulla geometria o viene saltato o
verifica inutilmente `0 === 0`. Playwright diventa l'unica rete di sicurezza, e dato che
gira contro un browser il feedback è lento. Una regressione nella geometria passa così
inosservata fino alla CI.

```ts
// ❌ Multiple controllers: the element has grown a FocusController, a
//    GeometryController, an AnimationController, and a KeyboardController.
//    They share no agreed call order and each one monkey-patches the host.
private readonly _focusCtl  = new FocusController(this);
private readonly _geoCtl    = new GeometryController(this);
private readonly _animCtl   = new AnimationController(this);
private readonly _keyCtl    = new KeyboardController(this);
```

I controller che si compongono in un unico coordinatore vanno dentro un solo controller,
con ogni preoccupazione separata espressa come una funzione libera che esso chiama.

## Come imporlo

Conta le righe della classe dell'elemento in CI. Un guscio cresciuto oltre le 60 righe,
spazi bianchi inclusi, è un segnale per la review che la logica sta tornando a infiltrarsi.
La suite Vitest aggiunge sopra un controllo meccanico: se la copertura di `src/core/**`
scende sotto una soglia, qualcosa che dovrebbe essere una funzione libera si sta
nascondendo dentro la classe.

La separazione si abbina anche alla regola [one-function-per-file-folder-by-usage](/kb/functional-architecture/one-function-per-file-folder-by-usage).
Ogni funzione libera in `src/core/` vive nel suo file, col nome di ciò che fa, così il
grafo degli import resta navigabile e il file di test sta accanto al file sorgente.

## Vedi anche

Le funzioni di geometria testate qui isolate dipendono da valori `DOMRect` misurati, non
da dimensioni hardcoded. Quel vincolo è trattato in
[calcola la geometria da dimensioni misurate](/kb/web-components/measured-geometry-not-hardcoded).
La configurazione dei decoratori che mantiene `@property()` e `@state()` funzionanti
correttamente con la separazione dei campi della classe è trattata in
[decoratori legacy di Lit, mai la parola chiave accessor](/kb/web-components/lit-legacy-decorators-no-accessor).
