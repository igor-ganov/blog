---
title: 'Lit-элемент — тонкая оболочка над чистым ядром'
category: web-components
summary: 'Держите класс компонента минимальным — реактивные свойства, ссылки через query, один контроллер, однострочные делегаты жизненного цикла — а всё поведение выносите в чистые свободные функции, которые Vitest проверяет в изоляции.'
principle: 'Держите класс компонента минимальным — реактивные свойства, ссылки через query, единственный контроллер и однострочные делегаты жизненного цикла; всё реальное поведение живёт в чистых свободных функциях, проверяемых в изоляции.'
severity: strong
tags: [lit, web-components, functional-programming, testing, vitest, playwright]
sources:
  - project: 'безголовая библиотека веб-компонентов'
    date: 2026-06-06
    note: 'Lit 3 + Vite; Vitest с happy-dom для чистого src/core; Playwright E2E против демо на Vite.'
  - project: 'инженерный стандарт'
    date: 2026-06-07
    note: 'оболочка ≤50 строк; поведение в свободных функциях, принимающих хост.'
related:
  - web-components/measured-geometry-not-hardcoded
  - web-components/lit-legacy-decorators-no-accessor
  - functional-architecture/one-function-per-file-folder-by-usage
order: 1
updated: 2026-06-10
---

`LitElement` в Lit — это класс, а классы разрастаются. Если за этим не следить, кастомный
элемент обрастает теневым DOM, движком позиционирования, планировщиком анимаций, учётом
ARIA, обработкой клавиатуры и методами внешнего API — и всё в одном файле. Ни одну из
этих логик не проверишь без настоящего браузера, и ни одну не переиспользуешь за пределами
этого элемента.

Дисциплина, которая этому мешает, родилась в безголовой библиотеке веб-компонентов
(2026-06-06). Воспринимайте класс элемента как **тонкую оболочку**: место, где
объявляются реактивные свойства, хранятся ссылки `@query` и один контроллер, а вызовы
жизненного цикла делегируются дальше. Каждое реальное решение помещайте в чистые
свободные функции, которые живут в `src/element/*.ts`. Vitest гоняет эти функции через
`happy-dom`, а Playwright прогоняет E2E против настоящего демо на Vite. Эти два слоя тестов
не пересекаются.

## Почему это важно

Цена раздутого класса компонента не видна, пока вы не возьмётесь его тестировать. `@property()`
и `@state()` в Lit привязывают значения к `requestUpdate`, которому нужна вся машинерия
кастомного элемента, а ей нужен браузер. Набор тестов Vitest, который импортирует раздутый
элемент, вынужден его монтировать (`fixture()` или `render()`), ждать обновлений и только
потом проверять. Каждый тест тащит за собой эти накладные расходы. На 30 тестах цикл
монтирования/размонтирования съедает большую часть времени прогона, а при сбое в отчёте
видна обвязка компонента, а не та логика, которую вы хотели проверить.

Чистые свободные функции вроде `openMenu(host, event)`, `computeGeometry(trigger, menu)` и
`trapFocus(container)` синхронны либо возвращают простые значения. Vitest их импортирует,
вызывает и проверяет возвращённое значение. Ни DOM, ни реестра кастомных элементов, ни
асинхронного жизненного цикла. Набор тестов компонента отрабатывает за пару сотен
миллисекунд и указывает ровно на ту функцию, что упала.

Второй выигрыш — переиспользование. `computeGeometry` тестируется на любой паре объектов
формы `DOMRect`, так что если алгоритм геометрии придётся перенести в другой компонент, он
не тащит за собой ни одной зависимости от Lit.

## Как применять

Когда граница ясна, разделение становится механическим. В классе остаётся:

- объявления `@property()` / `@state()`
- ссылки `@query` на узлы теневого DOM, которых не существует вне смонтированного элемента
- единственный контроллер `_ctl`, который ведёт жизненный цикл компонента
- однострочные методы жизненного цикла, делегирующие в контроллер или в свободные функции

Всё остальное — свободная функция в `src/element/`.

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

В контроллере лежит реальная логика, но он лишь оркеструет свободные функции:

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

Чистое ядро — `src/core/geometry.ts`, `src/core/focus.ts`, `src/core/dom.ts` — не содержит
импортов Lit. Vitest тестирует его напрямую:

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

Playwright покрывает смонтированный элемент целиком: клик по триггеру, проверка, что
всплывающее меню открывается, проверка ловушки фокуса и закрытия с клавиатуры. Он никогда
не тестирует арифметику геометрии или логику фокуса в изоляции, потому что Vitest уже
покрывает их без браузера.

## Антипаттерны

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

Симптом — покрытие юнит-тестами падает до нуля. `getBoundingClientRect()` в jsdom всегда
возвращает нули, так что любая проверка геометрии либо пропускается, либо бессмысленно
утверждает `0 === 0`. Единственной страховкой становится Playwright, а раз он работает
против браузера, обратная связь медленная. Регрессия геометрии тогда остаётся незамеченной
до самого CI.

```ts
// ❌ Multiple controllers: the element has grown a FocusController, a
//    GeometryController, an AnimationController, and a KeyboardController.
//    They share no agreed call order and each one monkey-patches the host.
private readonly _focusCtl  = new FocusController(this);
private readonly _geoCtl    = new GeometryController(this);
private readonly _animCtl   = new AnimationController(this);
private readonly _keyCtl    = new KeyboardController(this);
```

Контроллеры, которые складываются в один координатор, должны жить внутри единственного
контроллера, где каждая отдельная забота выражена свободной функцией, которую он вызывает.

## Контроль соблюдения

Считайте строки в классе элемента в CI. Оболочка, перевалившая за 60 строк вместе с
пробелами, — сигнал для ревью, что логика снова просачивается внутрь. Набор тестов Vitest
добавляет сверху механическую проверку: если покрытие `src/core/**` опускается ниже порога,
значит что-то, что должно быть свободной функцией, прячется внутри класса.

Это разделение работает в паре с правилом [одна функция на файл, папки по использованию](/principles/functional-architecture/one-function-per-file-folder-by-usage).
Каждая свободная функция в `src/core/` живёт в своём файле, названном по тому, что она
делает, поэтому граф импортов остаётся читаемым, а файл теста лежит рядом с исходником.

## Смотрите также

Функции геометрии, которые здесь тестируются в изоляции, зависят от измеренных значений
`DOMRect`, а не от захардкоженных размеров. Это ограничение разобрано в
[вычисляйте геометрию из измеренных размеров](/principles/web-components/measured-geometry-not-hardcoded).
Конфигурация декораторов, благодаря которой `@property()` и `@state()` продолжают корректно
работать при выносе полей класса, разобрана в
[legacy-декораторы Lit, и никогда ключевое слово accessor](/principles/web-components/lit-legacy-decorators-no-accessor).
