---
title: 'inject() и метаданные host вместо конструкторов и HostBinding'
category: angular
summary: 'Резолвьте зависимости через inject(), а привязки к host-элементу описывайте в объекте метаданных host; шаблоны и стили держите inline.'
principle: 'Резолвьте зависимости через inject(); состояние host привязывайте через объект метаданных host, а не @HostBinding; шаблоны и стили держите inline.'
severity: preferred
tags: [angular, inject, host, bindings, di, signals]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'inject() вместо конструкторного DI; метаданные host вместо @HostBinding.'
related:
  - angular/no-div-components-not-containers
  - angular/services-as-functions
order: 4
updated: 2026-06-10
---

Angular одновременно принимает два стиля внедрения зависимостей и два стиля host-привязок,
и оба синтаксически корректны. Старая форма опирается на декораторы: параметры конструктора
с аннотацией `@Inject` или типизированные классом, плюс декораторы `@HostBinding` на
свойствах. Новая форма вызывает `inject()` в начале тела класса и использует `host` как ключ
метаданных в декораторе `@Component`.

Везде применяйте **`inject()` и метаданные `host:{}`**. Декораторные формы по-прежнему
работают — просто здесь они не по умолчанию.

## Почему это важно

### inject() вместо конструкторного внедрения

Конструкторное внедрение требует, чтобы конструктор существовал. Классу на `inject()`
конструктор не нужен вообще, если у него нет настоящей логики инициализации сверх резолвинга
зависимостей. Шаблонный код накапливается: каждая внедрённая зависимость — это параметр,
объявление свойства и присваивание в теле конструктора. Параметрические свойства сокращают
это, но всё равно остаются отдельной синтаксической формой, которую приходится читать.

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

С `inject()` конструктор исчезает, а каждая зависимость становится `readonly`-свойством,
проинициализированным прямо там, где оно объявлено:

```typescript
// Good — no constructor; dependencies are properties with clear types
@Component({ /* ... */ })
export class TicketListComponent {
  private readonly ticketService = inject(TicketService);
  private readonly router = inject(Router);
}
```

Это хорошо сочетается с сигналами. Поскольку `inject()` выполняется во время конструирования,
внутри контекста внедрения, любой `computed` или `resource`, зависящий от внедрённого
сервиса, можно тоже проинициализировать прямо здесь:

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

Здесь нет конструктора, нет хука жизненного цикла и нечего отписывать.

### метаданные host вместо @HostBinding

`@HostBinding` декорирует свойство класса и связывает его с атрибутом host-элемента или
CSS-классом. Работает, но разбрасывает состояние host по телу класса: чтобы понять, что
именно привязано, нужно читать и декоратор, и свойство, на котором он висит. Объект
метаданных `host` в `@Component` или `@Directive` собирает все host-привязки в одном месте,
рядом с `selector`, `template` и `styles`, так что вся host-поверхность сразу перед глазами.

С сигналами `@HostBinding` тоже обращается неуклюже. Чтобы отразить значение сигнала как
host-класс, всё равно приходится вызывать сигнал как функцию внутри выражения привязки.
Метаданные `host` принимают произвольные шаблонные выражения, поэтому вызовы сигналов просто
работают.

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

Всё, что выставляет host-элемент (классы, атрибуты, обработчики событий), лежит в объекте
метаданных, где это читается за один проход. Тело класса на предмет случайных декораторов
сканировать не приходится.

### Inline-шаблоны и стили

Шаблоны и стили компонента место в декораторе `@Component`, а не в отдельных файлах `.html`
и `.css`. Суть в связности. Компонент — это единый блок, и размазывание его шаблона по двум
файлам не даёт никакой модульности; оно лишь заставляет открывать две вкладки, чтобы
проследить за одной вещью.

Инженерный стандарт считает это обязательным, поэтому `templateUrl` и `styleUrls` остаются
без применения.

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

## Антипаттерны

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

## Как это закрепить

Во время разработки Angular Language Service предупреждает, когда `inject()` вызывается вне
контекста внедрения. Поставьте правило `@angular-eslint` `@angular-eslint/prefer-inject`
(доступно с angular-eslint v18) в `error`, чтобы помечать конструкторное внедрение в пользу
`inject()`:

```jsonc
{
  "rules": {
    "@angular-eslint/prefer-inject": "error"
  }
}
```

Для предпочтения против `@HostBinding` / `@HostListener` смежные вопросы покрывают правила
`@angular-eslint` `@angular-eslint/no-host-metadata-property` и
`@angular-eslint/use-component-view-encapsulation`. Само предпочтение метаданных `host`
остаётся соглашением уровня код-ревью, а не правилом линтера, поэтому любой PR, который
вводит `@HostBinding` или `@HostListener`, обязан явно это обосновать.
