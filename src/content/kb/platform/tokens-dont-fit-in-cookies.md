---
title: "Tokens don't fit in cookies — keep them server-side"
category: platform
summary: 'Large JWTs overflow the ~4 KB browser cookie limit; the browser silently drops Set-Cookie with no error, and the user bounces to login. Keep tokens in a server-side session store; put only the session ID in the cookie.'
principle: "Don't store large access tokens (JWTs) in a cookie — they overflow the ~4 KB cookie limit and the browser silently drops Set-Cookie; keep tokens in a server-side session store and put only the session id in the cookie."
severity: strong
tags: [platform, auth, cookies, jwt, sessions, oauth, astro]
sources:
  - project: 'a Jira client app'
    date: 2026-06-08
    note: 'JWT overflows ~4KB cookie → silently dropped; keep tokens server-side, only session id in cookie'
related:
  - platform/cross-origin-auth-survives-cookie-blocking
  - build-ci-deploy/build-time-env-is-baked
order: 3
updated: 2026-06-08
---

Browser cookies have a hard size limit. The HTTP specification recommends at least
4096 bytes per cookie; in practice, browsers enforce a limit in the range of 4 KB per
cookie (the exact value varies: Chrome ≈ 4096 bytes for the value alone; Firefox and
Safari are similar). When a `Set-Cookie` header exceeds this limit, the browser silently
discards it. No error, no warning, no console message. The response completes normally.
The cookie is not stored.

Atlassian OAuth access tokens are large JWTs — typically 1–3 KB for the token itself,
plus the refresh token, plus any metadata. A typical Atlassian access token stored in
a single cookie exceeds 4 KB. On a Jira client app (2026-06-08) this produced the
exact failure: the OAuth callback attempted to set the access token directly in a
`Set-Cookie` header; the browser dropped it silently; every subsequent API request had
no credentials; the user was redirected back to the login page. There was no console
error. The only observable symptom was the authentication loop.

The fix is architectural, not cosmetic: tokens belong in a server-side session store.
The cookie carries only a session ID — a short random string — that points to the
stored token. The session ID is small, safe for a cookie, and reveals nothing about
the token's contents.

## Why this matters

### Silent failure at the browser boundary

The silent `Set-Cookie` drop is uniquely dangerous because:

1. The HTTP response returns 200 or 302 — success from the server's point of view.
2. No JavaScript error is raised.
3. The subsequent state (missing cookie) looks identical to "user not logged in".
4. Without knowing the 4 KB limit, the diagnosis is opaque — "auth works in local dev
   but fails in preview" is a common symptom, because local dev tokens are smaller.

A JWT grows with every claim added. An Atlassian access token includes the subject,
issuer, audience, expiry, scopes, and tenant-specific claims. A token that fits in dev
with minimal scopes may overflow in staging with a full scope set.

### Why a pure static site is impossible for OAuth

The OAuth authorization code flow requires a client secret. The code-to-token exchange
(`POST /oauth/token` with `code`, `client_id`, and `client_secret`) must happen on a
server — the client secret cannot be in the browser (it would be visible in source or
DevTools). A static site with no server component cannot complete OAuth. This
architecture requires at minimum a server-rendered page or a serverless function to
handle the callback.

The Astro adapter (`@astrojs/node` in dev, a Workers adapter in production) provides
this server surface. The session store is the filesystem driver in development and
Workers KV (or Durable Objects) in production.

## How to apply

### Session store architecture

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

Step [4] is the only `Set-Cookie`. The 36-byte UUID session ID is safe from the size
limit. The tokens never appear in a cookie.

### Astro implementation

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

### Signing the OAuth state parameter

The `state` parameter in the OAuth flow must be unpredictable to prevent CSRF during
the OAuth redirect. It should be HMAC-signed rather than stored in a session, because
the OAuth state predates the session (there is no session yet when the user starts
login).

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

The HMAC state goes into a short-lived cookie (`oauth_state`; `maxAge: 300`); the server
verifies it on callback without any session lookup.

## Anti-patterns

**Storing the access token in a cookie**

```ts
// Anti-pattern: token in cookie — silent drop if > 4 KB.
cookies.set('access_token', atlassianJWT, { httpOnly: true, secure: true });
// → Set-Cookie header exceeds 4 KB; browser silently drops it.
// → Subsequent requests have no credentials; user bounced to login.
```

**Storing the access token in sessionStorage**

The access token for a server-side API (like Atlassian's) should not be in the browser
at all. If it is in sessionStorage, a single XSS vulnerability exfiltrates the full
token and all permissions it represents. Keep the token on the server; expose only a
session ID that can be revoked.

**Assuming the OAuth code flow works on a static site**

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

OAuth authorization code flow requires a server. Plan for it from the start.

**Using JWTs for session IDs**

A JWT is not a session ID. A JWT is a self-contained signed token — the server can
validate it without a database lookup. But for browser session management you want
revocable, short, opaque IDs that cannot be validated without server state. If the
session store is compromised or a session must be invalidated, a UUID in the store can
be deleted. A signed JWT cannot be un-signed.

## See also

[Cross-origin auth that survives third-party-cookie blocking](/kb/platform/cross-origin-auth-survives-cookie-blocking) —
the complementary problem: even correctly-sized cookies do not work across different
eTLD+1s in modern Chromium; the Bearer fallback pattern handles both cases.

[Build-time env is baked](/kb/build-ci-deploy/build-time-env-is-baked) — the related
deployment concern: the `client_secret` is a runtime secret, not a build-time variable,
and must be injected at runtime through the server environment, not embedded during the
static build step.
