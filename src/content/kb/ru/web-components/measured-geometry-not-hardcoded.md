---
title: 'Вычисляйте геометрию из измеренных размеров, а не из констант'
category: web-components
summary: 'Позиция и размер берутся из измеренных прямоугольников элементов, поэтому компонент не зависит от содержимого; защищайте измерения у краёв вьюпорта, чтобы поведение shrink-to-fit при fixed-позиционировании их не испортило.'
principle: 'Позиция и размер берутся из измеренных прямоугольников элементов, поэтому компонент не зависит от содержимого; защищайте измерение у краёв вьюпорта.'
severity: strong
tags: [lit, web-components, geometry, positioning, css, accessibility]
sources:
  - project: 'headless-библиотека веб-компонентов'
    date: 2026-06-06
    note: 'Геометрия из измеренных размеров; max-content-обёртки у края; привязка к углам и размещение попапа с учётом краёв.'
related:
  - web-components/lit-functional-core
order: 2
updated: 2026-06-10
---

Захардкоженные пиксельные значения в алгоритме позиционирования — это ставка на то,
что содержимое никогда не изменится, и эта ставка проигрывает. FAB (плавающая кнопка
действия), записанная как «48 px шириной», остаётся верной ровно до тех пор, пока кто-то
не поменяет иконку, не добавит подпись или пользователь не увеличит системный размер
шрифта. После этого меню налезает на свой триггер или оставляет зазор, и чтобы это
поправить, придётся менять код, а не стиль.

Поэтому договор простой: **каждая координата выводится из живого вызова
`getBoundingClientRect()`, а не из константы**. Headless-библиотека веб-компонентов
(2026-06-06) закрепляет это в коде позиционирования и добавляет одно ограничение,
которое большинство компонентов упускает. Любая обёртка, которую вы собираетесь
измерять, должна объявить `width: max-content; height: max-content` до измерения, иначе
поведение shrink-to-fit при `position: fixed` схлопнет её до нуля и вы получите мусорную
геометрию.

## Почему это важно

Сбой коварный. Элемент с `position: fixed`, размер которого явно не задан, схлопывается
по содержимому при первой отрисовке. Если измерить его до того, как браузер разложит это
содержимое (а именно так и происходит, когда вы вызываете `getBoundingClientRect()`
внутри `connectedCallback` или в начале `hostUpdated`), вернувшийся прямоугольник придёт
с нулевыми шириной и высотой. Алгоритм позиционирования тогда поставит попап в
координаты, которые были бы верны для элемента нулевого размера и неверны для реального.
Заметите вы это только у краёв вьюпорта, где срабатывает эвристика переворота, поэтому
оно проскакивает обычное тестирование и всплывает уже в продакшене, рядом с углами.

Исправление в библиотеке компонентов состояло в том, чтобы задать
`width: max-content; height: max-content` на обёртке попапа в теневых стилях компонента
перед измерением. Это заставляет браузер сначала растянуть попап по содержимому, так что
прямоугольник становится надёжным, где бы на странице компонент ни находился.

Измерять нужно ещё кое-что — триггер, а не только попап. Размер триггера, сохранённый
в момент монтирования, устаревает в ту же секунду, когда меняется слотированное
содержимое: появляется подпись, меняется иконка или сдвигается адаптивный размер шрифта.
Перемеряйте оба прямоугольника при каждом открытии.

## Как применять

Объявите `max-content`-размер на обёртке, которую будете измерять, вызовите
`getBoundingClientRect()` и на триггере, и на попапе после открытия, а затем передайте
эти прямоугольники в чистую функцию, которая занимается привязкой к краям.

```ts
// src/element/floating-menu-element.ts (shadow styles)
static override styles = css`
  :host {
    display: inline-block;
    position: relative;
  }

  .menu-popup {
    position: fixed;
    /* max-content prevents shrink-to-fit before measurement */
    width: max-content;
    height: max-content;
    /* hidden until positioned; visibility not display so the rect is non-zero */
    visibility: hidden;
    pointer-events: none;
  }

  .menu-popup.placed {
    visibility: visible;
    pointer-events: auto;
  }
`;
```

После того как Lit отрисует открытое состояние, измеряем и размещаем:

```ts
// src/element/floating-menu-controller.ts
private _position(): void {
  const popup = this.host.shadowRoot?.querySelector<HTMLElement>('.menu-popup');
  const trigger = this.host.querySelector('[slot="trigger"]');
  if (!popup || !trigger) return;

  // Remove 'placed' so visibility is hidden during measurement,
  // ensuring the popup is in the layout without being shown.
  popup.classList.remove('placed');

  const triggerRect = trigger.getBoundingClientRect();
  const popupRect   = popup.getBoundingClientRect();   // reliable: max-content sized

  const geo = computeGeometry(triggerRect, popupRect, this.host.placement);
  applyGeometry(popup, geo);

  popup.classList.add('placed');
}
```

Чистая функция геометрии занимается привязкой к краям, ничего не зная о DOM:

```ts
// src/core/geometry.ts
export interface Geometry {
  readonly top: number;
  readonly left: number;
}

const VIEWPORT_MARGIN = 8; // px to stay clear of the viewport edge

export const computeGeometry = (
  trigger: DOMRect,
  popup: DOMRect,
  placement: 'top' | 'bottom' | 'auto',
): Geometry => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceBelow = vh - trigger.bottom;
  const spaceAbove = trigger.top;

  const placeBelow =
    placement === 'bottom' ||
    (placement === 'auto' && spaceBelow >= popup.height + VIEWPORT_MARGIN) ||
    spaceAbove < popup.height + VIEWPORT_MARGIN;

  const rawTop  = placeBelow ? trigger.bottom : trigger.top - popup.height;
  const rawLeft = trigger.left;

  // Edge-snap: keep the popup inside the viewport with a margin.
  const top  = Math.max(VIEWPORT_MARGIN, Math.min(rawTop,  vh - popup.height - VIEWPORT_MARGIN));
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rawLeft, vw - popup.width  - VIEWPORT_MARGIN));

  return { top, left };
};

// src/core/dom.ts
export const applyGeometry = (el: HTMLElement, geo: Geometry): void => {
  el.style.top  = `${geo.top}px`;
  el.style.left = `${geo.left}px`;
};
```

Поскольку `computeGeometry` зависит только от двух значений в форме `DOMRect` и размеров
вьюпорта, Vitest может проверить каждый граничный случай без браузера, конструируя
синтетические прямоугольники и подменяя `window.innerWidth` / `window.innerHeight`:

```ts
// src/core/geometry.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeGeometry } from './geometry.js';

const rect = (x: number, y: number, w: number, h: number): DOMRect =>
  ({ x, y, left: x, top: y, width: w, height: h,
     right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;

afterEach(() => vi.restoreAllMocks());

const mockViewport = (w: number, h: number): void => {
  vi.spyOn(window, 'innerWidth',  'get').mockReturnValue(w);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(h);
};

describe('computeGeometry', () => {
  it('places the menu below when there is space', () => {
    mockViewport(1024, 768);
    const geo = computeGeometry(rect(100, 200, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.top).toBe(240);  // trigger.bottom
    expect(geo.left).toBe(100);
  });

  it('flips above when insufficient space below', () => {
    mockViewport(1024, 600);
    // trigger.bottom = 560, spaceBelow = 40, popup.height = 80 → flip
    const geo = computeGeometry(rect(100, 520, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.top).toBe(440);  // trigger.top - popup.height
  });

  it('clamps to viewport left edge', () => {
    mockViewport(1024, 768);
    // trigger at x=4 → rawLeft=4, clamp to margin=8
    const geo = computeGeometry(rect(4, 100, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.left).toBe(8);
  });

  it('clamps to viewport right edge', () => {
    mockViewport(200, 768);
    // trigger at x=100, popup.width=120 → rawLeft=100, max=200-120-8=72
    const geo = computeGeometry(rect(100, 100, 60, 40), rect(0, 0, 120, 80), 'auto');
    expect(geo.left).toBe(72);
  });
});
```

Каждый тест выполняется меньше чем за миллисекунду, без монтирования DOM.

## Антипаттерны

```ts
// ❌ Hardcoded FAB size. When the icon changes from 24px to 32px or the
//    label "More" is added, all placement math is wrong.
const FAB_SIZE = 48;
const top = buttonTop + FAB_SIZE + 8;
const left = buttonLeft;
applyGeometry(popup, { top, left });
```

```ts
// ❌ Measuring a fixed-position element before declaring its intrinsic size.
//    getBoundingClientRect() may return { width: 0, height: 0 } during the
//    first render pass, causing the popup to land at the wrong coordinates.
const popupRect = popup.getBoundingClientRect(); // possibly zeros
const geo = computeGeometry(triggerRect, popupRect, 'auto');
// → popup placed as if it has no size → wrong near edges
```

```ts
// ❌ Storing the trigger size at mount time and reusing it on open.
//    Slotted content can change between mount and open; stale measurements
//    cause misalignment whenever the trigger is dynamically resized.
override connectedCallback(): void {
  super.connectedCallback();
  this._cachedTriggerRect = this.querySelector('[slot="trigger"]')
    ?.getBoundingClientRect();
}

openMenu(): void {
  this.open = true;
  // uses this._cachedTriggerRect — stale if trigger content changed
}
```

## См. также

Тесты геометрии выше работают только потому, что `computeGeometry` — это чистая свободная
функция, вынесенная из класса элемента. Такая организация описана в статье
[Lit-элемент — это тонкая оболочка над чистым ядром](/kb/web-components/lit-functional-core).
