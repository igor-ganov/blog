---
title: 'Decoratori legacy in Lit — mai la parola chiave accessor'
category: web-components
summary: 'Configura experimentalDecorators e useDefineForClassFields:false; usa @property()/@state() su campi privati semplici; non usare mai la parola chiave accessor dei decoratori standard — esbuild e Vite non la trasformano e va in errore a runtime.'
principle: 'Configura experimentalDecorators + useDefineForClassFields:false e usa @property()/@state() su campi privati semplici; non usare mai la parola chiave `accessor` dei decoratori standard — esbuild/Vite non la trasformano e va in errore a runtime.'
severity: strong
tags: [lit, web-components, typescript, decorators, vite, esbuild, configuration]
sources:
  - project: 'una libreria di web component headless'
    date: 2026-06-06
    note: 'esbuild non trasforma i decoratori accessor standard; quel percorso va in errore a runtime.'
  - project: 'un client per Jira'
    date: 2026-06-08
    note: 'Servono i decoratori legacy: experimentalDecorators + useDefineForClassFields:false; mai accessor; @property/@state sui campi privati.'
related:
  - web-components/no-ssr-custom-elements-on-edge
  - typescript/prefer-inference-and-import-type
order: 4
updated: 2026-06-10
---

TypeScript ha due sistemi di decoratori. Quello legacy (attivato da
`"experimentalDecorators": true`) è l'unico che Lit supporta pienamente da Lit 2.
Il sistema standard (TC39 Stage 3) usa la parola chiave `accessor` e i campi di classe
auto-accessor. Lit 3 ha aggiunto un supporto parziale ai decoratori standard, ma esbuild,
il transformer dietro la build di produzione di Vite, non trasforma gli auto-accessor standard.
Ti ritrovi quindi con un componente che funziona in `vite dev` (dove esbuild trasforma in modo
meno aggressivo) e poi muore a runtime nella build di produzione con un criptico
`TypeError` su un descrittore di accessor.

Sia la libreria di web component headless (2026-06-06) sia il client per Jira (2026-06-08) ci sono cascati.
La soluzione ha sempre la stessa forma: usa i decoratori legacy ovunque entri in gioco Lit, e non scrivere mai
la parola chiave `accessor`.

## Perché conta

La proposta di decoratori standard di TC39 introduce i campi auto-accessor:

```ts
class Example {
  accessor value = 0; // standard decorator syntax
}
```

Babel e il compilatore TypeScript sanno trasformarlo. esbuild no, a metà 2026.
Quando Vite gira in modalità produzione usa esbuild per la minificazione e la
trasformazione finale. Un campo auto-accessor che attraversa esbuild senza essere trasformato viene emesso
così com'è, e il motore del browser riceve poi una classe con una sintassi che potrebbe supportare oppure no.
Chromium scarta il campo in silenzio; altri motori o contesti rigorosi sollevano un'eccezione. In
entrambi i casi il decoratore `@property()` di Lit non intercetta mai il campo e `requestUpdate`
non viene mai chiamato.

La trappola sta nei tempi. Il bug resta nascosto in `vite dev` perché Vite usa esbuild
per il bundling delle dipendenze ma fa passare il tuo codice attraverso la sua pipeline di trasformazione nativa,
che gestisce i decoratori standard. `vite build` segue un percorso diverso. Pubblichi, si
rompe, e il messaggio d'errore (ammesso che ne arrivi uno) non dice nulla sui decoratori.

La seconda metà della regola è `"useDefineForClassFields": false`. La semantica dei campi
di classe in TypeScript è cambiata tra TS 3.7 e TS 4+ per allinearsi alla spec TC39, quindi i campi di classe
ora vengono definiti via `Object.defineProperty` invece che per assegnazione. Il sistema di decoratori legacy
di Lit conta sulla semantica per assegnazione per intercettare la dichiarazione del campo. Con
`useDefineForClassFields: true` (il default di TypeScript quando `target` è `ES2022` o
successivo), la definizione del campo di classe gira dopo il decoratore e sovrascrive il descrittore
impostato da `@property()`, quindi la proprietà reattiva non scatta mai. Impostare
`useDefineForClassFields: false` ripristina la semantica per assegnazione che Lit si aspetta.

Entrambi i progetti impostano questi due flag insieme nel loro `tsconfig.json`.

## Come applicarlo

**tsconfig.json** — configurazione richiesta per qualsiasi progetto che usa Lit con
`experimentalDecorators`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "strict": true
  }
}
```

Con questa configurazione, `@property()` e `@state()` funzionano su campi privati semplici
senza la parola chiave `accessor`:

```ts
// ✅ Correct: legacy decorator on a plain class field, no accessor keyword.
import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('my-counter')
export class MyCounter extends LitElement {
  @property({ type: Number, reflect: true }) count = 0;
  @state() private _expanded = false;

  protected override render() {
    return html`
      <button @click=${this._increment}>Count: ${this.count}</button>
    `;
  }

  private _increment(): void {
    this.count += 1;
  }
}
```

Il modificatore `private` sui campi `@state()` alimenta solo il controllo di visibilità di TypeScript e
non ha alcun effetto a runtime. Lit accede al campo per nome internamente e lo fa correttamente
a prescindere dal modificatore di accesso. La convenzione leggibile è marcare lo stato interno
come `private` e lasciare pubblici i campi `@property()`.

**Che aspetto ha la parola chiave accessor — e perché evitarla:**

```ts
// ❌ Standard decorator auto-accessor — will fail in a Vite production build.
//    Works in dev, crashes in prod. The error is non-obvious.
@customElement('my-counter')
export class MyCounter extends LitElement {
  @property({ type: Number, reflect: true }) accessor count = 0;
  //                                         ^^^^^^^^ never write this
}
```

La parola chiave `accessor` dice a TypeScript e Babel di generare una coppia getter/setter con
storage di supporto. Il decoratore standard `@property()` di Lit avvolge quel getter/setter per chiamare
`requestUpdate`. Quando esbuild rimuove o gestisce male la trasformazione dell'auto-accessor, la
coppia getter/setter sparisce e la proprietà ricade a campo semplice. A quel punto il
decoratore di Lit non ha più nulla da avvolgere, e la reattività ammutolisce.

**vite.config.ts** — non serve alcun plugin esbuild speciale; i flag di tsconfig sono
sufficienti finché non usi `accessor`:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: {
    // No decorator transform needed — legacy TS decorators are emitted by
    // the TypeScript compiler before esbuild sees the code.
    target: 'es2022',
  },
});
```

Vite invoca prima `tsc` (o la propria trasformazione TS), poi passa l'output a esbuild.
La trasformazione TS abbassa i decoratori legacy a definizioni di proprietà compatibili con ES5, così
esbuild non li incontra mai. Tutta la differenza tra i due percorsi sta qui. La parola chiave standard
`accessor` ha bisogno di una trasformazione che gira dopo l'emit di TS solo se esbuild
la supporta, ed esbuild al momento non la supporta.

## Anti-pattern

```ts
// ❌ accessor keyword — crashes in production build.
@property({ type: String }) accessor label = '';
@state() accessor private _open = false; // TypeScript also rejects this ordering
```

```jsonc
// ❌ Missing useDefineForClassFields: false with experimentalDecorators: true.
//    @property() sets up a descriptor; the class field then redefines the
//    property with Object.defineProperty, overwriting Lit's descriptor.
//    Reactive updates fire once (at initialisation) and never again.
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true
    // useDefineForClassFields defaults to true for ES2022 target — wrong for Lit
  }
}
```

```ts
// ❌ Mixing legacy and standard decorators in the same file. If another
//    library (e.g., a DI framework) requires standard decorators, put it in a
//    separate compilation unit with its own tsconfig.
import { Inject } from 'some-di-lib'; // standard decorator

@customElement('broken-element')
export class BrokenElement extends LitElement {
  @Inject(MyService) private _svc!: MyService; // standard
  @property() label = '';                       // legacy — conflict
}
```

## Come imporlo

Aggiungi uno step di CI che esegue il type-check con `tsc --noEmit`. Intercetta l'uso della parola chiave `accessor`
nei sorgenti del progetto. Funziona anche un hook di pre-commit che cerca la stringa letterale
`accessor ` (con uno spazio finale per evitare di matchare nei commenti):

```bash
# .git/hooks/pre-commit or a Biome custom rule
grep -rn '\baccessor ' src/ && echo "accessor keyword forbidden in Lit components" && exit 1
exit 0
```

La regola `@typescript-eslint/no-accessor-pairs` di Biome o ESLint non copre questo
caso specifico, quindi una regola personalizzata o grep restano oggi il presidio più affidabile.

## Vedi anche

La configurazione di `experimentalDecorators` interagisce con il modo in cui Lit gestisce la proprietà
riflessa `open` descritta in
[ARIA on the real interactive element](/kb/web-components/aria-on-the-real-element) —
entrambe dipendono dal fatto che il descrittore di proprietà sia impostato correttamente. I vincoli del
rendering lato server per i componenti Lit sono trattati in
[Don't SSR custom elements on the edge](/kb/web-components/no-ssr-custom-elements-on-edge).
