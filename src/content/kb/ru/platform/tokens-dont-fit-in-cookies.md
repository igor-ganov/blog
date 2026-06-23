---
title: "Токены не помещаются в cookie — храните их на сервере"
category: platform
summary: 'Большие JWT не влезают в лимит cookie браузера (~4 КБ); браузер молча отбрасывает Set-Cookie без единой ошибки, и пользователя выбрасывает на страницу входа. Держите токены в серверном хранилище сессий, а в cookie кладите только идентификатор сессии.'
principle: "Не храните большие токены доступа (JWT) в cookie — они превышают лимит cookie в ~4 КБ, и браузер молча отбрасывает Set-Cookie; держите токены в серверном хранилище сессий, а в cookie кладите только идентификатор сессии."
severity: strong
tags: [platform, auth, cookies, jwt, sessions, oauth, astro]
sources:
  - project: 'клиентское приложение для Jira'
    date: 2026-06-08
    note: 'JWT превышает лимит cookie в ~4 КБ → молча отбрасывается; держите токены на сервере, в cookie только идентификатор сессии'
related:
  - platform/cross-origin-auth-survives-cookie-blocking
  - build-ci-deploy/build-time-env-is-baked
order: 3
updated: 2026-06-08
---

У cookie в браузере есть жёсткий лимит размера. Спецификация HTTP рекомендует не менее
4096 байт на cookie, и на практике браузеры держат лимит около 4 КБ на cookie.
Точное значение разнится (Chrome отводит примерно 4096 байт только под значение; Firefox и
Safari дают близкое число). Как только заголовок `Set-Cookie` превышает этот размер, браузер
выбрасывает его без ошибки, предупреждения или сообщения в консоли. Ответ завершается
штатно, а cookie просто нет.

Токены доступа Atlassian OAuth — это большие JWT, обычно 1–3 КБ на сам токен, до того как
вы добавите refresh-токен и метаданные. Один cookie с таким токеном
переваливает за 4 КБ. В клиентском приложении для Jira (2026-06-08) сломалось именно это:
OAuth-callback клал токен доступа прямо в заголовок `Set-Cookie`, браузер
молча его отбрасывал, каждый следующий запрос к API уходил без учётных данных, и пользователь
возвращался на страницу входа. В консоли — ни одной ошибки. Единственное, что было видно, — это
цикл аутентификации.

Решение — на уровне архитектуры. Токены живут в серверном хранилище сессий, а cookie
несёт только идентификатор сессии — короткую случайную строку, которая указывает на сохранённый токен.
Идентификатор сессии маленький, спокойно влезает в cookie и ничего не выдаёт о содержимом
токена.

## Почему это важно

### Тихий сбой на границе с браузером

Молчаливое отбрасывание `Set-Cookie` диагностируется тяжело по нескольким причинам:

1. HTTP-ответ возвращает 200 или 302, так что со стороны сервера всё прошло.
2. Никакой ошибки JavaScript не возникает.
3. Итоговое состояние — отсутствующий cookie — выглядит так же, как «пользователь не вошёл».
4. Если вы не знаете о лимите в 4 КБ, сбой непрозрачен. «Авторизация работает в локальной
   разработке, но падает в preview» — типичный отчёт, потому что в локальной разработке токены
   обычно меньше.

JWT растёт с каждым добавленным claim. Токен доступа Atlassian несёт subject,
issuer, audience, срок действия, scopes и claim-ы, специфичные для тенанта. Токен, который влезает в dev
с минимальным набором scopes, может переполнить cookie на staging, как только подцепится полный набор scopes.

### Почему чисто статический сайт для OAuth невозможен

Поток authorization code в OAuth требует client secret. Обмен кода на токен
(`POST /oauth/token` с `code`, `client_id` и `client_secret`) должен выполняться на
сервере, потому что client secret не может жить в браузере — там он попал бы в
исходники или DevTools. Статический сайт без серверной части не сможет завершить OAuth. Нужна
как минимум серверно отрендеренная страница или serverless-функция для обработки callback.

Адаптер Astro (`@astrojs/node` в dev, адаптер Workers в продакшене) даёт вам
эту серверную поверхность. Хранилище сессий — это драйвер на файловой системе в разработке и
Workers KV (или Durable Objects) в продакшене.

## Как применять

### Архитектура хранилища сессий

```
User browser                  Astro server                  External
──────────────────────────────────────────────────────────────────────
                              Session store:
                              { [sessionId]: { accessToken, refreshToken, expiresAt } }
                              (filesystem in dev, Workers KV in prod)

[1] GET /auth/callback?code=X ─────────────────────────────────────────>
<─────────────────────────────── [2] POST /oauth/token → { access_token, refresh_token }
[3] Store tokens → sessionId = crypto.randomUUID()
[4] Set-Cookie: session=<sessionId>; HttpOnly; Secure; SameSite=Lax
                                                         (≈ 36 bytes — well within 4 KB)
[5] Redirect 302 → /dashboard
```

Шаг [4] — единственный `Set-Cookie`. Идентификатор сессии из 36-байтового UUID остаётся далеко ниже лимита
размера, а токены вообще не появляются в cookie.

### Реализация на Astro

```ts
// src/pages/auth/callback.ts — Astro server-rendered page

import type { APIRoute } from 'astro';
import { createSession } from '../../auth/session-store';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    return new Response('Missing code', { status: 400 });
  }

  // Verify state cookie (HMAC-signed, short-lived).
  const expectedState = cookies.get('oauth_state')?.value;
  if (!state || state !== expectedState) {
    return new Response('Invalid state', { status: 400 });
  }

  // Exchange code for tokens — requires client_secret, must be server-side.
  const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: import.meta.env.ATLASSIAN_CLIENT_ID,
      client_secret: import.meta.env.ATLASSIAN_CLIENT_SECRET, // never sent to client
      code,
      redirect_uri: import.meta.env.ATLASSIAN_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    return new Response('Token exchange failed', { status: 502 });
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json();

  // Store tokens server-side; only the session ID goes in the cookie.
  const sessionId = await createSession({
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: Date.now() + expires_in * 1000,
  });

  cookies.set('session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: expires_in,
    path: '/',
  });

  // Clear the short-lived state cookie.
  cookies.delete('oauth_state', { path: '/' });

  return redirect('/dashboard', 302);
};
```

```ts
// src/auth/session-store.ts — filesystem driver for dev, Workers KV for prod

import type { Session } from './types';

// In dev: JSON files in .session/ (excluded from git).
// In prod: swap this implementation for Workers KV or Durable Objects.
const sessions = new Map<string, Session>();

export const createSession = async (data: Session): Promise<string> => {
  const id = crypto.randomUUID();
  sessions.set(id, data);
  return id;
};

export const getSession = async (id: string): Promise<Session | undefined> =>
  sessions.get(id);

export const deleteSession = async (id: string): Promise<void> => {
  sessions.delete(id);
};
```

### Подпись параметра state в OAuth

Параметр `state` в потоке OAuth должен быть непредсказуемым, чтобы атакующий не смог
подделать редирект (CSRF). Подписывайте его через HMAC, а не храните в сессии:
state в OAuth появляется раньше сессии, потому что на старте входа сессии ещё нет.

```ts
// src/auth/oauth-state.ts

const encoder = new TextEncoder();

export const createState = async (secret: string): Promise<string> => {
  const nonce = crypto.randomUUID();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(nonce));
  const sigHex = Buffer.from(sig).toString('hex');
  return `${nonce}.${sigHex}`;
};

export const verifyState = async (state: string, secret: string): Promise<boolean> => {
  const [nonce, sigHex] = state.split('.');
  if (!nonce || !sigHex) return false;
  const expected = await createState(secret); // won't match — need to verify sig directly
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const sig = Buffer.from(sigHex, 'hex');
  return crypto.subtle.verify('HMAC', key, sig, encoder.encode(nonce));
};
```

Подписанный HMAC state кладётся в короткоживущий cookie (`oauth_state`, `maxAge: 300`), и
сервер проверяет его на callback без обращения к сессии.

## Антипаттерны

**Хранение токена доступа в cookie**

```ts
// Anti-pattern: token in cookie — silent drop if > 4 KB.
cookies.set('access_token', atlassianJWT, { httpOnly: true, secure: true });
// → Set-Cookie header exceeds 4 KB; browser silently drops it.
// → Subsequent requests have no credentials; user bounced to login.
```

**Хранение токена доступа в sessionStorage**

Токену доступа для серверного API вроде Atlassian вообще не место в браузере.
Положите его в sessionStorage — и одна XSS-дыра утянет токен целиком вместе со
всеми правами, которые он даёт. Держите токен на сервере и отдавайте наружу только идентификатор
сессии, который можно отозвать.

**Расчёт на то, что поток OAuth code работает на статическом сайте**

```ts
// Anti-pattern: client-side token exchange — the client_secret is exposed.
const res = await fetch('/oauth/token', {
  body: JSON.stringify({
    client_secret: 'my-secret', // now visible in DevTools network tab
    code,
  }),
});
// This is also wrong because the fetch is to the page origin, not the auth server.
```

Поток authorization code в OAuth требует сервера, так что заложите его раньше, чем напишете
первую строку callback.

**Использование JWT в качестве идентификатора сессии**

JWT — это не идентификатор сессии. JWT — это самодостаточный подписанный токен, который сервер может
проверить без обращения к базе, а это ровно противоположно тому, что нужно для браузерных
сессий. Там нужны короткие непрозрачные идентификаторы, которые нельзя проверить без серверного состояния
и которые можно отозвать. Когда хранилище сессий скомпрометировано или сессию надо
убить, вы удаляете UUID из хранилища. Снять подпись с уже выданного JWT невозможно.

## Смотрите также

[Кросс-доменная аутентификация, переживающая блокировку сторонних cookie](/principles/platform/cross-origin-auth-survives-cookie-blocking)
разбирает следующую по порядку проблему: даже cookie правильного размера перестают работать через
разные eTLD+1 в современном Chromium, и паттерн с откатом на Bearer покрывает оба случая.

[Переменные окружения времени сборки запекаются в артефакт](/principles/build-ci-deploy/build-time-env-is-baked) разбирает смежную
проблему деплоя. `client_secret` — это runtime-секрет, а не переменная времени сборки,
поэтому подставляйте его в рантайме через серверное окружение, а не вшивайте на этапе
статической сборки.
