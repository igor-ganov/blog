---
title: 'Внеполосному транспорту нужны сигналы в DOM'
category: testing
summary: 'Ожидания по сети не видят MessageChannel, BroadcastChannel и трафик внутри воркера. Когда данные идут вне основного канала, приложение обязано отразить завершение как наблюдаемое состояние DOM — атрибут данных, которого может дождаться тест.'
principle: 'Когда данные попадают на страницу через канал, который тестовая оснастка не наблюдает (MessageChannel, BroadcastChannel, fetch внутри воркера), отразите их прибытие как состояние DOM — например, атрибутом данных, который говорит, что именно отрисовано, — и ждите его.'
severity: strong
tags: [testing, playwright, e2e, service-worker, determinism]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-06-12
    note: 'Переключение разделов доставляет контент через SW MessageChannel — невидимо для графа запросов. Элементы списка выставляют data-path; объект страницы ждёт, пока первый элемент не окажется из нужного раздела (или пока не покажется явное пустое состояние).'
related:
  - testing/event-driven-no-timeouts
  - testing/parallel-workers-surface-races
  - testing/wait-for-service-worker-settle
order: 8
updated: 2026-06-12
---

Событийные ожидания в тестах опираются на две наблюдаемые поверхности: DOM и сеть.
Playwright перехватывает каждый HTTP-запрос страницы, поэтому связка «дождаться
ответа, затем проверить DOM» закрывает почти всю синхронизацию. Но сетевая половина
этого инструментария слепнет в тот момент, когда приложение перегоняет данные через
транспорт, к которому оснастка не подключится: `MessageChannel` к сервис-воркеру,
`BroadcastChannel` между вкладками, fetch, выполненный *внутри* воркера, WebTransport.
Запросы летят, данные приходят, а граф запросов теста молчит.

Дальше неверные выводы приходят быстро. «Ждать нечего, значит, поставлю sleep».
Или «дождусь появления любого элемента списка». Любой из этих вариантов даёт тест,
который проходит, пока на экране ещё лежат данные *предыдущего* экрана.

## Почему это важно

SPA для администрирования контента гонит весь git- и контент-трафик через
сервис-воркер, выступающий как backend-for-frontend. Клиент общается с ним через
`MessageChannel`, и в WebKit под Playwright даже обычные fetch проходят через этот
мост, потому что `navigator.serviceWorker.controller` так и не появляется.
Переключение с раздела блога на раздел вакансий не порождает вообще никакого
наблюдаемого HTTP-запроса.

Тест на переключение раздела ждал, пока после клика по ссылке раздела станут видны
элементы контента. Элементы *были* видны: элементы предыдущего раздела, те самые,
которые вот-вот заменятся. При последовательном запуске замена всегда выигрывала
гонку. С [4 параллельными воркерами](/kb/testing/parallel-workers-surface-races)
проверка попадала в середину замены, и тест честно падал. Никакое сетевое ожидание
тут не помогло бы, потому что ждать нечего — запроса нет.

Исправление жило в приложении и стоило одного атрибута. Каждый отрисованный элемент
контента выставляет путь к своему репозиторию как `data-path`. В пути закодировано,
какому разделу принадлежит элемент, поэтому «переключение завершилось» превращается
в наблюдаемый предикат над DOM.

## Как применять

Выставляйте идентичность, а не только присутствие. Список с `data-testid="content-item"`
говорит лишь, что здесь что-то есть. Добавьте `data-path="blog/2026/post.md"` — и он
скажет, *что* именно здесь, а это ровно то, что нужно проверять навигационному тесту.

```html
<li data-testid="content-item" :data-path="item.path">…</li>
```

```ts
// Page object: the switch is complete when the FIRST item belongs to the
// target section — or the section is legitimately empty and says so.
export const waitForSection = async (page: Page, section: string) => {
  await waitForCondition(page, async () => {
    const empty = await page.getByTestId('content-empty').isVisible();
    if (empty) return true;
    const path = await page
      .getByTestId('content-item')
      .first()
      .getAttribute('data-path');
    return path?.startsWith(`${section}/`) ?? false;
  });
};
```

Вес несут две детали:

- **Предикат отличает старые данные от новых.** Ожидание по присутствию
  (`toBeVisible` на обобщённом элементе) не отличит устаревший список от свежего.
  Ожидание по идентичности отличит, потому что читает, чем элемент является на самом деле.
- **Пусто — это состояние, а не отсутствие.** Если нужный раздел может быть пустым,
  приложение обязано отрисовать явный элемент пустого состояния. Без него у ожидания
  нет завершающего условия, и тест зависает на совершенно здоровой странице.

Никаких тестовых трюков здесь нет. Атрибут — это реальное отрисованное состояние,
он помогает, когда ковыряешься в devtools, и стоит одного биндинга.

## Антипаттерны

```ts
// ❌ Sleeping because "there's nothing to wait on". There is — you just
//    haven't rendered it yet.
await page.waitForTimeout(2000);

// ❌ Presence-based wait — passes against the PREVIOUS section's items.
await expect(page.getByTestId('content-item').first()).toBeVisible();

// ❌ Reaching into the transport from the test (evaluate + postMessage
//    handshakes). Now the test depends on the protocol's internals and
//    breaks on every refactor; the DOM attribute is the stable contract.
await page.evaluate(() => navigator.serviceWorker.controller!.postMessage(…));

// ❌ Asserting on internal stores (window.__state). Same coupling problem,
//    plus it tests the store, not what the user sees.
```

## Как добиваться соблюдения

Код-ревью: любая функциональность, чей путь данных пересекает границу воркера, канал
или другой невидимый для оснастки транспорт, обязана отражать завершение как
состояние DOM, а её тесты обязаны ждать идентичность, а не присутствие.
[Правило трёх прогонов под параллельными воркерами](/kb/testing/no-retries-no-flakes)
служит подстраховкой. Ожидания по присутствию над внеполосными данными — это ровно тот
класс гонок, который параллелизм вытаскивает наружу.
