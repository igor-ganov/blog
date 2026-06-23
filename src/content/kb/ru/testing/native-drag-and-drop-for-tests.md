---
title: 'Используйте нативный HTML5 DnD, чтобы тесты могли им управлять'
category: testing
summary: 'Synthetic/pragmatic-библиотеки DnD не поддаются управлению из Playwright; собственный нативный HTML5 DnD работает и для пользователя, и для синтетической отправки событий, и заодно даёт клавиатурный запасной путь.'
principle: 'Pragmatic/synthetic-библиотеки drag-and-drop не поддаются управлению из Playwright (синтетические события не запускают их монитор нативного DnD); собственный нативный HTML5 DnD работает И для пользователя, И для синтетической отправки событий.'
severity: context
tags: [testing, playwright, drag-and-drop, accessibility, e2e]
sources:
  - project: 'клиентское приложение к Jira'
    date: 2026-06-08
    note: 'Pragmatic DnD не поддавался управлению из Playwright; заменили @atlaskit/pragmatic-drag-and-drop на собственный нативный HTML5 DnD с клавиатурным запасным путём Alt+↑/↓.'
related:
  - testing/event-driven-no-timeouts
  - testing/no-retries-no-flakes
order: 6
updated: 2026-06-08
---

В случае с drag-and-drop выбранная библиотека определяет, можно ли вообще протестировать
эту функцию. `@atlaskit/pragmatic-drag-and-drop` и похожие библиотеки запускают
собственный монитор перетаскивания поверх нативного DnD API, и этот монитор никогда не
реагирует на синтетические события `dragstart`, `dragover` и `drop` от Playwright. Он
срабатывает только тогда, когда браузер отправляет настоящие pointer-события от настоящего
жеста пользователя. `page.dragAndDrop()` из Playwright шлёт синтетические события,
библиотека их игнорирует, целевая зона не получает ничего — и карточка не двигается.

Решение — реализовать DnD на собственном HTML5 DnD API браузера. Нативный DnD одинаково
реагирует и на настоящие жесты пользователя, и на синтетическую отправку из Playwright.
Это обойдётся примерно в 150 строк ручной логики, а взамен вы получаете реализацию,
которую можно тестировать, которая доступна, не тянет лишнюю зависимость и целиком в
вашем распоряжении для изменений.

## Почему это важно

В клиентском приложении к Jira (2026-06-08) первая Kanban-доска вышла с
`@atlaskit/pragmatic-drag-and-drop`. Когда мы написали E2E-тесты на перемещение карточек,
`page.dragAndDrop(source, target)` не делал ничего. В тесте карточка не меняла колонку,
хотя в браузере тот же жест работал нормально. Собственный монитор pragmatic-библиотеки
не обрабатывает синтетические события.

Мы решили заменить библиотеку, а не обходить её, по трём причинам:

1. Функцию, которой не могут управлять тесты, нельзя подтвердить рабочей в CI. Правило
   трёх прогонов (см. [нет повторов, нет флаков](/principles/testing/no-retries-no-flakes))
   требует детерминированной проверки; реализация DnD, работающая только под настоящим
   указателем, проверке не поддаётся.

2. Клавиатурный запасной путь (`Alt+↑` / `Alt+↓` — переместить карточку вверх или вниз
   внутри колонки, `Alt+←` / `Alt+→` — между колонками) нужен пользователям, работающим
   только с клавиатуры. Библиотека не давала никакой поддержки клавиатуры; нативный DnD
   плюс обработчик `keydown` покрывают обе поверхности в одной реализации.

3. Отказ от библиотеки убрал внешнюю зависимость со своим циклом обновлений и весом в
   бандле.

Доска вышла с нативным DnD, оптимистичным обновлением, откатом при ошибке API и
клавиатурным запасным путём — встроенным как полноценное взаимодействие.

## Как применять

**1. Помечайте перетаскиваемые элементы атрибутом `draggable` и подключайте нативные события.**

```ts
// ❌ Library-based DnD — Playwright cannot drive this
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

connectedCallback(): void {
  this.cleanup = draggable({
    element: this,
    onDrop: ({ location }) => this.handleDrop(location),
  });
}

// ✅ Native HTML5 DnD — Playwright's page.dragAndDrop works
protected override render(): unknown {
  return html`
    <article
      draggable="true"
      data-testid=${BOARD.card(this.ticketId)}
      @dragstart=${this.onDragStart}
      @dragend=${this.onDragEnd}
    >
      ${this.ticketId}
    </article>
  `;
}

private readonly onDragStart = (e: DragEvent): void => {
  e.dataTransfer?.setData('text/plain', this.ticketId);
  e.dataTransfer?.setData('application/x-ticket-id', this.ticketId);
};
```

**2. Обрабатывайте drop на колонке, а не на каждой карточке.**

```ts
// Column component wires dragover + drop at the container level
protected override render(): unknown {
  return html`
    <section
      data-testid=${BOARD.column(this.status)}
      @dragover=${this.onDragOver}
      @drop=${this.onDrop}
    >
      <slot></slot>
    </section>
  `;
}

private readonly onDragOver = (e: DragEvent): void => {
  e.preventDefault(); // required to allow drop
  e.dataTransfer!.dropEffect = 'move';
};

private readonly onDrop = async (e: DragEvent): Promise<void> => {
  e.preventDefault();
  const ticketId = e.dataTransfer?.getData('application/x-ticket-id');
  if (!ticketId) return;

  // Optimistic update — move the card immediately in local state
  this.dispatchEvent(
    new CustomEvent('ticket-move', {
      bubbles: true,
      detail: { ticketId, toStatus: this.status },
    }),
  );
};
```

**3. Добавьте клавиатурный запасной путь через `keydown`.**

```ts
// In the card component: Alt+↑/↓ within column, Alt+←/→ between columns
private readonly onKeyDown = (e: KeyboardEvent): void => {
  if (!e.altKey) return;
  const direction = KEY_TO_DIRECTION[e.key]; // ↑ ↓ ← →
  if (!direction) return;
  e.preventDefault();
  this.dispatchEvent(
    new CustomEvent('ticket-move-keyboard', {
      bubbles: true,
      detail: { ticketId: this.ticketId, direction },
    }),
  );
};
```

Клавиатурный путь задействует ту же логику приложения, что и путь через указатель, поэтому
пара тестов покрывает обе поверхности:

```ts
test('moves card to Done via drag', async ({ page }) => {
  await page.goto('/board');
  await page.dragAndDrop(
    page.getByTestId(BOARD.card('PROJ-1')),
    page.getByTestId(BOARD.column('Done')),
  );
  await expect(page.getByTestId(BOARD.column('Done'))).toContainText('PROJ-1');
  await expect(page.getByTestId(BOARD.column('In Progress'))).not.toContainText('PROJ-1');
});

test('moves card to Done via keyboard', async ({ page }) => {
  await page.goto('/board');
  await page.getByTestId(BOARD.card('PROJ-1')).focus();
  await page.keyboard.press('Alt+ArrowRight'); // In Progress → Done
  await expect(page.getByTestId(BOARD.column('Done'))).toContainText('PROJ-1');
});
```

**4. Используйте детерминированный стенд для слоя API.**

Доска использовала `E2E_TEST_MODE` с mock-адаптером Jira и эндпоинтом `/test/seed-session`,
чтобы засеивать состояние доски перед каждым тестом. Это снимает зависимость от живого
инстанса Jira и делает тесты независимыми от внешнего состояния.

```ts
// playwright.config.ts — sets E2E_TEST_MODE for the dev server
export default defineConfig({
  webServer: {
    command: 'E2E_TEST_MODE=1 bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});

// e2e/helpers/seed.ts
export const seedBoard = async (page: Page, tickets: Ticket[]): Promise<void> => {
  await page.request.post('/test/seed-session', { data: { tickets } });
};
```

## Антипаттерны

```ts
// ❌ Wrapping Playwright's mouse API to simulate drag manually.
//    This triggers mousemove/mousedown but not dragstart/dragover/drop;
//    the library monitor still does not see it.
await page.mouse.move(card.x, card.y);
await page.mouse.down();
await page.mouse.move(target.x, target.y, { steps: 10 });
await page.mouse.up();

// ❌ Injecting a script to fire synthetic DragEvent from inside the page.
//    Synthetic events from page.evaluate() are not trusted events; the browser
//    DnD pipeline ignores untrusted dragstart.
await page.evaluate(([src, tgt]) => {
  const evt = new DragEvent('dragstart', { bubbles: true });
  src.dispatchEvent(evt);
}, [sourceHandle, targetHandle]);

// ❌ Skipping the DnD test entirely because it's "hard to automate".
//    A feature that cannot be tested is a feature that cannot be confirmed working.
test.skip('moves card between columns', async () => { /* TODO */ });
```

Подо всем этим лежит одно ограничение: настоящему DnD нужны trusted-события, которые
браузер генерирует в ответ на настоящий жест указателя. Библиотеки, которые встраиваются
в этот конвейер (pragmatic-dnd, монитор react-beautiful-dnd, слой сенсоров dnd-kit),
наследуют это ограничение и становятся непроверяемыми под синтетической отправкой
Playwright. Нативный HTML5 DnD обходит его, потому что `draggable`, `dragstart`,
`dragover` и `drop` — это стандартные DOM-события, которые Playwright отправляет как
trusted-события через `page.dragAndDrop`.

## Смотрите также

Детерминированный стенд (`E2E_TEST_MODE`, засеянное состояние, mock-адаптер) держится на
том же принципе, что и стратегии ожидания из
[событийных ожиданий](/principles/testing/event-driven-no-timeouts): тест не должен зависеть от
тайминга, внешних сервисов или любого другого недетерминированного входа. Клавиатурный
запасной путь доски добавили ради доступности, а он заодно работает как второй вектор
тестирования без лишних затрат.
