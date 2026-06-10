---
title: 'Cross-origin auth that survives third-party-cookie blocking'
category: platform
summary: 'When site and API are on different eTLD+1s, cookies cannot carry auth — return tokens in the response body, store in sessionStorage, and send as Authorization: Bearer; collapse to one apex in production.'
principle: 'When the site and API are on different eTLD+1s, return session and CSRF tokens in the response body, store them in sessionStorage, and send Authorization: Bearer; accept either cookie or Bearer server-side; collapse to one apex in production where cookies work natively.'
severity: strong
tags: [platform, auth, cookies, cors, csrf, sessions, bearer-token]
sources:
  - project: 'a food-delivery platform'
    date: 2026-05-24
    note: 'tokens in body→sessionStorage→Bearer; accept cookie or Bearer; Bearer is CSRF-safe; one apex in prod'
related:
  - platform/tokens-dont-fit-in-cookies
  - error-handling/always-check-res-ok
order: 2
updated: 2026-05-24
---

Cookie-based authentication relies on the browser automatically attaching cookies to
requests. That automatic attachment is precisely what privacy protections are designed
to restrict. Since Chrome 80 (2020), Chromium has progressively tightened third-party
cookie handling: cookies are `SameSite=Lax` by default, and cross-site cookies (even
`SameSite=None; Secure`) are blocked by the Privacy Sandbox's third-party cookie phase-
out. When the site and the API are on different eTLD+1s — different public suffix
registrations — the API's cookies are third-party cookies from the site's perspective,
and they do not persist.

On a food-delivery platform's preview environment (2026-05-24) the site was deployed to
a `.pages.dev` host (Cloudflare Pages) and the API to a `.workers.dev` host (Cloudflare
Workers). These are two separate eTLD+1s: `pages.dev` and `workers.dev`. The API's
`Set-Cookie` response was `SameSite=None; Secure`. Modern Chromium blocked it.
`document.cookie` on the site origin was empty. Cookie-based CSRF protection on mutating
API routes returned 403 for every write. The app was functionally broken for all
authenticated operations in the preview environment.

## Why this matters

### The eTLD+1 boundary

A cookie is "same-site" if the registrable domain matches between the page origin and
the request target. The registrable domain is the eTLD+1: the effective top-level domain
(from the Public Suffix List) plus one label.

| Site origin | API origin | eTLD+1 match? |
|---|---|---|
| `app.example.com` | `api.example.com` | Yes — both `example.com` |
| `app.pages.dev` | `api.workers.dev` | No — `pages.dev` ≠ `workers.dev` |
| `app.example.com` | `api.example.com` | Yes — both `example.com` |

Preview deployments on multi-tenant platforms frequently violate the eTLD+1 match.
This is intentional for the platform (it prevents cross-tenant cookie access) and
unavoidable without a custom domain. The auth strategy must handle it.

### Why Bearer tokens are CSRF-safe

Cross-Site Request Forgery works because browsers automatically attach cookies to
requests. An attacker's page can trigger a `fetch('https://api.example.com/delete', {
method: 'DELETE' })` and the browser attaches the victim's session cookie — the API
cannot distinguish the legitimate request from the forged one.

`Authorization: Bearer <token>` is not automatically attached by the browser for any
request. An attacker's page cannot read `sessionStorage` from a different origin (same-
origin policy). Therefore a Bearer token in sessionStorage cannot be exfiltrated cross-
site, and a forged request cannot include it. Bearer tokens do not require CSRF
protection. This is a property of the credential transport mechanism, not of the token
format.

```
Cookie auth:     browser attaches automatically → CSRF protection required
Bearer (header): must be explicitly attached by JS → CSRF-safe by design
```

## How to apply

### 1. Return tokens in the response body

The login endpoint (and OAuth callback) returns both the session token and the CSRF
token in the JSON response body — in addition to, or instead of, a `Set-Cookie` header.

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

### 2. Store tokens in sessionStorage on the client

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

`sessionStorage` is used instead of `localStorage` because session tokens should not
outlive the browser session. A user closing the tab logs out — the correct security
posture for an app without an explicit "remember me" option.

### 3. Send tokens as Bearer + X-CSRF-Token

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

### 4. Accept either cookie or Bearer server-side

The API must accept both credential transports: cookie for same-origin production and
Bearer for cross-origin preview / native apps.

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

### 5. Collapse to one apex in production

In production, both the site and the API sit under the same registrable domain
(`example.com` / `api.example.com`). Cookies are same-site; no cross-origin
cookie blocking occurs. The Bearer path remains active as a fallback for native mobile
apps, CLI clients, and server-to-server integrations.

```
Preview:    app.pages.dev → api.workers.dev   (different eTLD+1; Bearer path)
Production: example.com → api.example.com      (same eTLD+1; cookie path)
```

This means the auth system is tested under its harder condition (cross-origin) in
preview before production. Any regression in the Bearer path is caught in review.

## Anti-patterns

**Relying on `SameSite=None; Secure` to survive cross-origin**

`SameSite=None; Secure` allows the cookie to be sent with cross-site requests, but
modern Chromium's third-party cookie blocking prevents it from being set in the first
place. A `Set-Cookie` response from a cross-origin API is simply ignored. The cookie
is never written.

**Using `localStorage` instead of `sessionStorage` for session tokens**

`localStorage` persists until explicitly cleared. A session token in `localStorage`
outlives the browser session — the user closes the tab, opens a new one, and is still
authenticated. For most apps this is unintended. Use `sessionStorage` unless
"remember me" persistence is an explicit product requirement.

**Not guarding the CSRF check behind the Bearer path**

If the CSRF guard does not recognise Bearer credentials and falls through to a cookie-
CSRF check, the Bearer path will fail with 403 on all mutating requests. The guard
must explicitly skip the CSRF header check when `Authorization: Bearer` is present.

## See also

[Tokens don't fit in cookies](/kb/platform/tokens-dont-fit-in-cookies) — the related
case where the token is too large for a cookie even on the same origin; both problems
lead to server-side session stores with only a session ID in the cookie.
