---
title: 'Никаких повторов, никаких флаков — три зелёных прогона или код сломан'
category: testing
summary: 'Набор тестов с включёнными повторами или пропущенный тест — это сломанный набор; либо три чистых прогона подряд, либо переделывай архитектуру.'
principle: 'Никогда не настраивай повторы тестов. Прогоняй набор три раза; если хоть один прогон упал — код сломан и переписывается. Флакающий или пропущенный тест — это упавший тест.'
severity: non-negotiable
tags: [testing, playwright, e2e, determinism, ci]
sources:
  - project: 'десктопный UI-инструмент'
    date: 2026-03-12
    note: 'Никаких повторов вообще; прогоняй тесты 3 раза, любое падение означает, что код сломан; если архитектура не может гарантировать детерминированное поведение — архитектура неверна, переделывай.'
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'Никакого программного исключения тестов; финальное подтверждение требует полного стабильного прогона; тесты должны проходить во всех заданных браузерах.'
related:
  - testing/event-driven-no-timeouts
  - process/prove-with-production-screenshots
order: 2
updated: 2026-06-02
---

Повтор не чинит тест. Он прячет падение ровно настолько, чтобы CI стал зелёным, а
гонка, которую он замаскировал, уезжает прямиком в прод. `retries: 2` в
`playwright.config.ts` — это не настройка надёжности. Это способ для упавшего набора
отрапортовать о себе как о прошедшем.

Правило грубое. **Настрой ноль повторов, прогони набор три раза подряд, и
если хоть один прогон упал — код сломан.** Тест, которому нужен второй шанс,
уже сообщает о реальном дефекте, а повтор просто заглушает этот сигнал.

## Почему это важно

Стандарт «без повторов» появился на десктопном UI-инструменте (2026-03-12) с прямой
формулировкой: прогоняй тесты три раза; любое падение означает, что код сломан; если
архитектура не может гарантировать детерминированное поведение — архитектура неверна, так
что переделывай её. Повторы как смягчение вообще не рассматривались. Зелёный CI с повторами
— это не зелёный CI.

Это «абсолютно», а не «минимизируй повторы», потому что повтор меняет
*экономику* отладки. Без повторов флакающий тест громко падает на первом плохом прогоне
и блокирует мердж. Включи повторы — и тот же флак падает изредка, иногда в
проде в два часа ночи, к которому моменту стектрейс уже не указывает на тест. Повтор
убрал единственный сигнал, который поймал бы гонку, пока её ещё дёшево чинить.

Инженерный стандарт столь же прямолинеен (2026-06-02):

- Программное исключение тестов запрещено.
- Единственное определение «зелёного» — полный стабильный прогон.
- Тесты должны проходить во **всех** заданных браузерах, а не только в Chromium.
- Никаких хаков под конкретный браузер. Если Chromium проходит, а WebKit нет — значит,
  приложение ведёт себя по-разному на WebKit, и эта разница и есть баг.

Стандарт цикла разработки фиксирует это как воротину PR: **флакающие или пропущенные тесты
запрещены.** PR с `test.skip` или с тестом, припаркованным в списке grep-исключений, не
готов к мерджу, насколько бы законченной ни была фича.

## Как применять

**Шаг 1: ноль повторов в конфиге.**

```ts
// ❌ playwright.config.ts — retries hide races
import { defineConfig } from '@playwright/test';

export default defineConfig({
  retries: 2, // masks flakes; remove this entirely
  use: { baseURL: 'http://localhost:4321' },
});

// ✅ playwright.config.ts — zero retries, failures are honest
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // retries field absent — defaults to 0
  use: { baseURL: 'http://localhost:4321' },
});
```

**Шаг 2: никакого программного исключения тестов.**

```ts
// ❌ Skipping because it "sometimes fails" — this is a failing test
test.skip('navigates to /settings after save', async ({ page }) => {
  // ...
});

// ❌ Conditional skip by browser — if it only fails on WebKit, fix the app
test('drag card to Done', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'TODO: fix DnD on WebKit');
  // ...
});

// ❌ Grep exclusion in CI script — hiding tests from the runner is the same as skip
// bun run playwright --grep-invert "drag card"

// ✅ The test runs, it passes, on every browser, every time
test('drag card to Done', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByTestId(BOARD.card('PROJ-1'))).toBeVisible();
  // drive DnD with native events — see testing/native-drag-and-drop-for-tests
  await dragCard(page, 'PROJ-1', 'Done');
  await expect(page.getByTestId(BOARD.column('Done'))).toContainText('PROJ-1');
});
```

**Шаг 3: дисциплина трёх прогонов в CI.**

Прогоняй полный набор три раза подряд в пайплайне. Любой упавший прогон роняет
сборку. Это единственная планка приёмки.

```yaml
# .github/workflows/ci.yml (excerpt)
- name: E2E — run 1/3
  run: bun run playwright
- name: E2E — run 2/3
  run: bun run playwright
- name: E2E — run 3/3
  run: bun run playwright
```

Прогон трижды ловит гонку, которая всплывает примерно раз в три прогона и которую
одиночный прогон спокойно пропустит. Три чистых прогона подряд дают достаточно уверенности в
стабильности набора, чтобы мерджить.

**Шаг 4: когда тест начал флакать, относись к нему как к блокирующему дефекту.**

Протокол разбора такой:

1. Воспроизведи локально через `--repeat-each=10`. Если падает хоть раз из десяти — гонка реальна.
2. Сними трассу: `bun run playwright --trace on`. Открой её в вьюере и прочитай
   таймлайн событий — что сработало, в каком порядке и где упало ожидание.
3. Найди первопричину: пропущенное ожидание, неправильный сигнал ожидания или гонка в
   коде приложения. Правильную стратегию ожидания смотри в
   [event-driven-no-timeouts](/kb/testing/event-driven-no-timeouts).
4. Почини первопричину. Не включай повторы обратно как костыль.

## Антипаттерны

```ts
// ❌ Project-level retries. The suite will look green while hiding real failures.
export default defineConfig({ retries: process.env.CI ? 2 : 0 });

// ❌ test.fixme — also a skip; it marks a test as expected-to-fail rather than fixing it
test.fixme('modal closes on Escape', async ({ page }) => { /* ... */ });

// ❌ Suppressing output to avoid seeing failures in the terminal
export default defineConfig({ reporter: [['dot']] }); // with retries, dots lie

// ❌ Running only chromium in CI to avoid cross-browser failures
export default defineConfig({
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // webkit and firefox removed because "they're slow" — they catch real bugs
});
```

Каждый из них даёт один и тот же симптом. CI показывает зелёный, пока прод тащит гонки,
которые всплывают только под нагрузкой или в одном конкретном браузере, а первопричина
остаётся невидимой, потому что набор был настроен перестать о ней сообщать.

## Принуждение

Принуждение живёт в самом CI-пайплайне: ноль повторов в конфиге, три
последовательных прогона обязательны, любое падение блокирует сборку. Ни одно правило
линтера не ловит подавленный тест во всех его формах, так что ревью кода всё равно должно
проверить несколько вещей вручную:

- `retries` отсутствует в `playwright.config.ts`.
- В коммите нет `test.skip`, `test.fixme` или `test.only`.
- Нет grep-invert исключений в CI-скриптах.
- Массив `projects` включает все нужные браузеры.

Pre-commit хук или CI-шаг линтинга может грепнуть `test\.skip|test\.fixme|test\.only|retries\s*:` и завалить
пуш, делая проверку автоматической.

## Смотри также

Повторы и пропуски обычно означают, что тест ждёт время, а не события; см.
[ожидания по событиям](/kb/testing/event-driven-no-timeouts). Гонка с сервис-воркером
в SPA контент-админки — конкретный случай, где фиксом стало правильное ожидание, а не
повтор: [дождаться, пока сервис-воркер устаканится](/kb/testing/wait-for-service-worker-settle).
