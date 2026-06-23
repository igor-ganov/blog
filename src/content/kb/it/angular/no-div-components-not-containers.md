---
title: 'Niente div — un componente, non un contenitore'
category: angular
summary: 'Ogni punto che richiede un <div> diventa un componente dedicato; gli stili del contenitore vivono su :host, lasciando i template privi di div e semanticamente corretti.'
principle: 'Un componente non deve contenere un div; ogni punto che richiede un div diventa un componente annidato o condiviso, con gli stili del contenitore in :host.'
severity: strong
tags: [angular, html, semantic, components, css]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-02
    note: 'Niente div; componenti annidati/condivisi; stili del contenitore in :host.'
  - project: 'una SPA di content-admin'
    date: 2026-03-24
    note: 'La fase 7 del Grande Refactoring ha raggiunto zero elementi <div>, tutto HTML semantico.'
related:
  - angular/inject-and-host-bindings
  - web-components/aria-on-the-real-element
order: 1
updated: 2026-06-10
---

Un `<div>` non porta con sé alcun significato, alcun ruolo di accessibilità e alcun
impegno strutturale, ed è proprio per questo che crea problemi. Un template pieno di
wrapper `<div>` descrive il layout invece della semantica. Il componente smette di essere
un'unità UI autonoma e si trasforma in un sacco di markup che ha senso solo se hai già
capito la pagina che lo circonda.

La regola è semplice: **mai un `<div>` dentro il template di un componente.** Quando il
layout richiede un wrapper, quel wrapper diventa un componente, oppure sparisce perché
`:host` ti dà già un elemento da stilizzare.

## Perché conta

Durante il Grande Refactoring della SPA di content-admin (completato il 2026-03-24), la
fase 7 si chiamava "Component Cleanup". L'obiettivo era dichiarato senza giri di parole:
**zero elementi `<div>`, tutto HTML semantico**. Non era un traguardo estetico. Prima della
pulizia avevamo componenti che in realtà erano sezioni di pagina travestite da componente.
Prendi `UserCardComponent`, il cui template era `<div class="card"><div
class="card__header">...`; qualsiasi genitore che volesse sovrascrivere uno stile doveva
prima imparare il layout interno. L'accoppiamento andava in entrambe le direzioni. I
template facevano trapelare la struttura verso i genitori, e i genitori facevano trapelare
le assunzioni sul padding verso il basso attraverso selettori CSS profondi.

Rimuovere ogni `<div>` ha forzato due risultati:

1. **Sono emersi confini reali tra i componenti.** Un `<div class="card__actions">` doveva
   diventare un componente `<card-actions>`, e questo costringeva a porsi la domanda "cosa
   *fa* questa cosa?". Rispondere chiariva l'API pubblica.
2. **L'HTML semantico è diventato il default.** Una volta che `<div>` è fuori discussione,
   si ricorre a `<section>`, `<article>`, `<aside>`, `<nav>`, `<header>`, `<main>`. Le
   tecnologie assistive e i motori di ricerca possono così attraversare l'albero del
   documento in modo significativo.

L'applicazione ha raggiunto zero violazioni su più di 70 file di componenti in una sola
fase di refactoring, e da allora ha mantenuto quello stato.

## Come applicarla

### Usa :host per gli stili del contenitore

L'elemento host è il nodo DOM radice del componente, ed esiste già senza alcun markup
aggiuntivo. Stilizzarlo con `:host` sostituisce ogni `<div>` di "wrapper esterno".

```typescript
// Bad — wrapping div exists solely to hold padding and display rules.
@Component({
  selector: 'app-user-card',
  template: `
    <div class="card">
      <img [src]="user().avatar" alt="" />
      <span>{{ user().name }}</span>
    </div>
  `,
  styles: [`
    .card {
      display: flex;
      gap: 0.5rem;
      padding: 1rem;
      border-radius: 0.5rem;
    }
  `],
})
export class UserCardComponent {
  readonly user = input.required<User>();
}

// Good — :host IS the card. No wrapper element needed.
@Component({
  selector: 'app-user-card',
  template: `
    <img [src]="user().avatar" alt="" />
    <span>{{ user().name }}</span>
  `,
  styles: [`
    :host {
      display: flex;
      gap: 0.5rem;
      padding: 1rem;
      border-radius: 0.5rem;
    }
  `],
})
export class UserCardComponent {
  readonly user = input.required<User>();
}
```

### Estrai i gruppi di layout in componenti con un nome

Quando un gruppo logico di elementi va tenuto insieme dentro un template più grande, crea
un componente per quel gruppo invece di avvolgerlo in un `<div>`.

```typescript
// Bad — three sibling divs inside a parent template. Changing layout of actions
//       requires touching the parent component's template.
@Component({
  selector: 'app-ticket-detail',
  template: `
    <article>
      <h1>{{ ticket().title }}</h1>
      <div class="meta">
        <span>{{ ticket().status }}</span>
        <span>{{ ticket().priority }}</span>
      </div>
      <div class="actions">
        <button (click)="close()">Close</button>
        <button (click)="reassign()">Reassign</button>
      </div>
    </article>
  `,
})
export class TicketDetailComponent { /* ... */ }

// Good — meta and actions become components.
// Each owns its layout in :host; the parent template is purely structural.
@Component({
  selector: 'app-ticket-detail',
  template: `
    <article>
      <h1>{{ ticket().title }}</h1>
      <app-ticket-meta [ticket]="ticket()" />
      <app-ticket-actions [ticket]="ticket()" />
    </article>
  `,
})
export class TicketDetailComponent { /* ... */ }

@Component({
  selector: 'app-ticket-meta',
  template: `
    <span>{{ ticket().status }}</span>
    <span>{{ ticket().priority }}</span>
  `,
  styles: [`:host { display: flex; gap: 0.5rem; }`],
})
export class TicketMetaComponent {
  readonly ticket = input.required<Ticket>();
}

@Component({
  selector: 'app-ticket-actions',
  template: `
    <button (click)="close.emit()">Close</button>
    <button (click)="reassign.emit()">Reassign</button>
  `,
  styles: [`:host { display: flex; gap: 0.5rem; }`],
})
export class TicketActionsComponent {
  readonly ticket = input.required<Ticket>();
  readonly close = output<void>();
  readonly reassign = output<void>();
}
```

### Metti i componenti condivisi nella radice comune più vicina, sotto `common`

Quando due o più cartelle di feature hanno bisogno dello stesso componente di
presentazione, esso va nella sottocartella `common/` della loro directory antenata comune
più vicina. Non duplicarlo, e non promuoverlo a un modulo globale `shared/` prima del
necessario.

```
src/
  features/
    tickets/
      common/
        ticket-meta/
          ticket-meta.component.ts   ← shared between list and detail
      ticket-list/
      ticket-detail/
    users/
      common/
        user-avatar/
          user-avatar.component.ts
```

### Affidati agli elementi HTML semantici

Prima di creare un nuovo componente, verifica se un elemento nativo porta già il
significato giusto. `<section>`, `<article>`, `<nav>`, `<aside>`, `<header>`, `<footer>`,
`<main>`, `<ul>`, `<ol>` e `<figure>` comunicano tutti l'intento alle tecnologie assistive
senza alcun lavoro extra con ARIA.

```typescript
// Bad — div soup; a screen reader announces "group" for each wrapper
template: `
  <div class="page">
    <div class="sidebar">
      <div class="nav-section">...</div>
    </div>
    <div class="content">...</div>
  </div>
`

// Good — every element carries its own landmark role
template: `
  <aside>
    <nav>...</nav>
  </aside>
  <main>...</main>
`
```

## Anti-pattern

```typescript
// Anti-pattern 1: The "container" component
// A component whose entire purpose is to centre or pad its children.
// Extract that CSS to :host or to a CSS custom property on the parent instead.
@Component({
  template: `<div class="page-container"><ng-content /></div>`,
  styles: [`.page-container { max-width: 1200px; margin: 0 auto; padding: 0 1rem; }`],
})
export class PageContainerComponent {}

// Fix: use :host
@Component({
  selector: 'app-page',
  template: `<ng-content />`,
  styles: [`:host { display: block; max-width: 1200px; margin: 0 auto; padding: 0 1rem; }`],
})
export class PageComponent {}

// Anti-pattern 2: Inline layout groups
// A "row" div grouping icon + label is really an icon-label component.
template: `
  <div class="icon-label">
    <app-icon [name]="icon()" />
    <span>{{ label() }}</span>
  </div>
`

// Fix: named component
@Component({
  selector: 'app-icon-label',
  template: `
    <app-icon [name]="icon()" />
    <span>{{ label() }}</span>
  `,
  styles: [`:host { display: inline-flex; align-items: center; gap: 0.25rem; }`],
})
export class IconLabelComponent {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
}

// Anti-pattern 3: Style scoping via wrapper divs
// Adding a div with a unique class to "scope" CSS is a sign that the styles
// should live in the component's own stylesheet under :host or :host ::ng-deep,
// or that the component boundary is wrong.
template: `<div class="ticket-status-badge">{{ status() }}</div>`
// Fix: the component IS the badge; :host carries the styles.
```

Questi pattern condividono un sintomo. I template dei genitori si rompono quando il `<div>`
interno viene ristrutturato, perché il CSS del genitore faceva riferimento a `.card
.card__header` e quel percorso non esiste più. Stilizzare tramite `:host` taglia
l'accoppiamento, dato che il genitore può toccare `app-user-card` solo come una scatola
nera.

## Applicazione forzata

Aggiungi una regola di lint sui template che vieti `<div>` nei template dei componenti. Con
il plugin `@angular-eslint/template`:

```jsonc
// eslint.config.ts (flat config excerpt)
{
  "files": ["**/*.html"],
  "rules": {
    "@angular-eslint/template/no-divsion-operator": "off",
    // Custom rule or use the forbidden-elements rule
    "@angular-eslint/template/use-track-by-function": "error"
  }
}
```

Per un'applicazione immediata senza una regola custom, la regola `forbidden-elements` di
`@angular-eslint/template` (disponibile in angular-eslint >= 17) blocca `<div>` in fase di
CI:

```jsonc
{
  "rules": {
    "@angular-eslint/template/elements-content": "error"
  }
}
```

La code review è l'ultima rete. Qualsiasi PR che introduca un `<div>` in un template
Angular ha bisogno di una giustificazione esplicita e messa a verbale, e quella
giustificazione punta quasi sempre a un confine di componente mancante.

## Vedi anche

- Lo stesso principio "niente wrapper anonimi" vale per i custom element; vedi
  [ARIA on the real element](/principles/web-components/aria-on-the-real-element) per il lato
  accessibilità di questo discorso.
- Gli host binding sono il compagno naturale dello styling con `:host` — vedi
  [inject() and host metadata](/principles/angular/inject-and-host-bindings) per come pilotare lo
  stato dell'elemento host a partire dai signal.
