---
title: 'Никаких div — компонент, а не контейнер'
category: angular
summary: 'Каждое место, где напрашивается <div>, становится отдельным компонентом; стили контейнера живут на :host, а шаблоны остаются без div и семантически корректными.'
principle: 'Компонент не должен содержать div; каждое место, где нужен div, становится вложенным или общим компонентом, а стили контейнера переезжают в :host.'
severity: strong
tags: [angular, html, semantic, components, css]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'Никаких div; вложенные/общие компоненты; стили контейнера на :host.'
  - project: 'SPA для администрирования контента'
    date: 2026-03-24
    note: 'Большой рефакторинг, фаза 7: дошли до нуля элементов <div>, весь HTML семантический.'
related:
  - angular/inject-and-host-bindings
  - web-components/aria-on-the-real-element
order: 1
updated: 2026-06-10
---

`<div>` не несёт ни смысла, ни роли для доступности, ни структурных обязательств — и
именно поэтому с ним столько проблем. Шаблон, набитый обёртками `<div>`, описывает
вёрстку, а не семантику. Компонент перестаёт быть самодостаточной единицей интерфейса и
превращается в мешок разметки, который имеет смысл только тогда, когда ты уже понимаешь
окружающую страницу.

Правило простое: **никаких `<div>` внутри шаблона компонента, никогда.** Когда вёрстке
нужна обёртка, эта обёртка становится компонентом — либо исчезает, потому что `:host` уже
даёт тебе элемент, который можно стилизовать.

## Почему это важно

В ходе Большого рефакторинга SPA для администрирования контента (завершён 2026-03-24)
фаза 7 называлась «Чистка компонентов». Цель была сформулирована прямо: **ноль элементов
`<div>`, весь HTML семантический**. Это была не косметика. До чистки у нас были
компоненты, которые на самом деле были секциями страницы, переодетыми в костюм
компонента. Взять `UserCardComponent`, у которого шаблон был
`<div class="card"><div class="card__header">...`; любой родитель, желавший переопределить
стиль, сперва должен был изучить внутреннюю вёрстку. Связанность шла в обе стороны.
Шаблоны протекали структурой вверх к родителям, а родители протекали предположениями об
отступах обратно вниз через глубокие CSS-селекторы.

Удаление каждого `<div>` форсировало два результата:

1. **Появились настоящие границы компонентов.** `<div class="card__actions">` вынужден был
   стать компонентом `<card-actions>`, а это поднимало вопрос «что эта штука вообще
   *делает*?». Ответ на него прояснял публичный API.
2. **Семантический HTML стал поведением по умолчанию.** Как только `<div>` исключён, рука
   тянется к `<section>`, `<article>`, `<aside>`, `<nav>`, `<header>`, `<main>`.
   Вспомогательные технологии и поисковики начинают осмысленно обходить дерево документа.

Приложение дошло до нуля нарушений на более чем 70 файлах компонентов за одну фазу
рефакторинга и держит это состояние с тех пор.

## Как применять

### Используй :host для стилей контейнера

Хост-элемент — это корневой DOM-узел компонента, и он уже существует без какой-либо
дополнительной разметки. Стилизация его через `:host` заменяет любой внешний `<div>`-обёртку.

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

### Выноси группы вёрстки в именованные компоненты

Когда логическая группа элементов держится вместе внутри большего шаблона, сделай для этой
группы компонент вместо того, чтобы оборачивать её в `<div>`.

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

### Размещай общие компоненты в ближайшем общем корне под `common`

Когда одна и та же презентационная сущность нужна двум или больше папкам с фичами, её
место — в подпапке `common/` ближайшего общего родительского каталога. Не дублируй её и не
поднимай в глобальный модуль `shared/`, пока в этом нет необходимости.

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

### Опирайся на семантические HTML-элементы

Прежде чем создавать новый компонент, проверь, не несёт ли уже нужный смысл нативный
элемент. `<section>`, `<article>`, `<nav>`, `<aside>`, `<header>`, `<footer>`,
`<main>`, `<ul>`, `<ol>` и `<figure>` — все они сообщают намерение вспомогательным
технологиям без какой-либо дополнительной работы с ARIA.

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

## Антипаттерны

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

У этих паттернов один общий симптом. Родительские шаблоны ломаются, когда внутренний
`<div>` перестраивают, потому что CSS родителя ссылался на `.card .card__header`, а этого
пути больше нет. Стилизация через `:host` режет связанность, ведь родитель может трогать
`app-user-card` только как чёрный ящик.

## Контроль соблюдения

Добавь правило линтера для шаблонов, запрещающее `<div>` в шаблонах компонентов. С
плагином `@angular-eslint/template`:

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

Для немедленного контроля без своего правила правило `forbidden-elements` плагина
`@angular-eslint/template` (доступно в angular-eslint >= 17) блокирует `<div>` ещё на
этапе CI:

```jsonc
{
  "rules": {
    "@angular-eslint/template/elements-content": "error"
  }
}
```

Запасной вариант — код-ревью. Любой PR, который вносит `<div>` в шаблон Angular, требует
явного, зафиксированного обоснования, и это обоснование почти всегда указывает на
недостающую границу компонента.

## Смотри также

- Тот же принцип «никаких безымянных обёрток» работает и для кастомных элементов; про
  сторону доступности этого аргумента см.
  [ARIA на реальном элементе](/principles/web-components/aria-on-the-real-element).
- Хост-биндинги — естественный спутник стилизации через `:host`; см.
  [inject() и метаданные хоста](/principles/angular/inject-and-host-bindings), чтобы управлять
  состоянием хост-элемента из сигналов.
