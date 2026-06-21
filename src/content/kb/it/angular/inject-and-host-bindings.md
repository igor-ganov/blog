---
title: 'inject() e i metadati host, non i costruttori e HostBinding'
category: angular
summary: 'Usa inject() per risolvere le dipendenze e l''oggetto dei metadati host per i binding sull''elemento host; tieni template e stili inline.'
principle: 'Risolvi le dipendenze con inject(); lega lo stato dell''host tramite l''oggetto dei metadati host, non con @HostBinding; tieni template e stili inline.'
severity: preferred
tags: [angular, inject, host, bindings, di, signals]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-02
    note: 'inject() al posto della DI da costruttore; metadati host al posto di @HostBinding.'
related:
  - angular/no-div-components-not-containers
  - angular/services-as-functions
order: 4
updated: 2026-06-10
---

Angular accetta due stili di dependency injection e due stili di host-binding allo stesso
tempo, entrambi sintatticamente validi. La forma più vecchia si basa sui decoratori:
parametri del costruttore annotati con `@Inject` o tipizzati per classe, più i decoratori
`@HostBinding` sulle proprietà. La forma più recente chiama `inject()` in cima al corpo
della classe e usa `host` come chiave dei metadati nel decoratore `@Component`.

Usa **`inject()` e i metadati `host:{}` ovunque**. Le forme con decoratore funzionano
ancora; semplicemente qui non sono la scelta predefinita.

## Perché conta

### inject() al posto dell'injection da costruttore

L'injection da costruttore obbliga a definire un costruttore. Una classe costruita su
`inject()` non ha bisogno di alcun costruttore, a meno che non abbia vera logica di
inizializzazione oltre alla risoluzione delle dipendenze. Il boilerplate si accumula: ogni
dipendenza iniettata è un parametro, una dichiarazione di proprietà e un'assegnazione nel
corpo del costruttore. Le parameter property accorciano tutto questo, ma restano comunque
una forma sintattica a sé che devi leggere.

```typescript
// Bad — constructor exists only to inject; three tokens of boilerplate per dependency
@Component({ /* ... */ })
export class TicketListComponent {
  private readonly ticketService: TicketService;
  private readonly router: Router;

  constructor(ticketService: TicketService, router: Router) {
    this.ticketService = ticketService;
    this.router = router;
  }
}

// Also bad — parameter properties are shorter but still require the constructor
@Component({ /* ... */ })
export class TicketListComponent {
  constructor(
    private readonly ticketService: TicketService,
    private readonly router: Router,
  ) {}
}
```

Con `inject()` il costruttore sparisce, e ogni dipendenza diventa una proprietà `readonly`
inizializzata proprio dove viene dichiarata:

```typescript
// Good — no constructor; dependencies are properties with clear types
@Component({ /* ... */ })
export class TicketListComponent {
  private readonly ticketService = inject(TicketService);
  private readonly router = inject(Router);
}
```

Tutto questo si sposa bene con i signal. Dato che `inject()` viene eseguito durante la
costruzione, all'interno dell'injection context, qualsiasi `computed` o `resource` che
dipende da un servizio iniettato può essere inizializzato inline:

```typescript
@Component({
  selector: 'app-ticket-list',
  standalone: true,
  template: `
    @for (ticket of tickets.value() ?? []; track ticket.id) {
      <app-ticket-row [ticket]="ticket" />
    }
  `,
  styles: [`:host { display: block; }`],
})
export class TicketListComponent {
  private readonly ticketService = inject(TicketService);

  readonly tickets = resource({
    loader: () => this.ticketService.list(),
  });
}
```

Qui non c'è costruttore, non c'è lifecycle hook e non c'è nulla da cui disiscriversi.

### Metadati host al posto di @HostBinding

`@HostBinding` decora una proprietà della classe e la lega a un attributo host o a una
classe CSS. Funziona, ma sparpaglia lo stato dell'host nel corpo della classe, così per
capire cosa è legato devi leggere sia il decoratore sia la proprietà su cui sta.
L'oggetto dei metadati `host` su `@Component` o `@Directive` raccoglie ogni host binding in
un solo posto, accanto a `selector`, `template` e `styles`, così l'intera superficie host è
lì davanti a te.

`@HostBinding` gestisce anche i signal in modo goffo. Riflettere il valore di un signal
come classe host significa comunque chiamare il signal come funzione dentro l'espressione
del binding. I metadati `host` accettano espressioni di template arbitrarie, quindi le
chiamate ai signal funzionano direttamente.

```typescript
// Bad — @HostBinding decorators scattered in the class body;
//       reading the host surface means scrolling the whole file
@Component({
  selector: 'app-nav-link',
  template: `<ng-content />`,
  styles: [`
    :host { display: block; }
    :host(.active) { font-weight: bold; }
  `],
})
export class NavLinkComponent {
  @Input() href = '';

  @HostBinding('class.active')
  get isActive(): boolean {
    return this.router.url === this.href;
  }

  @HostBinding('attr.aria-current')
  get ariaCurrent(): string | undefined {
    return this.isActive ? 'page' : undefined;
  }

  constructor(private readonly router: Router) {}
}

// Good — host metadata centralises all host bindings; inject() replaces constructor
@Component({
  selector: 'app-nav-link',
  standalone: true,
  template: `<ng-content />`,
  styles: [`
    :host { display: block; }
    :host(.active) { font-weight: bold; }
  `],
  host: {
    '[class.active]': 'isActive()',
    '[attr.aria-current]': 'isActive() ? "page" : null',
  },
})
export class NavLinkComponent {
  readonly href = input.required<string>();

  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
  );

  readonly isActive = computed(() => this.currentUrl() === this.href());
}
```

Tutto ciò che l'elemento host espone (classi, attributi, listener di eventi) sta
nell'oggetto dei metadati, dove lo leggi in un colpo solo. Non devi mai scandagliare il
corpo della classe alla ricerca di decoratori sparsi.

### Template e stili inline

Template e stili di un componente vanno nel decoratore `@Component`, non in file `.html` e
`.css` separati. Il punto è la coesione. Un componente è un'unità sola, e spalmare il suo
template su due file non ti dà alcuna modularità; ti fa solo aprire due tab per seguire una
cosa sola.

Lo standard di ingegneria lo tratta come obbligatorio, quindi `templateUrl` e `styleUrls`
restano inutilizzati.

```typescript
// Bad — split files require switching between tabs
@Component({
  selector: 'app-badge',
  templateUrl: './badge.component.html',
  styleUrls: ['./badge.component.css'],
})
export class BadgeComponent {}

// Good — self-contained; the component is one file
@Component({
  selector: 'app-badge',
  standalone: true,
  template: `<span>{{ label() }}</span>`,
  styles: [`
    :host {
      display: inline-flex;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      background: var(--color-badge-bg);
    }
  `],
})
export class BadgeComponent {
  readonly label = input.required<string>();
}
```

## Anti-pattern

```typescript
// Anti-pattern 1: constructor injection alongside inject()
// Mixing the two styles in one class is inconsistent and forces the constructor to exist.
@Component({ /* ... */ })
export class MixedComponent {
  private readonly a = inject(ServiceA);

  constructor(private readonly b: ServiceB) {} // inconsistent
}
// Fix: convert b to inject(ServiceB).

// Anti-pattern 2: @HostBinding with a getter that reads a signal
// This works but is verbose; the host metadata form is cleaner.
@HostBinding('class.loading')
get isLoading(): boolean {
  return this.loadingSignal();
}
// Fix: host: { '[class.loading]': 'loadingSignal()' }

// Anti-pattern 3: @HostListener for events that can go in host metadata
// @HostListener is the event-binding equivalent of @HostBinding — same problem.
@HostListener('click', ['$event'])
onClick(event: MouseEvent): void { /* ... */ }
// Fix: host: { '(click)': 'onClick($event)' }

// Anti-pattern 4: inject() called outside the class body initializer
// inject() is only valid inside an injection context. Calling it in a method or
// a setTimeout callback throws at runtime.
someMethod(): void {
  const service = inject(SomeService); // throws: not in injection context
}
// Fix: declare as a class property initializer.
```

## Applicazione

In fase di sviluppo l'Angular Language Service avvisa quando `inject()` viene chiamato
fuori da un injection context. Imposta su `error` la regola `@angular-eslint`
`@angular-eslint/prefer-inject` (disponibile da angular-eslint v18) per segnalare
l'injection da costruttore a favore di `inject()`:

```jsonc
{
  "rules": {
    "@angular-eslint/prefer-inject": "error"
  }
}
```

Per la preferenza su `@HostBinding` / `@HostListener`, le regole `@angular-eslint`
`@angular-eslint/no-host-metadata-property` e `@angular-eslint/use-component-view-encapsulation`
coprono aspetti correlati. La preferenza per i metadati `host` rimane una convenzione di
code review più che una regola imposta dal linter, quindi qualsiasi PR che introduce
`@HostBinding` o `@HostListener` deve giustificarlo esplicitamente.
