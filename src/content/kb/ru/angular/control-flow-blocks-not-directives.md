---
title: 'Блоки управления потоком и привязки вместо структурных директив'
category: angular
summary: 'Замените *ngIf/*ngFor/*ngSwitch на блоки @if/@for/@switch, а ngClass/ngStyle — на привязки [class]/[style], чтобы шаблоны стали компактнее и типобезопаснее.'
principle: 'Используйте @if/@for/@switch, а не ngIf/ngFor; используйте привязки [class]/[style], а не ngClass/ngStyle.'
severity: strong
tags: [angular, templates, control-flow, directives, signals]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: '@if/@for/@switch; [class]/[style]; встроенные шаблоны и стили.'
related:
  - angular/no-div-components-not-containers
  - angular/signals-resource-compute
order: 2
updated: 2026-06-10
---

Angular 17 сделал управление потоком частью языка шаблонов. Старые структурные
директивы `*ngIf`, `*ngFor` и `*ngSwitch` всё ещё поставляются ради обратной
совместимости, но тянуться за ними больше незачем. Им нужен импорт модуля, они путают
проверку типов в шаблоне так, что это всплывает позже, и они засоряют разметку, которую
синтаксис блоков держит чистой. `ngClass` и `ngStyle` — тот же балласт: директивы-атрибуты,
оборачивающие привязки, которые шаблон и без них умеет.

Поэтому у правила нет исключений. **Везде используйте `@if`, `@for` и `@switch`, везде
используйте `[class]` и `[style]`, и ничего структурного не импортируйте.**

## Почему это важно

Структурные директивы старше нынешней проверки типов в шаблоне. Микросинтаксис `*`
разворачивается в `ng-template` плюс директиву, поэтому компилятор рассуждает о них только
опосредованно. Что из этого следует на практике: `*ngIf="user"` никогда не сужал `user` до
non-undefined типа внутри блока. Приходилось писать `*ngIf="user; let u"` и обращаться к `u`.

Блок `@if` сужает тип напрямую:

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

Есть и выигрыш в читаемости. Синтаксис блоков выглядит как управление потоком, а не как
украшение атрибутами, так что любой, кто работал с другим шаблонным языком, прочитает
`@if`/`@for`/`@switch` без обращения к документации Angular.

`ngClass` и `ngStyle` подводят иначе. Оба принимают объекты, вроде
`[ngClass]="{ active: isActive, disabled: isDisabled }"`, и это кажется удобным ровно до
момента, когда вы переименуете один из ключей. Ключи — непроверяемые строки. Сравните с
`[class.active]`, типизированной привязкой, которую компилятор сверяет с контекстом шаблона:
если `isActive` меняет тип, сборка падает. `[ngClass]` же просто проглотит неверное значение.

Стандарт также требует встроенных шаблонов и стилей. Каждый `@Component` держит шаблон
строкой в поле `template`, а стили — массивом в поле `styles`, без отдельных файлов `.html`
или `.css`. Весь компонент живёт в одном файле — именно поэтому синтаксис блоков сюда
подходит: вы читаете шаблон вместе со всем управлением потоком как обычный контекст
TypeScript.

## Как применять

### @if и @else

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

Ветка `@else if` не требует лишних церемоний: `@else if (isAdmin()) { ... }`.

### @for с track

`@for` требует явного выражения `track`, и компилятор это проверяет. Выражение должно
однозначно идентифицировать каждый элемент. Откат к `$index` — крайняя мера, а не значение
по умолчанию.

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

Блок `@empty` заменяет тот дополнительный `*ngIf`, который раньше ставили в пару к `*ngFor`
для случая пустого списка. Он принадлежит самому блоку `@for`, так что нет ни
вспомогательной директивы, ни лишнего `ng-template`.

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

### Привязки [class] и [style]

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

CSS-переменные и произвольные значения стилей привязываются так же, через `[style.--prop]`:

```typescript
// Drive a CSS custom property from a signal — no ngStyle object needed
template: `<span [style.--progress]="progress() + '%'">{{ progress() }}%</span>`
```

Форма с суффиксом единиц `[style.width.px]` вовсе избавляет от конкатенации строк:

```typescript
// Bad
template: `<div [ngStyle]="{ width: width + 'px' }">...</div>`

// Good
template: `<section [style.width.px]="width()">...</section>`
```

## Антипаттерны

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

У всех четырёх одна корневая причина: шаблон выражает намерение через директивы, а не через
конструкции языка. Для компилятора эти директивы — непрозрачные строки, тогда как синтаксис
блоков разбирается как настоящий синтаксис, который он умеет проверять.

## Контроль соблюдения

Собственный миграционный CLI Angular умеет автоматизировать перевод:

```bash
ng generate @angular/core:control-flow
```

Он переписывает каждый `*ngIf`/`*ngFor`/`*ngSwitch` в проекте на синтаксис блоков за один
проход. Запустите его один раз, а затем подстрахуйте результат линтером, чтобы ничего не
откатилось назад.

Плагин `@angular-eslint/template` даёт правило
`@angular-eslint/template/no-legacy-template-syntax`, которое отклоняет синтаксис структурных
директив. Добавьте его в конфигурацию линтинга шаблонов:

```jsonc
{
  "files": ["**/*.html"],
  "rules": {
    "@angular-eslint/template/no-legacy-template-syntax": "error"
  }
}
```

Сторону привязок закрывает правило того же плагина
`@angular-eslint/template/no-ngClass-and-ngStyle` (своё или из сообщества). Если для вашей
версии готового правила ещё нет, откатитесь на пункт чек-листа код-ревью: любой PR, который
импортирует или использует `NgClass`, `NgStyle`, `NgIf`, `NgFor` или `NgSwitch`, должен это
обосновать.
