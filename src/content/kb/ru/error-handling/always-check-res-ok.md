---
title: 'Всегда проверяйте res.ok — не выдумывайте успех'
category: error-handling
summary: 'Обёртка над fetch, которая возвращает {success:true}, не заглядывая в res.ok, врёт вызывающему коду: интерфейс перерисовывается, показывает устаревшие данные, а пользователь часами ломает голову, почему ничего не сохраняется.'
principle: 'Любая обёртка над fetch/swFetch обязана бросать исключение при !res.ok; никогда не возвращайте {success:true}, не проверив ответ.'
severity: non-negotiable
tags: [error-handling, fetch, service-worker, reliability]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-04-29
    note: 'Обработчики RBAC возвращали {success:true}, пока GitHub отдавал 4xx; бросаем исключение при !res.ok через ensureOk/okOrThrow'
related:
  - error-handling/never-swallow-errors
  - backend-events/telemetry-never-crashes
order: 2
updated: 2026-04-29
---

Вызов `fetch`, который вернул `4xx` или `5xx`, **не** бросает исключение. `Promise`
завершается штатно, и только `res.ok` подскажет, принял ли сервер запрос. Обёртка,
которая игнорирует это и возвращает `{ success: true }`, фабрикует сигнал успеха из
провала — это одна из форм [проглатывания ошибки](/principles/error-handling/never-swallow-errors).
Вызывающий код считает, что запись прошла, поэтому интерфейс
перерисовывается и показывает старое состояние. Пользователь не видит ничего странного,
повторяет операцию и в итоге заводит баг с текстом «ничего не сохраняется».

Поэтому любой код, оборачивающий `fetch` или `swFetch`, обязан бросать исключение при
`!res.ok` до того, как вернёт что-либо вызывающему коду.

## Почему это важно

29 апреля 2026 RBAC-слой SPA для администрирования контента отправили на разбор после
того, как кто-то наконец зафиксировал симптом: сохранения молча ничего не делали.
Проблема воспроизводилась неопределённо долго, и одни и те же операции вручную повторяли
часами, прежде чем кто-то поднял тревогу.

Причина сидела в четырёх обработчиках, покрывавших критичную поверхность RBAC:

- членство в организации `PUT`
- членство в команде `PUT`
- приглашение `POST`
- отзыв доступа `DELETE`

Каждый обработчик дёргал GitHub API через `swFetch`, не читал ни одного свойства ответа и
возвращал `{ success: true }`. GitHub отдавал ответы `4xx` из-за проблем с правами,
протухших токенов и кривых тел запросов, но service worker рапортовал об успехе на каждом
вызове. Интерфейс получал этот сигнал успеха, запускал повторную загрузку списка членов и
показывал неизменившееся состояние так, будто всё применилось. Форма выглядела рабочей,
хотя данные не сдвигались.

Тот же паттерн фабрикованного успеха всплыл в обработчиках ассетов в то же окно разбора.
Загрузка файла, удаление файла и пакетные операции — все возвращали `{ success: true }`,
не заглядывая в ответ, так что `503` от CDN или `409` от хранилища молча принимались за
зафиксированную запись.

Починка состояла из двух частей. Каждый обработчик получил явную проверку `res.ok`,
которая бросает типизированную ошибку с кодом статуса и телом ответа. Затем два хелпера,
`ensureOk` в `src/sw/rbac/response-ok.ts` и `okOrThrow` в
`src/views/SettingsView/org-invite-api.ts`, переехали в общий слой, чтобы у будущих
обработчиков была одна проверяемая точка вызова вместо встроенной проверки в каждом месте.

Фабрикованный `{ success: true }` — это неявный `catch (() => {})` на HTTP-сбое, что
делает этот инцидент прямым следствием принципа «не проглатывать ошибки».

## Как применять

### Хелпер okOrThrow

Централизуйте проверку. Встроенный `if (!res.ok) throw ...` в каждом обработчике
гарантированно где-нибудь пропустят или сделают по-другому, поэтому вынесите его один раз.

```ts
// src/views/SettingsView/org-invite-api.ts  (canonical client-side helper)

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message = `HTTP ${status}`,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Asserts res.ok, consuming the body for the error message when it is not.
 * Throws HttpError so callers can distinguish network errors from HTTP errors.
 */
export const okOrThrow = async (res: Response): Promise<Response> => {
  if (res.ok) return res;
  const body = await res.text().catch(() => '(unreadable)');
  throw new HttpError(res.status, body);
};
```

```ts
// src/sw/rbac/response-ok.ts  (service-worker mirror, identical contract)

export const ensureOk = async (res: Response): Promise<Response> => {
  if (res.ok) return res;
  const body = await res.text().catch(() => '(unreadable)');
  throw new HttpError(res.status, body);
};
```

У обоих один и тот же контракт. При успехе они возвращают `Response`, чтобы вызывающий код
мог дальше цеплять `.json()` или `.text()`, а при провале бросают типизированный
`HttpError`, чтобы вызывающий код мог разобрать статус в типобезопасном catch.

### Оборачиваем swFetch в обработчике service worker

```ts
// ❌ Before — fabricated success regardless of GitHub's answer.
const handleOrgMembershipPut = async (
  event: ExtendableMessageEvent,
): Promise<void> => {
  const { org, username, role } = event.data;
  await swFetch(`/orgs/${org}/memberships/${username}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
  event.ports[0].postMessage({ success: true }); // GitHub may have said 422.
};

// ✅ After — throws before the success message is ever sent.
const handleOrgMembershipPut = async (
  event: ExtendableMessageEvent,
): Promise<void> => {
  const { org, username, role } = event.data;
  const res = await swFetch(`/orgs/${org}/memberships/${username}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
  await ensureOk(res); // throws HttpError if GitHub returned 4xx/5xx
  event.ports[0].postMessage({ success: true });
};
```

Строка `event.ports[0].postMessage({ success: true })` теперь достижима только тогда,
когда `ensureOk` не бросил исключение. Любой `HttpError` всплывает в верхнеуровневый catch
обработчика сообщений SW, который отправляет клиенту `{ success: false, error: ... }`.

### Оборачиваем fetch на стороне клиента

Та же дисциплина применима к коду вне SW. Любая функция, которая зовёт `fetch` напрямую,
обязана прогнать ответ через `okOrThrow`, прежде чем считать его успешным.

```ts
// ❌ Before — no status check; a 403 lands silently.
export const postInvite = async (org: string, email: string): Promise<void> => {
  await fetch(`/api/orgs/${org}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

// ✅ After — okOrThrow throws; the caller's catch surfaces it to the UI.
export const postInvite = async (org: string, email: string): Promise<void> => {
  const res = await fetch(`/api/orgs/${org}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  await okOrThrow(res);
};
```

Поскольку `okOrThrow` возвращает `Response`, можно встроить вызов в цепочку, когда вам
нужно ещё и тело:

```ts
const data = await fetch(url)
  .then(okOrThrow)
  .then((res) => res.json() as Promise<InviteResult>);
```

### Что вызывающий код обязан сделать с брошенной ошибкой

Бросить исключение — это лишь половина контракта. Вызывающий код обязан поймать
`HttpError` и направить его куда-то видимое — тост, реф с ошибкой, очередь повторов — и
никогда в пустой catch. Сочетайте это правило с
[не проглатывайте ошибки](/principles/error-handling/never-swallow-errors).

```ts
// In a Vue component handler:
const handleRevoke = async (username: string): Promise<void> => {
  try {
    await revokeOrgMember(username);
    await refresh();
  } catch (err) {
    // HttpError carries status + body; anything else is unexpected.
    error.value =
      err instanceof HttpError
        ? `Revoke failed (${err.status}): ${err.body}`
        : 'Unexpected error — please retry.';
  }
};
```

## Антипаттерны

```ts
// ❌ Returning a hardcoded success without touching the response at all.
const uploadAsset = async (file: File): Promise<{ success: boolean }> => {
  await swFetch('/assets', { method: 'POST', body: file });
  return { success: true }; // storage may have returned 409 or 503
};

// ❌ Checking ok but silently discarding the failure path.
const deleteAsset = async (id: string): Promise<void> => {
  const res = await swFetch(`/assets/${id}`, { method: 'DELETE' });
  if (res.ok) return;
  // nothing in the else branch — the failure disappears
};

// ❌ Checking status numerically without covering the full 4xx/5xx range.
const patchTeam = async (team: string, data: TeamPatch): Promise<void> => {
  const res = await fetch(`/teams/${team}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (res.status === 404) throw new Error('not found');
  // 403, 422, 500, etc. still return without error
};

// ❌ Swallowing the response entirely by only awaiting the json() branch.
const getRole = async (username: string): Promise<Role> => {
  const res = await swFetch(`/users/${username}/role`);
  return res.json() as Promise<Role>; // json() on a 401 HTML body will throw a parse
                                      // error, not an HttpError — the wrong error leaks
};
```

В каждом из этих случаев с точки зрения вызывающего кода запись прошла успешно,
интерфейс перерисовывается с устаревшим состоянием, и никто не
замечает провала, пока пользователь не обнаружит, что данные не изменились — возможно,
спустя часы.

## Контроль соблюдения

Ни одно правило линтера не ловит «результат fetch использован без проверки res.ok»
универсально, потому что объект ответа типизирован как `Response` независимо от того,
заглядываете вы в него или нет. Работает структурный контроль:

1. **Запретите встроенные проверки `!res.ok`** — требуйте, чтобы каждый обработчик звал
   `ensureOk` или `okOrThrow`. Так точка вызова видна на код-ревью и её легко искать
   грепом среди незащищённых мест (вызовы `swFetch`, за которыми не следует `ensureOk`).
2. **Проверка на код-ревью** — любой новый обработчик, который зовёт `fetch` или `swFetch` и
   возвращает значение успеха, обязан показать вызов `ensureOk`/`okOrThrow`; его
   отсутствие — дефект.
3. **Интеграционные тесты** — проверяйте путь `4xx` явно: замокайте API на возврат `403` и
   убедитесь, что интерфейс показывает ошибку. Тест, который покрывает только счастливый
   путь, упускает весь класс багов, описанный здесь.

## Смотрите также

Фабрикованный `{ success: true }` — это HTTP-специфичный случай общего принципа из
[не проглатывайте ошибки](/principles/error-handling/never-swallow-errors). Хелперы телеметрии,
которые шлют аналитику по принципу «отправил и забыл», натыкаются на тот же режим отказа —
об этом в [телеметрия никогда не падает](/principles/backend-events/telemetry-never-crashes).
