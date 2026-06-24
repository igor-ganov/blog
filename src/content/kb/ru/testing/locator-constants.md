---
title: 'Константы локаторов рядом с компонентом'
category: testing
summary: 'E2E-локаторы живут в файле констант рядом с компонентом, и на них ссылаются и в разметке компонента, и в тестах — а не дублируют строковые литералы.'
principle: 'E2E-локаторы живут в файле констант рядом с компонентом, и на них ссылаются как в компоненте (как test id / атрибуты), так и в тестах — никаких продублированных строковых селекторов.'
severity: strong
tags: [testing, playwright, e2e, locators, components]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'Используйте константы в отдельном файле рядом с компонентом; ссылайтесь на них и в самом компоненте.'
related:
  - testing/aria-label-test-locator-hygiene
  - web-components/lit-functional-core
order: 3
updated: 2026-06-02
---

Строка `data-testid="toc-toggle"` в компоненте и та же строка, скопированная
в тест, — это два независимых факта, которые делают вид, что описывают одно и то же.
Поменяйте test id в компоненте — и сдвинется только одна из двух строк. Повезёт — тест
упадёт на прогоне; не повезёт — компонент никто не трогает, и рассинхрон тихо лежит на
месте. Узнаёте вы об этом в CI, а не в редакторе.

Исправление механическое. Запишите строку один раз — в файле констант рядом с
компонентом, — и пусть и компонент, и тест её импортируют. Теперь она не разъедется.

## Почему это важно

Инженерный стандарт (2026-06-02) формулирует это прямо: держите константы в отдельном
файле рядом с компонентом и ссылайтесь на них в том числе из самого компонента.

Этот блог придерживается такого подхода по всему слою веб-компонентов. У `toc-drawer` и
`kb-filter` есть собственный сосед `.locators.ts`:

```
src/components/islands/
  toc-drawer.ts              ← component
  toc-drawer.locators.ts     ← constants exported as const
  toc-drawer.styles.ts
  kb-filter.ts
  kb-filter.locators.ts
```

`toc-drawer.locators.ts` экспортирует:

```ts
export const TOC_DRAWER = {
  tag: 'toc-drawer',
  toggle: 'toc-toggle',
  panel: 'toc-panel',
  close: 'toc-close',
  backdrop: 'toc-backdrop',
} as const;
```

`kb-filter.locators.ts` экспортирует:

```ts
export const KB_FILTER = {
  tag: 'kb-filter',
  input: 'kb-filter-input',
  count: 'kb-filter-count',
  empty: 'kb-filter-empty',
  chip: 'kb-filter-chip',
  chipTag: 'data-tag',
  item: 'data-kb-item',
  haystack: 'data-haystack',
  itemTags: 'data-tags',
} as const;
```

Компонент `toc-drawer.ts` импортирует из своего соседа и подставляет `TOC_DRAWER.tag`
как имя кастомного элемента, а `TOC_DRAWER.toggle` — в `data-testid`. Тест делает тот же
импорт и вызывает `page.getByTestId(TOC_DRAWER.toggle)`. Поменяйте константу — и
TypeScript подсветит каждую ссылку в одном и том же проходе компиляции.

## Как применять

**1. Создайте `<name>.locators.ts` рядом с компонентом.**

```ts
// src/components/notifications/notifications-badge.locators.ts
export const NOTIFICATIONS_BADGE = {
  tag: 'notifications-badge',
  indicator: 'notifications-badge-indicator',
  count: 'notifications-badge-count',
} as const;
```

Используйте `as const`, чтобы значения сузились до своих литеральных типов. Тогда вызывающий
код может деструктурировать или индексировать их, не теряя строковый литерал.

**2. Импортируйте константы в компонент и используйте их в шаблоне.**

```ts
// src/components/notifications/notifications-badge.ts
import { html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { NOTIFICATIONS_BADGE } from './notifications-badge.locators';

@customElement(NOTIFICATIONS_BADGE.tag)
export class NotificationsBadge extends LitElement {
  @state() private count = 0;

  protected override render(): unknown {
    return html`
      <button
        type="button"
        data-testid=${NOTIFICATIONS_BADGE.indicator}
        aria-label="Notifications: ${this.count} unread"
      >
        <span data-testid=${NOTIFICATIONS_BADGE.count}>${this.count}</span>
      </button>
    `;
  }
}
```

**3. Импортируйте те же константы в E2E-тест.**

```ts
// e2e/notifications.spec.ts
import { test, expect } from '@playwright/test';
import { NOTIFICATIONS_BADGE } from '../src/components/notifications/notifications-badge.locators';

test('shows unread count', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByTestId(NOTIFICATIONS_BADGE.indicator),
  ).toBeVisible();
  await expect(
    page.getByTestId(NOTIFICATIONS_BADGE.count),
  ).toHaveText('3');
});
```

В тесте никогда не встречается строка `'notifications-badge-indicator'` как литерал. Она
есть только в файле констант. Переименование id — это правка одного файла, а компилятор
TypeScript разносит и проверяет её по всему проекту.

## Антипаттерны

```ts
// ❌ Duplicated string literals — the component and the test are now out of sync
//    the moment either changes independently.

// In the component:
html`<button data-testid="notif-indicator">`;

// In the test:
page.getByTestId('notif-indicator'); // copied from memory — will drift

// ❌ Inline attribute strings with no shared source of truth
page.locator('[data-testid="kb-filter-input"]'); // bypasses the constant entirely

// ❌ Constants file placed far from the component — in a shared/test-ids.ts or similar.
//    This breaks colocation. When a component moves, the constants do not follow.
//    When a component is deleted, orphan constants accumulate.

// ❌ Relying on role + text selectors for everything when a stable test id would
//    be more precise.  Role locators are excellent for accessibility assertions but
//    fragile as primary navigation anchors — the accessible name is user-visible copy
//    that gets translated, revised, and A/B-tested.  See
//    testing/aria-label-test-locator-hygiene for when aria-label matching is fine and
//    when it is a trap.
```

Отсутствующие константы проявляются как падения тестов, похожие на опечатки. Локатор
находит ноль элементов, проверка падает, а причина — строка, которую поменяли в одном
месте и не поменяли в другом. До прогона ничего не всплывает, и дифф вам ничего не
подскажет.

## Контроль

Большую часть контроля берёт на себя компилятор TypeScript. Когда константа типизирована
через `as const`, обращение к несуществующему ключу (`NOTIFICATIONS_BADGE.indicatr`) — это
ошибка компиляции, а не сюрприз на прогоне. Подход также держит область поиска узкой:
`grep -r 'data-testid=' src/` должен попадать только в файлы компонентов, но не в тесты.

На код-ревью проверяйте:

- Каждое значение `data-testid` в шаблоне компонента берётся из импортированной константы.
- Соответствующий файл `.locators.ts` лежит в той же директории, что и компонент.
- Тесты импортируют константы локаторов; в них нет строковых литералов для `data-testid`.
