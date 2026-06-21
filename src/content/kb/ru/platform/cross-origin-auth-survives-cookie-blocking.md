---
title: 'Кросс-доменная авторизация, которая переживёт блокировку сторонних cookie'
category: platform
summary: 'Когда сайт и API находятся на разных eTLD+1, cookie не могут переносить авторизацию — возвращайте токены в теле ответа, храните в sessionStorage и отправляйте через Authorization: Bearer; в продакшене сводите всё к одному apex.'
principle: 'Когда сайт и API находятся на разных eTLD+1, возвращайте токен сессии и CSRF-токен в теле ответа, храните их в sessionStorage и отправляйте Authorization: Bearer; на сервере принимайте либо cookie, либо Bearer; в продакшене сводите всё к одному apex, где cookie работают сами по себе.'
severity: strong
tags: [platform, auth, cookies, cors, csrf, sessions, bearer-token]
sources:
  - project: 'платформа доставки еды'
    date: 2026-05-24
    note: 'токены в теле→sessionStorage→Bearer; принимаем cookie или Bearer; Bearer безопасен против CSRF; один apex в продакшене'
related:
  - platform/tokens-dont-fit-in-cookies
  - error-handling/always-check-res-ok
order: 2
updated: 2026-05-24
---

Авторизация на cookie полагается на то, что браузер сам прикрепляет cookie к запросам. Именно это автоматическое прикрепление и стремятся ограничить механизмы защиты приватности. Начиная с Chrome 80 (2020), Chromium последовательно ужесточал обработку сторонних cookie. Cookie по умолчанию получают `SameSite=Lax`, а межсайтовые cookie (даже `SameSite=None; Secure`) блокируются на этапе отказа от сторонних cookie в рамках Privacy Sandbox. Как только сайт и API оказываются на разных eTLD+1, то есть на разных регистрациях в публичном суффиксе, cookie от API становятся для сайта сторонними и поэтому никогда не приживаются.

Preview-окружение платформы доставки еды (2026-05-24) показало это наглядно. Сайт был развёрнут на хосте `.pages.dev` (Cloudflare Pages), а API — на хосте `.workers.dev` (Cloudflare Workers); это два разных eTLD+1: `pages.dev` и `workers.dev`. API отвечал заголовком `Set-Cookie: SameSite=None; Secure`, современный Chromium его отбрасывал, и `document.cookie` на origin сайта возвращался пустым. Без cookie, по которому можно было бы проверить запрос, CSRF-защита на cookie на изменяющих маршрутах API возвращала 403 на каждую запись, и каждая авторизованная операция в preview была мертва.

## Почему это важно

### Граница eTLD+1

Cookie считается «same-site», когда регистрируемый домен совпадает между origin страницы и целью запроса. Регистрируемый домен — это eTLD+1: эффективный домен верхнего уровня (из Public Suffix List) плюс одна метка.

| Origin сайта | Origin API | Совпадение eTLD+1? |
|---|---|---|
| `app.example.com` | `api.example.com` | Да — у обоих `example.com` |
| `app.pages.dev` | `api.workers.dev` | Нет — `pages.dev` ≠ `workers.dev` |
| `app.example.com` | `api.example.com` | Да — у обоих `example.com` |

Preview-деплои на мультитенантных платформах ломают совпадение eTLD+1 постоянно. Платформа делает это намеренно, чтобы запретить доступ к cookie между тенантами, и обойти это без своего домена нельзя — поэтому стратегия авторизации обязана с этим справляться.

### Почему Bearer-токены безопасны против CSRF

Cross-Site Request Forgery работает потому, что браузер прикрепляет cookie к запросам автоматически. Страница атакующего может выстрелить `fetch('https://api.example.com/delete', { method: 'DELETE' })`, браузер добавит к запросу cookie сессии жертвы, и у API нет способа отличить легитимный запрос от подделанного.

`Authorization: Bearer <token>` никогда не прикрепляется сам собой. Страница атакующего к тому же не может прочитать `sessionStorage` с чужого origin — этому мешает same-origin policy. Так что Bearer-токен в sessionStorage нельзя вытащить с другого сайта, а у подделанного запроса нет способа его включить. Bearer-токенам не нужна CSRF-защита, и это свойство идёт от самого транспорта учётных данных, а не от формата токена.

```
Cookie auth:     browser attaches automatically → CSRF protection required
Bearer (header): must be explicitly attached by JS → CSRF-safe by design
```

## Как применять

### 1. Возвращайте токены в теле ответа

Эндпоинт логина (и OAuth-колбэк) возвращает и токен сессии, и CSRF-токен в JSON-теле ответа, рядом с заголовком `Set-Cookie` или вместо него.

```ts
// Cloudflare Worker — login handler
export const handleLogin = async (req: Request, env: Env): Promise<Response> => {
  const { email, password } = await req.json();
  const user = await verifyCredentials(email, password, env);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionToken = await createSession(user.id, env);
  const csrfToken = crypto.randomUUID();
  await env.SESSIONS.put(`csrf:${sessionToken}`, csrfToken, { expirationTtl: 86400 });

  return new Response(
    JSON.stringify({
      ok: true,
      // Tokens in the body — survives cross-origin cookie blocking.
      sessionToken,
      csrfToken,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Still set the cookie for same-origin production use.
        'Set-Cookie': `session_sid=${sessionToken}; HttpOnly; Secure; SameSite=None; Max-Age=86400`,
      },
    },
  );
};
```

### 2. Храните токены в sessionStorage на клиенте

```ts
// src/auth/session.ts

const SESSION_KEY = 'session_sid';
const CSRF_KEY = 'session_csrf';

export const storeSession = (sessionToken: string, csrfToken: string): void => {
  sessionStorage.setItem(SESSION_KEY, sessionToken);
  sessionStorage.setItem(CSRF_KEY, csrfToken);
};

export const getSessionToken = (): string | undefined =>
  sessionStorage.getItem(SESSION_KEY) ?? undefined;

export const getCsrfToken = (): string | undefined =>
  sessionStorage.getItem(CSRF_KEY) ?? undefined;

export const clearSession = (): void => {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(CSRF_KEY);
};
```

Здесь нужен именно `sessionStorage`, а не `localStorage`, потому что токен сессии не должен жить дольше сессии браузера. Закрытие вкладки разлогинивает пользователя — это правильная позиция по безопасности для приложения без явной опции «запомнить меня».

### 3. Отправляйте токены как Bearer + X-CSRF-Token

```ts
// src/api/fetch-with-auth.ts

import { getSessionToken, getCsrfToken } from '../auth/session';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const fetchWithAuth = async (
  url: string,
  method: Method = 'GET',
  body?: unknown,
): Promise<Response> => {
  const sessionToken = getSessionToken();
  const csrfToken = getCsrfToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  // CSRF token only needed for mutating methods, but always sent when available.
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include', // includes cookie on same-origin production
  });

  if (!res.ok) {
    throw new Error(`${method} ${url} → ${res.status}`);
  }

  return res;
};
```

### 4. На сервере принимайте либо cookie, либо Bearer

API обязан принимать оба транспорта учётных данных: cookie для same-origin продакшена и Bearer для кросс-доменного preview и нативных приложений.

```ts
// src/auth/require-auth.ts (Cloudflare Worker middleware)

const extractSessionToken = (req: Request): string | undefined => {
  // 1. Try Authorization: Bearer header first (cross-origin safe).
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // 2. Fall back to cookie (same-origin production).
  const cookieHeader = req.headers.get('Cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)session_sid=([^;]+)/);
  return match?.[1];
};

export const requireAuth = async (
  req: Request,
  env: Env,
): Promise<{ userId: string } | Response> => {
  const token = extractSessionToken(req);

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthenticated' }), { status: 401 });
  }

  const userId = await env.SESSIONS.get(token);

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 });
  }

  return { userId };
};

// CSRF guard skips header check when Bearer is present (Bearer is CSRF-safe).
export const csrfGuard = async (
  req: Request,
  env: Env,
  sessionToken: string,
): Promise<Response | undefined> => {
  const authHeader = req.headers.get('Authorization');

  // Bearer path: CSRF protection is implicit in the credential transport.
  if (authHeader?.startsWith('Bearer ')) {
    return undefined; // no CSRF check needed
  }

  // Cookie path: require X-CSRF-Token header.
  const submitted = req.headers.get('X-CSRF-Token');
  const expected = await env.SESSIONS.get(`csrf:${sessionToken}`);

  if (!submitted || submitted !== expected) {
    return new Response(JSON.stringify({ error: 'CSRF validation failed' }), { status: 403 });
  }

  return undefined;
};
```

### 5. В продакшене сводите всё к одному apex

В продакшене и сайт, и API сидят под одним регистрируемым доменом (`example.com` / `api.example.com`). Cookie там same-site, поэтому кросс-доменной блокировки cookie не происходит. Путь через Bearer остаётся в строю как запасной вариант для нативных мобильных приложений, CLI-клиентов и server-to-server интеграций.

```
Preview:    app.pages.dev → api.workers.dev   (different eTLD+1; Bearer path)
Production: example.com → api.example.com      (same eTLD+1; cookie path)
```

Итог в том, что система авторизации проверяется в более жёстком режиме — кросс-доменном — ещё в preview, до того как она доберётся до продакшена, так что регрессия в пути Bearer всплывает уже во время ревью.

## Антипаттерны

**Расчёт на то, что `SameSite=None; Secure` переживёт кросс-домен**

`SameSite=None; Secure` позволяет cookie путешествовать с межсайтовыми запросами, но блокировка сторонних cookie в современном Chromium не даёт её вообще установить. Ответ `Set-Cookie` от кросс-доменного API игнорируется, и cookie никогда не записывается.

**Использование `localStorage` вместо `sessionStorage` для токенов сессии**

`localStorage` живёт, пока что-нибудь явно его не очистит. Токен сессии, оставленный там, переживает сессию браузера: пользователь закрывает вкладку, открывает новую — и всё ещё залогинен. Для большинства приложений это сюрприз, которого никто не просил. Держитесь `sessionStorage`, если только персистентность в духе «запомнить меня» не является явным продуктовым требованием.

**Отсутствие пропуска CSRF-проверки на пути Bearer**

Если CSRF-guard не распознаёт учётные данные Bearer и проваливается в проверку cookie-CSRF, путь Bearer падает с 403 на каждом изменяющем запросе. Guard обязан явно пропускать проверку заголовка CSRF, когда присутствует `Authorization: Bearer`.

## Смотрите также

[Токены не помещаются в cookie](/kb/platform/tokens-dont-fit-in-cookies) — смежный случай, когда токен слишком велик для cookie даже на том же origin. Обе проблемы подталкивают к серверному хранилищу сессий, которое держит в cookie только идентификатор сессии.
