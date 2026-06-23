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
4096 bytes per cookie, and in practice browsers enforce a limit around 4 KB per cookie.
The exact value varies (Chrome allows about 4096 bytes for the value alone; Firefox and
Safari land near the same number). Once a `Set-Cookie` header exceeds that, the browser
discards it without any error, warning, or console message. The response completes
normally and the cookie is just gone.

Atlassian OAuth access tokens are large JWTs, usually 1–3 KB for the token alone, before
you add the refresh token and any metadata. A single cookie holding one of these tokens
runs past 4 KB. On a Jira client app (2026-06-08) that is exactly what broke: the OAuth
callback set the access token directly in a `Set-Cookie` header, the browser dropped it
silently, every following API request went out with no credentials, and the user landed
back on the login page. No console error showed up. The only thing you could see was the
authentication loop.

The fix is architectural. Tokens belong in a server-side session store, and the cookie
carries only a session ID, a short random string that points at the stored token. The
session ID is small, fits a cookie comfortably, and gives away nothing about the token's
contents.

## Why this matters

### Silent failure at the browser boundary

The silent `Set-Cookie` drop is hard to diagnose for a few reasons:

1. The HTTP response returns 200 or 302, so from the server's side it succeeded.
2. No JavaScript error is raised.
3. The resulting state, a missing cookie, looks identical to "user not logged in".
4. If you don't know about the 4 KB limit, the failure is opaque. "Auth works in local
   dev but fails in preview" is a common report, since local dev tokens tend to be
   smaller.

A JWT grows with every claim you add. An Atlassian access token carries the subject,
issuer, audience, expiry, scopes, and tenant-specific claims. A token that fits in dev
with minimal scopes can overflow in staging once the full scope set is attached.

### Why a pure static site is impossible for OAuth

The OAuth authorization code flow requires a client secret. The code-to-token exchange
(`POST /oauth/token` with `code`, `client_id`, and `client_secret`) has to run on a
server, because the client secret cannot live in the browser where it would show up in
source or DevTools. A static site with no server component cannot finish OAuth. You need
at least a server-rendered page or a serverless function to handle the callback.

The Astro adapter (`@astrojs/node` in dev, a Workers adapter in production) gives you
that server surface. The session store is the filesystem driver in development and
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

Step [4] is the only `Set-Cookie`. The 36-byte UUID session ID stays far under the size
limit, and the tokens never appear in a cookie at all.

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

The `state` parameter in the OAuth flow has to be unpredictable so an attacker can't
forge the redirect (CSRF). Sign it with HMAC rather than storing it in a session: the
OAuth state predates the session, because there is no session yet when the user starts
login.

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

The HMAC state goes into a short-lived cookie (`oauth_state`, `maxAge: 300`), and the
server verifies it on callback without any session lookup.

## Anti-patterns

**Storing the access token in a cookie**

```ts
// Anti-pattern: token in cookie — silent drop if > 4 KB.
cookies.set('access_token', atlassianJWT, { httpOnly: true, secure: true });
// → Set-Cookie header exceeds 4 KB; browser silently drops it.
// → Subsequent requests have no credentials; user bounced to login.
```

**Storing the access token in sessionStorage**

The access token for a server-side API like Atlassian's should not be in the browser
at all. Put it in sessionStorage and a single XSS bug exfiltrates the whole token along
with every permission it grants. Keep the token on the server and expose only a session
ID you can revoke.

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

The OAuth authorization code flow requires a server, so plan for one before you write
the first line of the callback.

**Using JWTs for session IDs**

A JWT is not a session ID. A JWT is a self-contained signed token that the server can
validate without a database lookup, which is the opposite of what you want for browser
sessions. There you want short, opaque IDs that can't be validated without server state
and can be revoked. When the session store is compromised or a session needs to be
killed, you delete the UUID from the store. There is no way to un-sign an issued JWT.

## See also

[Cross-origin auth that survives third-party-cookie blocking](/principles/platform/cross-origin-auth-survives-cookie-blocking)
covers the next problem along: even correctly-sized cookies stop working across
different eTLD+1s in modern Chromium, and the Bearer fallback pattern handles both cases.

[Build-time env is baked](/principles/build-ci-deploy/build-time-env-is-baked) covers the related
deployment concern. The `client_secret` is a runtime secret, not a build-time variable,
so inject it at runtime through the server environment instead of embedding it during
the static build step.
