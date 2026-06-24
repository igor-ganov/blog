---
title: 'Blocchi di control-flow e binding, non direttive strutturali'
category: angular
summary: 'Sostituisci *ngIf/*ngFor/*ngSwitch con i blocchi @if/@for/@switch e sostituisci ngClass/ngStyle con i binding [class]/[style] per template piu snelli e type-safe.'
principle: 'Usa @if/@for/@switch, mai ngIf/ngFor; usa i binding [class]/[style], mai ngClass/ngStyle.'
severity: strong
tags: [angular, templates, control-flow, directives, signals]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-02
    note: '@if/@for/@switch; [class]/[style]; template e stili inline.'
related:
  - angular/no-div-components-not-containers
  - angular/signals-resource-compute
order: 2
updated: 2026-06-10
---

Angular 17 ha reso il control flow parte del linguaggio dei template. Le vecchie direttive
strutturali `*ngIf`, `*ngFor` e `*ngSwitch` sono ancora distribuite per retrocompatibilita,
ma non c'e piu motivo di usarle. Richiedono l'import di un modulo, confondono il
type-checker dei template in modi che ti si ritorcono contro piu avanti, e ingombrano il
markup che la sintassi a blocchi tiene pulito. `ngClass` e `ngStyle` sono lo stesso tipo di
zavorra: direttive d'attributo che incartano binding gia supportati dal template per conto
suo.

Quindi la regola non ha eccezioni. **Usa `@if`, `@for` e `@switch` ovunque, usa
`[class]` e `[style]` ovunque, e non importare niente di strutturale.**

## Perche conta

Le direttive strutturali sono precedenti all'attuale type-checker dei template. La
microsintassi `*` si traduce in un `ng-template` piu una direttiva, quindi il compilatore
le analizza solo in modo indiretto. La conseguenza pratica: `*ngIf="user"` non ha mai
ristretto `user` al suo tipo non-undefined dentro il blocco. Dovevi scrivere
`*ngIf="user; let u"` e poi riferirti a `u`.

Il blocco `@if` restringe il tipo direttamente:

```typescript
// The type of user() inside this block is User, not User | undefined.
@if (user()) {
  <app-user-card [user]="user()!" />  // still needs the ! — bad
}

// With @if narrowing applied correctly through a local binding:
@if (user(); as u) {
  <app-user-card [user]="u" />  // u: User — no assertion needed
}
```

C'e anche un guadagno di leggibilita. La sintassi a blocchi sembra control flow invece di
decorazione d'attributo, quindi chiunque abbia usato un altro linguaggio di template legge
`@if`/`@for`/`@switch` senza aprire la documentazione di Angular.

`ngClass` e `ngStyle` falliscono in un modo diverso. Entrambi prendono oggetti, tipo
`[ngClass]="{ active: isActive, disabled: isDisabled }"`, che sembra comodo fino al
momento esatto in cui rinomini una di quelle chiavi. Le chiavi sono stringhe non
verificate. Confrontalo con `[class.active]`, un binding tipizzato che il compilatore
verifica rispetto al contesto del template: se `isActive` cambia tipo, la build si rompe.
`[ngClass]` ingoia e basta il valore sbagliato.

Lo standard richiede anche template e stili inline. Ogni `@Component` tiene il suo
template come stringa nel campo `template` e i suoi stili come array nel campo `styles`,
senza file `.html` o `.css` separati. L'intero componente vive in un solo file, ed e
esattamente per questo che la sintassi a blocchi calza: leggi il template, control flow
incluso, come normale contesto TypeScript.

## Come applicarlo

### @if e @else

```typescript
// Bad
@Component({
  template: `
    <div *ngIf="isLoggedIn; else loginBlock">
      <app-dashboard />
    </div>
    <ng-template #loginBlock>
      <app-login />
    </ng-template>
  `,
})
export class AppShellComponent {
  readonly isLoggedIn = false;
}

// Good — inline template, block syntax, no ng-template
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [DashboardComponent, LoginComponent],
  template: `
    @if (isLoggedIn()) {
      <app-dashboard />
    } @else {
      <app-login />
    }
  `,
  styles: [`:host { display: contents; }`],
})
export class AppShellComponent {
  readonly isLoggedIn = signal(false);
}
```

Un ramo `@else if` non richiede cerimonie aggiuntive: `@else if (isAdmin()) { ... }`.

### @for con track

`@for` richiede un'espressione `track` esplicita, e il compilatore la impone.
L'espressione deve identificare in modo univoco ogni elemento. Ripiegare su `$index` e
l'ultima risorsa, non l'impostazione di default.

```typescript
// Bad — *ngFor without trackBy; every change re-creates all DOM nodes
@Component({
  template: `
    <li *ngFor="let ticket of tickets">{{ ticket.title }}</li>
  `,
})
export class TicketListComponent {
  readonly tickets: Ticket[] = [];
}

// Good — @for with a stable identity track; DOM nodes are reused on updates
@Component({
  selector: 'app-ticket-list',
  standalone: true,
  template: `
    <ul>
      @for (ticket of tickets(); track ticket.id) {
        <app-ticket-row [ticket]="ticket" />
      } @empty {
        <li>No tickets found.</li>
      }
    </ul>
  `,
  styles: [`:host { display: block; }`],
})
export class TicketListComponent {
  readonly tickets = input.required<readonly Ticket[]>();
}
```

Il blocco `@empty` sostituisce il secondo `*ngIf` che si usava abbinare a `*ngFor` per il
caso vuoto. Appartiene al blocco `@for` stesso, quindi niente direttiva ausiliaria e
niente `ng-template` aggiuntivo.

### @switch

```typescript
// Bad — nested *ngIf chain to implement a switch
@Component({
  template: `
    <span *ngIf="status === 'open'">Open</span>
    <span *ngIf="status === 'closed'">Closed</span>
    <span *ngIf="status === 'pending'">Pending</span>
  `,
})
export class StatusBadgeComponent {
  @Input() status: TicketStatus = 'open';
}

// Good — @switch reads as a switch statement; [class] drives visual state
@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    @switch (status()) {
      @case ('open')    { <span [class.badge--open]="true">Open</span> }
      @case ('closed')  { <span [class.badge--closed]="true">Closed</span> }
      @case ('pending') { <span [class.badge--pending]="true">Pending</span> }
      @default          { <span>Unknown</span> }
    }
  `,
  styles: [`
    :host { display: inline-block; }
    .badge--open    { color: var(--color-success); }
    .badge--closed  { color: var(--color-neutral); }
    .badge--pending { color: var(--color-warning); }
  `],
})
export class StatusBadgeComponent {
  readonly status = input.required<TicketStatus>();
}
```

### Binding [class] e [style]

```typescript
// Bad — ngClass with an object literal; keys are unverified strings
@Component({
  template: `
    <button [ngClass]="{ 'btn--primary': isPrimary, 'btn--disabled': isDisabled }">
      {{ label }}
    </button>
  `,
})
export class ButtonComponent {
  @Input() isPrimary = false;
  @Input() isDisabled = false;
  @Input() label = '';
}

// Good — [class.x] bindings; the compiler checks isPrimary() exists on the component
@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button
      [class.btn--primary]="isPrimary()"
      [class.btn--disabled]="isDisabled()"
      [disabled]="isDisabled()"
    >
      {{ label() }}
    </button>
  `,
  styles: [`
    :host { display: inline-block; }
    .btn--primary  { background: var(--color-primary); }
    .btn--disabled { opacity: 0.4; pointer-events: none; }
  `],
})
export class ButtonComponent {
  readonly isPrimary = input(false);
  readonly isDisabled = input(false);
  readonly label = input.required<string>();
}
```

Le proprieta CSS custom e i valori di stile arbitrari si bindano allo stesso modo tramite `[style.--prop]`:

```typescript
// Drive a CSS custom property from a signal — no ngStyle object needed
template: `<span [style.--progress]="progress() + '%'">{{ progress() }}%</span>`
```

La forma con suffisso di unita `[style.width.px]` elimina del tutto la concatenazione di stringhe:

```typescript
// Bad
template: `<div [ngStyle]="{ width: width + 'px' }">...</div>`

// Good
template: `<section [style.width.px]="width()">...</section>`
```

## Anti-pattern

```typescript
// Anti-pattern 1: Importing CommonModule "for convenience"
// CommonModule re-exports all structural directives. Importing it is an implicit
// opt-in to *ngIf, *ngFor, and ngClass. Import only what is needed.
@Component({
  standalone: true,
  imports: [CommonModule],  // pulls in every legacy directive
})

// Fix: import the specific components/pipes needed; use block syntax for control flow.

// Anti-pattern 2: ngStyle for a single property
// ngStyle creates an Observable-like dirty-checking mechanism for a property that
// a single [style.x] binding handles in one token.
template: `<div [ngStyle]="{ opacity: isVisible ? 1 : 0 }">...</div>`
// Fix:
template: `<section [style.opacity]="isVisible() ? 1 : 0">...</section>`

// Anti-pattern 3: *ngFor without trackBy
// Without tracking, Angular destroys and recreates every list item on any change to
// the array reference. For a 200-row table, this is hundreds of DOM mutations per
// keystroke in a search box.
template: `<tr *ngFor="let row of rows">...</tr>`
// Fix:
template: `@for (row of rows(); track row.id) { <tr>...</tr> }`

// Anti-pattern 4: Nested *ngIf to simulate @if/@else
template: `
  <app-content *ngIf="loaded" />
  <app-spinner *ngIf="!loaded" />
`
// Fix:
template: `
  @if (loaded()) {
    <app-content />
  } @else {
    <app-spinner />
  }
`
```

Tutti e quattro hanno una stessa causa di fondo: il template dichiara l'intento
tramite direttive invece che tramite costrutti del linguaggio. Per il compilatore quelle
direttive sono stringhe opache. La sintassi a blocchi la analizza come vera sintassi e la
puo controllare.

## Applicazione forzata

La CLI di migrazione di Angular puo automatizzare la conversione:

```bash
ng generate @angular/core:control-flow
```

Riscrive in sintassi a blocchi ogni `*ngIf`/`*ngFor`/`*ngSwitch` del progetto in una sola
passata. Eseguila una volta, poi proteggi il risultato con il lint cosi niente regredisce.

Il plugin `@angular-eslint/template` fornisce la regola
`@angular-eslint/template/no-legacy-template-syntax` che rifiuta la sintassi delle direttive
strutturali. Aggiungila alla configurazione di lint dei template:

```jsonc
{
  "files": ["**/*.html"],
  "rules": {
    "@angular-eslint/template/no-legacy-template-syntax": "error"
  }
}
```

Il lato dei binding e coperto dalla regola dello stesso plugin
`@angular-eslint/template/no-ngClass-and-ngStyle` (personalizzata o della community). Quando
per la tua versione non esiste ancora una regola pronta, ripiega su una voce nella checklist
di code review: ogni PR che importa o usa `NgClass`, `NgStyle`, `NgIf`, `NgFor` o `NgSwitch`
deve giustificarlo.
