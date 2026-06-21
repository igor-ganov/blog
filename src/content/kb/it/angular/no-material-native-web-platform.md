---
title: 'Niente Material per default; costruisci sulla Web Platform'
category: angular
summary: "Se il progetto non usa già Material Design, non aggiungerlo: costruisci componenti su misura con le API moderne della Web Platform e anima con CSS nativo."
principle: "Se il progetto non usa già Material Design, non aggiungerlo: costruisci componenti su misura con le API moderne della Web Platform; preferisci il CSS nativo alle animazioni di Angular."
severity: context
tags: [angular, material, web-platform, css, animations, components]
sources:
  - project: 'uno standard ingegneristico'
    date: 2026-06-02
    note: 'Niente Material a meno che non sia già usato; Web Platform nativa; CSS nativo, non le animazioni di Angular.'
related:
  - web-components/lit-functional-core
  - design-ux/minimalism-no-emoji-schematic
order: 6
updated: 2026-06-10
---

Angular Material è un intero design system. Porta con sé un linguaggio visivo deciso, token
di theming, una serie di componenti pronti all'uso e una libreria di animazioni proprietaria,
e quella completezza è ciò che paghi. Se un progetto ha scelto Material Design (la sua scala
tipografica, il modello di elevazione, i comportamenti dei componenti), Angular Material si
guadagna il suo posto. Se il progetto ha già un proprio linguaggio di design, tirare dentro
Angular Material solo per avere un bottone o una dialog significa adottare un sistema intero
per usarne una fetta.

Quindi la regola dipende dal progetto. **Controlla prima.** Un progetto che usa già Angular
Material dovrebbe continuare a usarlo per coerenza. Un progetto che non lo usa dovrebbe
appoggiarsi alla Web Platform, che già offre dialog, popover, transizioni e animazioni guidate
dallo scroll.

## Perché è importante

### Costo del bundle

Angular Material tira dentro `@angular/cdk`, il proprio SCSS di theming e un insieme di moduli
componente. Anche con il tree-shaking, un singolo componente dialog aggiunge decine di kilobyte
di CSS e JavaScript compilati. Un elemento `<dialog>` nativo costa zero kilobyte, perché è già
incluso nel browser.

### Attrito con un design personalizzato

Un design system personalizzato e Angular Material si pestano i piedi a vicenda. Gli interni
dei componenti Material portano un proprio namespace di variabili CSS, una propria scala di
elevazione e propri token di movimento. Puoi sovrascriverli in un file di tema, ma è un lavoro
fragile, perché i nomi delle variabili interne di Material cambiano tra una major version e
l'altra. Un progetto di piattaforma WebRTC ha scelto componenti su misura, headless, basati
sulle primitive della web platform proprio per evitare questo accoppiamento, così che lo stile
di ogni componente viva interamente sotto i design token del progetto.

### Animazioni di Angular vs. CSS nativo

Il modulo `@angular/animations` di Angular è un sistema di animazioni pilotato da JavaScript.
Porta con sé un proprio runtime, va inizializzato con `provideAnimations()` e guida le animazioni
attraverso cambi di stato programmatici. Il CSS nativo copre lo stesso terreno (transizioni,
animazioni keyframe, effetti guidati dallo scroll, la `View Transitions API`) senza overhead di
JavaScript, con latenza minore visto che non c'è alcun ponte tra JS e stile, e con accelerazione
hardware di default.

Per stati discreti dell'interfaccia come l'hover di un bottone, la comparsa di un badge o un
drawer che scivola dentro, una `transition` CSS su un cambio di classe innescato da un signal
fa il suo lavoro senza import aggiuntivi.

## Come applicarla

### Controlla prima di aggiungere

Prima di installare `@angular/material`, verifica se `@angular/material` compare già nel
`package.json`. In caso affermativo, usalo in modo coerente. In caso negativo, fermati: non
aggiungerlo.

```bash
# If this prints a version number, the project uses Material — stay consistent.
# If it prints nothing, do not add it.
cat package.json | grep '@angular/material'
```

### Usa l'HTML nativo per gli elementi interattivi

L'HTML moderno offre interattività che un tempo richiedeva una libreria.

**Dialog / modale**

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

La Popover API è ora disponibile come baseline su tutti i browser moderni. Un attributo
`popover` più un attributo `popovertarget` sostituiscono di netto un componente a pannello
fluttuante:

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

### Anima con CSS nativo, non con @angular/animations

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

Per le animazioni di entrata e uscita, il CSS `@starting-style` (baseline 2024) toglie l'ultimo
motivo per usare le animazioni di Angular nelle transizioni di stato discrete:

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

Per le animazioni guidate dallo scroll, la Scroll-driven Animations API (`animation-timeline:
scroll()`) è baseline 2024 e non richiede alcun JavaScript.

### Componenti headless su misura invece di wrapper di libreria

Una piattaforma WebRTC e una libreria di web component headless usano entrambe componenti
headless su misura. Un componente definisce il comportamento ed espone markup corretto a livello
ARIA, mentre tutto lo styling arriva dai design token del progetto ospite. Cosa ne ricavi:

- Nessuna dipendenza dalla versione di una libreria di componenti di terze parti.
- Nessun CSS deciso da altri che poi ti tocca sovrascrivere.
- Accessibilità verificabile, perché l'ARIA è esplicito nel template.

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

Niente libreria, niente CDK, niente Material, solo la piattaforma.

## Anti-pattern

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

## Vedi anche

- [ARIA sull'elemento reale](/kb/web-components/aria-on-the-real-element) — l'approccio
  all'accessibilità dietro il pattern di componente headless usato qui.
- [Minimalismo e design schematico](/kb/design-ux/minimalism-no-emoji-schematic) — la
  filosofia di design che accompagna la costruzione di componenti snelli e guidati dai token.
