---
title: 'Никогда не проглатывайте ошибку'
category: error-handling
summary: 'Пустые catch и сфабрикованный успех скрывают именно те сбои, из которых вырастают продакшен-инциденты. Ошибки либо распространяются дальше, либо обрабатываются явно — но никогда не замалчиваются.'
principle: 'Никаких пустых catch, никаких `.catch(() => {})`, никакого сфабрикованного успеха. Либо явно отфильтруйте класс ошибки и пробросьте остальные, либо отправьте отклонение туда, где его увидят.'
severity: non-negotiable
tags: [error-handling, reliability, observability]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-05-09
    note: 'Молчаливые обработчики catch были структурной причиной того, почему целый класс регрессий сохранения оставался невидимым; запрещены через biome noEmptyBlockStatements.'
  - project: 'SPA для администрирования контента'
    date: 2026-04-29
    note: 'Обработчики RBAC возвращали {success:true}, тогда как GitHub отвечал 4xx — сохранения часами молча ничего не делали.'
related:
  - error-handling/always-check-res-ok
  - error-handling/no-self-rolled-yaml
  - functional-architecture/errors-as-values-with-effect
  - platform/idb-structured-clone-boundary
order: 1
updated: 2026-05-09
---

Пустой catch — самая дорогая строка кода, которую можно написать, потому что она
становится невидимой ровно в тот момент, когда она вам нужна. `.catch(() => {})` не
обрабатывает ошибку. Он стирает свидетельство того, что она была. Сбой всё равно
произошёл, и теперь его не увидит ни один лог, ни одно уведомление, ни один тест. На
SPA для администрирования контента это сыграло по-настоящему: молчаливые обработчики
catch были **структурной причиной** того, почему целый класс продакшен-регрессий
сохранения оставался невидимым, пока человек вручную не заметил, что ничего не
сохраняется.

Правило: **никогда не проглатывайте ошибку молча.** Пустой `try/catch`, `.catch(() => {})`,
`.catch(() => undefined)` и `.then(onOk, () => {})` — всё это под запретом.

## Почему это важно

Два инцидента, одна корневая причина.

SPA для администрирования контента коммитило репозиторий в несобираемое состояние.
Сборка статического контент-сайта затем падала, но обработка ошибок на стороне админки
проглатывала любой сигнал, так что редактор видел успех, пока продакшен горел красным.
Та же форма сидела под инициализацией service worker, где `.then(loadRoleAfterInit, () => {})`
отбрасывал сбои запуска SW.

Отдельно слой RBAC (членство в организации `PUT`, команда `PUT`, приглашение `POST`,
отзыв `DELETE`) возвращал `{ success: true }` из service worker, **тогда как GitHub
вернул 4xx**. Обработчик ни разу не проверял `res.ok`, поэтому фабриковал успех, UI
обновлялся и показывал старое состояние. Сохранения молча ничего не делали, и никто не
знал об этом, пока часами не пытался повторить. Сфабрикованный успех — это та же
проглоченная ошибка, только она ещё и улыбается вам в ответ.

Цена в обоих случаях одна. Сбой реален, но всплывает как сбивающий с толку симптом
вдалеке от причины, обычно лишь после того, как его заметит человек. Вы платите часами
отладки и потерянным доверием к тому, что считали сохранённым.

## Как применять

Решите явно, что вы делаете с отклонением. Есть ровно три законных варианта, и
«ничего» среди них нет.

**1. Настоящий fire-and-forget → пробросьте отклонение.** Если вы действительно не
хотите ждать что-то через await, не теряйте его сбой. Отправьте его в глобальный
обработчик, чтобы он оставался наблюдаемым.

```ts
// src/utils/fire-and-forward.ts — rejections reach `unhandledrejection`.
export const fireAndForward = (p: Promise<unknown>): void => {
  void p.catch((error) => {
    globalThis.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { reason: error, promise: p }));
  });
};
// In a service worker, the equivalent logs with a category: fireAndLog(p, 'sw-init').
```

**2. Выборочное проглатывание → отфильтруйте класс, пробросьте остальное.** «Игнорировать
EEXIST, пробрасывать всё остальное» — законно; «игнорировать всё» — нет. Сделайте так,
чтобы нежелательная ветка продолжала распространяться.

```ts
// Idempotent mkdir: only EEXIST is expected.
export const ensureDir = async (path: string): Promise<void> => {
  try {
    await mkdir(path);
  } catch (error) {
    void (isEexist(error) ? 0 : rethrow(error)); // anything else still throws
  }
};
```

**3. Обработайте её по-настоящему.** Покажите ошибку пользователю, повторите с задержкой
или поставьте в очередь. Суть в том, что ошибка доходит до кода, который что-то с ней
делает.

Для частой логики, которая может падать, лучше делать ошибки **значениями**, а не
бросками: `Either`/`Effect`, чей канал ошибки система типов вынуждает вас обработать.
См. [ошибки как значения с Effect](/principles/functional-architecture/errors-as-values-with-effect).

## Антипаттерны

```ts
// ❌ The empty catch — deletes evidence.
try {
  await save();
} catch {}

// ❌ Fire-and-forget that forgets the failure too.
void appendEntry(entry); // throws inside? nobody will ever know

// ❌ Fabricated success — the SW says ok while the API said no.
const res = await fetch(url, { method: 'PUT' });
return { success: true }; // never checked res.ok — see "always check res.ok"

// ❌ The two-argument then with a no-op rejection handler.
init().then(loadRole, () => {});
```

## Контроль

`biome lint/suspicious/noEmptyBlockStatements` выставлен в **error** (он включён в
собственном `biome.json` этого репозитория), что напрямую запрещает пустой `try/catch`.
Эквивалент в ESLint — `no-empty` с `allowEmptyCatch: false`. Вариант со сфабрикованным
успехом ловит парное правило [всегда проверяйте `res.ok`](/principles/error-handling/always-check-res-ok).
Когда на ревью вам попадается шаблонный литерал `${key}: ${value}` или `.catch(() => {})`,
относитесь к этому как к дефекту, а не как к мелочи о стиле.

## Смотрите также

Тот же инстинкт — не давать сбою пройти незамеченным — стоит за правилом
[всегда проверяйте res.ok](/principles/error-handling/always-check-res-ok) и за отказом
[писать вручную хрупкие сериализаторы](/principles/error-handling/no-self-rolled-yaml), которые
молча падают на враждебном вводе.
