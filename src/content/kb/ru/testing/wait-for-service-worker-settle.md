---
title: 'Дайте service worker устаканиться, прежде чем трогать DOM'
category: testing
summary: 'В свежем BrowserContext опирайтесь на сам жизненный цикл SW — есть контроллер или активная регистрация — плюс стабильный якорный элемент. networkidle — это скрытый sleep на 500 мс; domcontentloaded срабатывает слишком рано.'
principle: 'Дождитесь, пока service worker возьмёт документ под контроль (или получит активную регистрацию в WebKit), плюс стабильного якорного элемента — до тела теста и до любой последующей навигации. Никогда не используйте networkidle или domcontentloaded как сигнал готовности.'
severity: strong
tags: [testing, playwright, e2e, service-worker, determinism]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-04-30
    note: 'Гонка SW controllerchange→reload ломает тест; исходное исправление ждало networkidle + стабильный якорь в beforeEach.'
  - project: 'SPA для администрирования контента'
    date: 2026-06-12
    note: 'networkidle отменён: это скрытый sleep на >=500 мс на каждый визит. Опирайтесь на само состояние жизненного цикла (контроллер или активная регистрация — WebKit никогда не отдаёт контроллер). Также ставьте гейт ДО следующей навигации: активация захватывает клиентов и прерывает goto в полёте (net::ERR_ABORTED).'
related:
  - testing/event-driven-no-timeouts
  - testing/parallel-workers-surface-races
  - platform/idb-structured-clone-boundary
order: 4
updated: 2026-06-12
---

В свежем `BrowserContext` никакого service worker нет. Когда страница загружается, SW
проходит `install → activate`, выстреливает `controllerchange` на `navigator.serviceWorker`,
и обработчик активации захватывает клиента. За этим шагом часто следует
`location.reload()`, который выбрасывает DOM, который страница как раз отрисовывала, и
запускает вторую навигацию. Если тело теста стартует в промежутке между
`domcontentloaded` первой навигации и перезагрузкой, Playwright разрешает локаторы
против DOM, который вот-вот исчезнет, и клик попадает в оторванный элемент.

В trace viewer у этого сбоя узнаваемая подпись: `element was detached
from the DOM, retrying` сразу следом за `navigated to "<base>/"`. Тест не упал по
таймауту обычным образом. Он проиграл гонку с перезагрузкой, о которой не знал.

## Почему это важно

В SPA для администрирования контента (2026-04-30) модуль жизненного цикла обновлений
слушает `controllerchange` и перезагружается на **первой** активации SW. Это штатное
поведение progressive-web-app и корректный прикладной код. Проблема целиком сидит в
тестах: в свежем `BrowserContext` каждый прогон теста — это первая активация.

Первое исправление (2026-04-30) ждало `networkidle` плюс стабильный якорь. Оно
проходило, но это было не то ожидание. `networkidle` означает «нет сетевых запросов
500 мс», то есть это ожидание по времени, выдающее себя за событие. Каждый визит
платит обязательные 500 мс тишины, даже когда SW устаканился мгновенно. На наборе из
десятков визитов это набегает в полминуты чистого сна, и при этом всё равно ничего не
говорит про SW: страница может быть network-idle, пока SW в середине активации.

Второй заход (2026-06-12), под жёстким бюджетом скорости пайплайна, заменил это на
гейт по самому состоянию жизненного цикла. Ожидание разрешается в тот же миг, когда SW
контролирует документ — обычно несколько миллисекунд на тёплом контексте вместо
фиксированных 500 мс.

Тот же заход вскрыл вторую грань гонки: активация прерывает навигации в полёте. Тест,
который логинится (регистрируя SW) и тут же делает `goto` на следующую страницу,
падает с `net::ERR_ABORTED`, потому что активирующийся worker захватывает клиента
посреди навигации. Поэтому гейт по жизненному циклу должен отрабатывать до тела теста и
до любой навигации, которая идёт следом за действием, (пере)регистрирующим SW.

## Как применять

Поставьте гейт на жизненный цикл SW, затем на стабильный якорь, который приложение
рендерит только после рукопожатия:

```ts
// ❌ Too early — domcontentloaded fires before SW activation and the reload.
await page.goto('/');

// ❌ The old advice — networkidle is a hidden >=500ms sleep per visit and
//    proves nothing about the SW lifecycle.
await page.waitForLoadState('networkidle');

// ✅ Wait for the SW to control the document. WebKit in Playwright never
//    exposes `controller`, so an active registration counts as the same
//    lifecycle gate there.
export const waitForSWControl = async (page: Page): Promise<void> => {
  await page.waitForFunction(async () => {
    const sw = navigator.serviceWorker;
    const reg = sw ? await sw.getRegistration() : undefined;
    return !sw || sw.controller !== null || Boolean(reg?.active);
  });
};

// ✅ The full settle: navigate, gate the lifecycle, anchor on post-activate DOM.
export const visitSettled = async (
  page: Page,
  url: string,
  stableTestId: string,
): Promise<void> => {
  await visit(page, url);
  await waitForSWControl(page);
  await expect(page.getByTestId(stableTestId)).toBeVisible();
};
```

Выбирайте стабильный якорный элемент с умом. Он должен присутствовать на каждой
странице под тестом, рендериться приложением и нести детерминированный `data-testid`
(см. [константы локаторов](/principles/testing/locator-constants)).

И ставьте гейт **до следующей навигации** всякий раз, когда предыдущий шаг
зарегистрировал SW:

```ts
// First authenticated load registers the SW.
await page.evaluate(() => localStorage.setItem('token', 'mock'));
await page.reload({ waitUntil: 'domcontentloaded' });
await expect(page.getByRole('button', { name: /user/i })).toBeVisible();

// ❌ goto here intermittently dies with net::ERR_ABORTED — activation
//    claims the client mid-navigation.
// ✅ Gate the lifecycle first; the goto then never races the claim.
await waitForSWControl(page);
await visit(page, '/content/blog');
```

Это по-прежнему event-driven. `waitForFunction` опрашивает предикат на стороне браузера
и разрешается в тот же миг, когда он вернёт true, без фиксированной платы (см.
[event-driven ожидания](/principles/testing/event-driven-no-timeouts)).

### Как диагностировать гонку

Запустите с `--trace on` и откройте trace viewer. Ищите:

1. Первый `goto('/')` и его маркер `DOMContentLoaded`.
2. Второе событие навигации вскоре после — перезагрузку, вызванную SW.
3. `element was detached from the DOM, retrying` между двумя маркерами — гонка с
   перезагрузкой посреди теста; или `net::ERR_ABORTED` на `goto` — гонка с захватом
   при активации.

## Антипаттерны

```ts
// ❌ networkidle as the settle signal. A hidden 500ms sleep per call, and a
//    page can be network-idle while the SW is mid-activation.
await page.waitForLoadState('networkidle');

// ❌ Navigating in beforeEach but delegating the settle to the test body.
//    One forgotten test fails intermittently.

// ❌ Disabling the service worker in tests via a mock or flag.
//    This removes the race, but it also removes the SW from the test matrix.
await page.route('**/sw.js', (route) => route.abort());

// ❌ Browser-specific branches around the controller. WebKit's missing
//    controller is a known platform gap — fold it into ONE predicate
//    (controller OR active registration), not an if per browser.
if (browserName === 'webkit') await page.waitForTimeout(300);
```

Отключить SW в тестах — соблазнительный обходной путь, но он выбрасывает реальное
покрытие. Гейт по жизненному циклу стоит одного общего хелпера, и взамен DOM к моменту
запуска тела теста надёжно стабилен и уже после активации.

## Контроль соблюдения

Статического анализа под этот паттерн нет. Контроль идёт от правила трёх прогонов (см.
[без ретраев, без флаки](/principles/testing/no-retries-no-flakes)) и, ещё резче, от
параллельных воркеров. Последовательные наборы прячут эту гонку за случайной
медлительностью, тогда как 4 воркера на общих vCPU в CI воспроизводят её за прогон-два
(см. [параллельные воркеры вскрывают гонки](/principles/testing/parallel-workers-surface-races)).

На код-ревью проверяйте каждую навигацию, которая идёт следом за (пере)регистрацией SW:
закрыта ли она предикатом жизненного цикла и стабильным якорем? Если проект поставляет
обработчик обновления SW, этот гейт не опционален.
