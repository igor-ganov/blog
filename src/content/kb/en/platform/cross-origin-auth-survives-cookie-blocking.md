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

Cookie-based authentication leans on the browser to attach cookies to requests on its
own. That automatic attachment is exactly the behaviour privacy protections set out to
restrict. Since Chrome 80 (2020), Chromium has steadily tightened third-party cookie
handling. Cookies default to `SameSite=Lax`, and cross-site cookies (even
`SameSite=None; Secure`) get blocked by the Privacy Sandbox's third-party cookie phase-
out. Once the site and the API live on different eTLD+1s, meaning different public suffix
registrations, the API's cookies are third-party cookies as far as the site is concerned,
so they never stick.

A food-delivery platform's preview environment (2026-05-24) made this concrete. The site
was deployed to a `.pages.dev` host (Cloudflare Pages) and the API to a `.workers.dev`
host (Cloudflare Workers), which are two separate eTLD+1s: `pages.dev` and `workers.dev`.
The API replied with `Set-Cookie: SameSite=None; Secure`, modern Chromium dropped it, and
`document.cookie` on the site origin came back empty. With no cookie to validate against,
cookie-based CSRF protection on mutating API routes returned 403 for every write, and
every authenticated operation in preview was dead.

## Why this matters

### The eTLD+1 boundary

A cookie counts as "same-site" when the registrable domain matches between the page origin
and the request target. The registrable domain is the eTLD+1: the effective top-level
domain (from the Public Suffix List) plus one label.

| Site origin | API origin | eTLD+1 match? |
|---|---|---|
| `app.example.com` | `api.example.com` | Yes — both `example.com` |
| `app.pages.dev` | `api.workers.dev` | No — `pages.dev` ≠ `workers.dev` |
| `app.example.com` | `api.example.com` | Yes — both `example.com` |

Preview deployments on multi-tenant platforms break the eTLD+1 match all the time. The
platform does this on purpose to prevent cross-tenant cookie access, and you cannot avoid
it without a custom domain, so the auth strategy has to cope with it.

### Why Bearer tokens are CSRF-safe

Cross-Site Request Forgery works because the browser attaches cookies to requests
automatically. An attacker's page can fire `fetch('https://api.example.com/delete', {
method: 'DELETE' })`, the browser tacks on the victim's session cookie, and the API has
no way to tell the legitimate request from the forged one.

`Authorization: Bearer <token>` never rides along automatically. An attacker's page also
cannot read `sessionStorage` from a different origin, thanks to the same-origin policy. So
a Bearer token in sessionStorage cannot be exfiltrated cross-site, and a forged request
has no way to include it. Bearer tokens need no CSRF protection, and that comes from the
credential transport itself rather than the token format.

```
Cookie auth:     browser attaches automatically → CSRF protection required
Bearer (header): must be explicitly attached by JS → CSRF-safe by design
```

## How to apply

### 1. Return tokens in the response body

The login endpoint (and the OAuth callback) returns both the session token and the CSRF
token in the JSON response body, alongside or in place of a `Set-Cookie` header.

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

Use `sessionStorage` rather than `localStorage` here because a session token should not
outlive the browser session. Closing the tab logs the user out, which is the right
security posture for an app that has no explicit "remember me" option.

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

The API has to accept both credential transports: cookie for same-origin production, and
Bearer for cross-origin preview and native apps.

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
(`example.com` / `api.example.com`). Cookies are same-site there, so no cross-origin
cookie blocking happens. The Bearer path stays live as a fallback for native mobile apps,
CLI clients, and server-to-server integrations.

```
Preview:    app.pages.dev → api.workers.dev   (different eTLD+1; Bearer path)
Production: example.com → api.example.com      (same eTLD+1; cookie path)
```

The upshot is that the auth system gets exercised under its harder condition, cross-origin,
in preview before it ever reaches production, so a regression in the Bearer path surfaces
during review.

## Anti-patterns

**Relying on `SameSite=None; Secure` to survive cross-origin**

`SameSite=None; Secure` lets the cookie travel with cross-site requests, but modern
Chromium's third-party cookie blocking stops it from being set in the first place. A
`Set-Cookie` response from a cross-origin API gets ignored, and the cookie is never
written.

**Using `localStorage` instead of `sessionStorage` for session tokens**

`localStorage` persists until something explicitly clears it. A session token parked there
outlives the browser session, so the user closes the tab, opens a new one, and is still
logged in. For most apps that is a surprise nobody asked for. Stick with `sessionStorage`
unless "remember me" persistence is an explicit product requirement.

**Not guarding the CSRF check behind the Bearer path**

If the CSRF guard does not recognise Bearer credentials and falls through to a cookie-CSRF
check, the Bearer path fails with 403 on every mutating request. The guard has to skip the
CSRF header check explicitly when `Authorization: Bearer` is present.

## See also

[Tokens don't fit in cookies](/principles/platform/tokens-dont-fit-in-cookies) — the related
case where the token is too large for a cookie even on the same origin. Both problems push
you toward server-side session stores that keep only a session ID in the cookie.
