---
title: 'ARIA на настоящем интерактивном элементе, а не на обёртке'
category: web-components
summary: 'Вешайте ARIA на реальную кнопку — переданную через слот или настоящую, а не на обёртку-div без роли; и называйте публичные методы по тому, что они делают, потому что отражаемые атрибуты вроде `open` не должны перекрываться одноимённым методом.'
principle: 'Вешайте ARIA на реальную/слотовую кнопку, а не на обёртку без роли; называйте методы по их действию, потому что атрибуты вроде `open` отражаются.'
severity: strong
tags: [lit, web-components, accessibility, aria, reflected-attributes, api-design]
sources:
  - project: 'headless-библиотека веб-компонентов'
    date: 2026-06-06
    note: 'ARIA на слотовой кнопке; openMenu/closeMenu, потому что open — отражаемый атрибут.'
related:
  - web-components/lit-functional-core
  - testing/aria-label-test-locator-hygiene
order: 3
updated: 2026-06-10
---

Веб-компонент оборачивает настоящий интерактивный контент, поэтому кастомный элемент
выглядит подходящим местом, чтобы повесить на него `role` и `aria-*`. Не делайте этого.
Обёртка без роли, на которой висит ARIA, обманывает дерево доступности: элемент, который
озвучивает скринридер, — это не тот элемент, который получает фокус и события клавиатуры.

В тех же кодовых базах встречается ещё одна ошибка: публичный метод называют `open()`,
когда у компонента уже есть поле `@property({ reflect: true }) open`. В JavaScript метод
и свойство борются за один и тот же слот имени на прототипе. Метод перекрывает отражаемый
атрибут, `this.open = true` перестаёт работать снаружи, и баг остаётся невидимым, пока
кто-нибудь не напишет тест, который управляет компонентом через его атрибут.

Оба случая всплыли в headless-библиотеке веб-компонентов (2026-06-06) и были там
исправлены.

## Почему это важно

**Доступность.** Вычисление доступного имени для интерактивного элемента смотрит на тот
элемент, что несёт `role="button"` (или на нативный `<button>`), и разрешает
`aria-label`, `aria-labelledby` или текстовое содержимое относительно него. Повесьте
`aria-label="Open menu"` на обёртку-`<div>` без роли — и метка прицепится к чему-то,
что дерево доступности вообще не показывает как интерактивное, а вложенный `<button>`
останется своим собственным неподписанным интерактивным узлом. На выходе два узла: у обёртки
есть метка, но нет роли, а у кнопки есть роль, но нет метки.

Скринридеры справляются с этим по-разному. VoiceOver на macOS часто читает текст обёртки,
а затем перечитывает кнопку как неподписанный контрол; NVDA на Windows может пропустить
обёртку целиком. Безопасное правило — вешать **ARIA на тот элемент, который получает
фокус**.

**Перекрытие отражаемого атрибута.** Свойство `LitElement`, помеченное
`@property({ reflect: true })`, живёт на экземпляре элемента, а одноимённый метод — на
прототипе. При чтении собственные (экземплярные) свойства побеждают прототипные, поэтому
`element.open` возвращает булево значение. Присваивание `element.open = true` запускает
сеттер Lit-свойства, который Lit устанавливает через `Object.defineProperty` в цепочке
прототипов. Добавьте в тело класса метод `open()` — и компилятор выдаст его на прототипе;
при некоторых целях TypeScript и преобразованиях декораторов этот метод затирает
дескриптор свойства. Теперь `element.open = true` больше не запускает `requestUpdate`, и
компонент выглядит замороженным.

Лечится это именованием. Метод, переводящий в открытое состояние, называется `openMenu()`,
переводящий в закрытое — `closeMenu()`, а удобная обёртка — `toggle()`. Так отражаемый
атрибут `open` остаётся наблюдаемым состоянием, а методы — императивными командами.

## Как применять

**ARIA на настоящей кнопке.** Передайте триггер через слот и добавьте ARIA на слотовый
элемент в месте вызова, либо пробросьте ARIA через `aria-controls` / `aria-expanded` на
элементе-триггере внутри компонента.

```html
<!-- ✅ At the call site: ARIA on the real button inside the slot -->
<floating-menu>
  <button slot="trigger" aria-label="Open actions menu" aria-haspopup="true">
    <svg aria-hidden="true"><!-- icon --></svg>
  </button>
  <menu-item>Edit</menu-item>
  <menu-item>Delete</menu-item>
</floating-menu>
```

Сам компонент держит `aria-expanded` в синхроне с состоянием `open`, отражая его на
слотовый триггер:

```ts
// src/element/floating-menu-controller.ts
private _syncAriaExpanded(): void {
  const trigger = this.host.querySelector<HTMLElement>('[slot="trigger"]');
  if (trigger) {
    trigger.setAttribute('aria-expanded', String(this.host.open));
  }
}

// Called from hostUpdated() after every render cycle:
hostUpdated(): void {
  this._syncAriaExpanded();
  if (this.host.open) this._position();
}
```

Всплывающий блок получает `role="menu"` в shadow-шаблоне, а от каждого пункта ожидается
`role="menuitem"`. Компонент документирует этот контракт, но не навязывает его, поскольку
слотовым содержимым и его ролями владеет вызывающая сторона.

**Именование, чтобы избежать перекрытия атрибута.** Публичный API использует
глагольные фразы, а не зеркала атрибутов:

```ts
// src/element/floating-menu-element.ts

// ✅ Reflected attribute — the observable boolean state on the element.
@property({ type: Boolean, reflect: true }) open = false;

// ✅ Named methods that do not shadow the attribute.
openMenu(): void  { this._ctl.open(); }
closeMenu(): void { this._ctl.close(); }
toggle(): void    { this._ctl.toggle(); }
```

```ts
// Usage from outside:
const menu = document.querySelector('floating-menu');

// ✅ Read the reflected attribute — works correctly.
console.log(menu.open); // false

// ✅ Transition via a named method.
menu.openMenu();
console.log(menu.open); // true

// ✅ Or set the attribute directly (Lit's property setter fires requestUpdate).
menu.open = false;
```

Тест, покрывающий оба пути:

```ts
// e2e/floating-menu.spec.ts (Playwright)
test('opens via openMenu() and reflects the attribute', async ({ page }) => {
  await page.goto('/demo');

  const menu = page.locator('floating-menu');
  await expect(menu).not.toHaveAttribute('open');

  await menu.evaluate((el: HTMLElement & { openMenu(): void }) => el.openMenu());
  await expect(menu).toHaveAttribute('open', '');
});

test('trigger button has aria-expanded synced to open state', async ({ page }) => {
  await page.goto('/demo');

  const trigger = page.locator('floating-menu [slot="trigger"]');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await page.locator('floating-menu').evaluate(
    (el: HTMLElement & { openMenu(): void }) => el.openMenu(),
  );
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});
```

## Антипаттерны

```html
<!-- ❌ ARIA on the custom element wrapper — no role, so the label floats
         disconnected from any interactive context. -->
<floating-menu aria-label="Actions menu">
  <button slot="trigger">
    <svg aria-hidden="true"><!-- icon --></svg>
  </button>
</floating-menu>
```

```ts
// ❌ Method named `open()` shadows the reflected `open` property.
//    After this declaration, `element.open = true` may stop triggering
//    reactivity depending on how the decorator transform resolves.
@customElement('floating-menu')
export class FloatingMenuElement extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;

  // This method name collides with the `open` property.
  open(): void {   // TypeScript will actually error here, but JS won't.
    this.open = true;
  }
}
```

```ts
// ❌ aria-expanded placed on the popup instead of the trigger.
//    Screen readers expect `aria-expanded` on the control that activates the
//    popup (the trigger), not on the popup itself.
hostUpdated(): void {
  const popup = this.host.shadowRoot?.querySelector('.menu-popup');
  popup?.setAttribute('aria-expanded', String(this.host.open)); // wrong element
}
```

## Как обеспечить соблюдение

Нарушения доступности лучше всего ловить с помощью `axe-core`, встроенного в набор тестов
Playwright. Пакет `@axe-core/playwright` от Deque умеет проверять, что на демо-странице нет
ни одного нарушения, в каждом браузере:

```ts
// e2e/accessibility.spec.ts
import AxeBuilder from '@axe-core/playwright';

test('no axe violations on the demo page', async ({ page }) => {
  await page.goto('/demo');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toHaveLength(0);
});
```

Статья `aria-label-test-locator-hygiene` рассказывает про использование ARIA-атрибутов как
стабильных локаторов в тестах. Те же метки, что служат доступности, служат и набору тестов,
так что есть смысл разместить их на правильном элементе.

## Смотрите также

Синхронизация `aria-expanded` в `hostUpdated` — это делегат жизненного цикла контроллера,
описанного в статье [Lit-элемент — тонкая оболочка над чистым ядром](/principles/web-components/lit-functional-core).
Взаимодействие отражаемых свойств с преобразованиями декораторов TypeScript разобрано в
статье [Lit legacy-декораторы — никогда ключевое слово accessor](/principles/web-components/lit-legacy-decorators-no-accessor).
