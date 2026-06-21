---
title: "L'ARIA sull'elemento interattivo reale, non sul wrapper"
category: web-components
summary: 'Metti l’ARIA sul pulsante reale o slottato, non su un div wrapper senza ruolo; e dai ai metodi pubblici nomi che descrivono cosa fanno, perché un attributo riflesso come `open` non deve essere oscurato da un metodo con lo stesso nome.'
principle: 'Metti l’ARIA sul pulsante reale/slottato, non su un wrapper senza ruolo; dai ai metodi nomi che descrivono cosa fanno, perché attributi come `open` sono riflessi.'
severity: strong
tags: [lit, web-components, accessibility, aria, reflected-attributes, api-design]
sources:
  - project: 'una libreria di web component headless'
    date: 2026-06-06
    note: 'ARIA sul pulsante slottato; openMenu/closeMenu perché open è un attributo riflesso.'
related:
  - web-components/lit-functional-core
  - testing/aria-label-test-locator-hygiene
order: 3
updated: 2026-06-10
---

Un web component avvolge il contenuto interattivo reale, quindi il custom element sembra il
posto giusto su cui appendere `role` e attributi `aria-*`. Non farlo. Un wrapper senza ruolo
che porta l’ARIA inganna l’albero di accessibilità, perché l’elemento annunciato dallo
screen reader non è quello che riceve il focus e gli eventi da tastiera.

Negli stessi codebase compare un errore distinto: chiamare `open()` un metodo pubblico quando
il componente ha già un campo `@property({ reflect: true }) open`. In JavaScript un metodo e
una proprietà competono per lo stesso slot di nome sul prototipo. Il metodo oscura l’attributo
riflesso, `this.open = true` smette di funzionare dall’esterno, e il bug resta invisibile
finché qualcuno non scrive un test che pilota il componente attraverso il suo attributo.

Entrambi sono comparsi nella libreria di web component headless (2026-06-06) e lì sono stati corretti.

## Perché conta

**Accessibilità.** Il calcolo del nome accessibile per un elemento interattivo guarda
l’elemento che porta `role="button"` (o il `<button>` nativo) e risolve `aria-label`,
`aria-labelledby` o il contenuto testuale rispetto a quell’elemento. Metti
`aria-label="Open menu"` su un `<div>` wrapper senza ruolo e l’etichetta si attacca a
qualcosa che l’albero di accessibilità non espone mai come interattivo, mentre il `<button>`
al suo interno mantiene il proprio nodo interattivo senza etichetta. Ti ritrovi con due nodi:
uno con etichetta e senza ruolo, uno con ruolo e senza etichetta.

Gli screen reader gestiscono la cosa in modo incoerente. VoiceOver su macOS spesso legge il
testo del wrapper e poi rilegge il pulsante come controllo senza etichetta; NVDA su Windows
può saltare del tutto il wrapper. La regola sicura è mettere **l’ARIA sull’elemento che
riceve il focus**.

**Oscuramento dell’attributo riflesso.** Una proprietà di `LitElement` decorata con
`@property({ reflect: true })` vive sull’istanza dell’elemento, mentre un metodo con lo stesso
nome vive sul prototipo. In lettura, le proprietà proprie (di istanza) vincono su quelle del
prototipo, quindi `element.open` restituisce il booleano. Assegnare `element.open = true`
esegue il setter della proprietà Lit, che Lit installa tramite `Object.defineProperty` lungo
la catena dei prototipi. Aggiungi un metodo `open()` al corpo della classe e il compilatore lo
emette sul prototipo; con alcuni target TypeScript e alcune trasformazioni dei decoratori quel
metodo sovrascrive il descrittore della proprietà. Ora `element.open = true` non scatena più
`requestUpdate`, e il componente sembra bloccato.

La soluzione è il naming. Il metodo che passa allo stato aperto è `openMenu()`, quello che
passa a chiuso è `closeMenu()`, e il wrapper di comodo è `toggle()`. Così l’attributo riflesso
`open` resta lo stato osservabile e i metodi restano comandi imperativi.

## Come applicarlo

**ARIA sul pulsante reale.** Slotta il trigger e aggiungi l’ARIA sull’elemento slottato nel
punto di chiamata, oppure inoltra l’ARIA tramite `aria-controls` / `aria-expanded`
sull’elemento trigger dentro il componente.

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

Il componente stesso tiene `aria-expanded` allineato allo stato `open` riflettendolo sul
trigger slottato:

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

Il popup riceve `role="menu"` nel template dello shadow, e ci si aspetta che ogni voce porti
`role="menuitem"`. Il componente documenta questo contratto ma non lo impone, dato che il
chiamante è proprietario del contenuto slottato e dei suoi ruoli.

**Naming per evitare l’oscuramento dell’attributo.** L’API pubblica usa frasi con verbo, non
copie dell’attributo:

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

Un test che copre entrambi i percorsi:

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

## Anti-pattern

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

## Come imporlo

Le violazioni di accessibilità si colgono meglio con `axe-core` integrato nella suite
Playwright. Il pacchetto Deque `@axe-core/playwright` può verificare zero violazioni sulla
pagina demo in ogni browser:

```ts
// e2e/accessibility.spec.ts
import AxeBuilder from '@axe-core/playwright';

test('no axe violations on the demo page', async ({ page }) => {
  await page.goto('/demo');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toHaveLength(0);
});
```

L’articolo `aria-label-test-locator-hygiene` tratta l’uso degli attributi ARIA come locator
di test stabili. Le stesse etichette che servono all’accessibilità servono alla suite di test,
quindi portarle sull’elemento corretto rende il doppio.

## Vedi anche

La sincronizzazione di `aria-expanded` in `hostUpdated` è un delegato del ciclo di vita del
controller descritto in [Un elemento Lit è un guscio sottile su un core puro](/kb/web-components/lit-functional-core).
L’interazione tra proprietà riflesse e le trasformazioni dei decoratori di TypeScript è
trattata in [Decoratori legacy di Lit — mai la keyword accessor](/kb/web-components/lit-legacy-decorators-no-accessor).
