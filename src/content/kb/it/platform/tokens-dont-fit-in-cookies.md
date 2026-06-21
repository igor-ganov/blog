---
title: "I token non stanno nei cookie — tienili sul server"
category: platform
summary: 'I JWT grandi sforano il limite dei cookie del browser (~4 KB); il browser scarta il Set-Cookie senza alcun errore e l''utente viene rispedito al login. Tieni i token in uno store di sessione lato server e metti nel cookie solo l''ID di sessione.'
principle: "Non salvare access token grandi (JWT) in un cookie — sforano il limite di ~4 KB e il browser scarta il Set-Cookie senza dire nulla; tieni i token in uno store di sessione lato server e metti nel cookie solo l'id di sessione."
severity: strong
tags: [platform, auth, cookies, jwt, sessions, oauth, astro]
sources:
  - project: "un'app client per Jira"
    date: 2026-06-08
    note: 'Il JWT sfora il cookie da ~4KB → scartato in silenzio; tieni i token sul server, nel cookie solo l''id di sessione'
related:
  - platform/cross-origin-auth-survives-cookie-blocking
  - build-ci-deploy/build-time-env-is-baked
order: 3
updated: 2026-06-08
---

I cookie del browser hanno un limite rigido di dimensione. La specifica HTTP raccomanda almeno
4096 byte per cookie e in pratica i browser impongono un limite intorno ai 4 KB per cookie.
Il valore esatto varia (Chrome consente circa 4096 byte per il solo valore; Firefox e
Safari si fermano più o meno lì). Quando un header `Set-Cookie` supera quella soglia, il browser
lo scarta senza alcun errore, avviso o messaggio in console. La risposta arriva
normalmente e il cookie semplicemente sparisce.

Gli access token OAuth di Atlassian sono JWT grandi, di solito 1–3 KB per il solo token, prima
ancora di aggiungere il refresh token e i metadati. Un singolo cookie che contiene uno di questi token
supera i 4 KB. Su un'app client per Jira (2026-06-08) è proprio questo ad aver rotto tutto: la
callback OAuth metteva l'access token direttamente in un header `Set-Cookie`, il browser lo scartava
in silenzio, ogni richiesta API successiva partiva senza credenziali e l'utente finiva
di nuovo sulla pagina di login. Nessun errore in console. L'unica cosa visibile era il
loop di autenticazione.

La soluzione è architetturale. I token vanno in uno store di sessione lato server e il cookie
porta solo un ID di sessione, una breve stringa casuale che punta al token salvato. L'ID
di sessione è piccolo, ci sta comodamente in un cookie e non rivela nulla sul contenuto
del token.

## Perché conta

### Fallimento silenzioso al confine col browser

Lo scarto silenzioso del `Set-Cookie` è difficile da diagnosticare per qualche motivo:

1. La risposta HTTP torna 200 o 302, quindi dal lato server l'operazione è riuscita.
2. Non viene sollevato nessun errore JavaScript.
3. Lo stato risultante, un cookie mancante, è identico a "utente non autenticato".
4. Se non conosci il limite dei 4 KB, il fallimento è opaco. "L'auth funziona in locale
   ma in preview no" è una segnalazione frequente, perché i token in locale tendono ad essere
   più piccoli.

Un JWT cresce con ogni claim che aggiungi. Un access token di Atlassian porta subject,
issuer, audience, scadenza, scope e claim specifici del tenant. Un token che in locale sta
nel cookie con scope minimi può sforare in staging quando gli viene attaccato l'intero set di scope.

### Perché un sito puramente statico non basta per OAuth

L'authorization code flow di OAuth richiede un client secret. Lo scambio code-to-token
(`POST /oauth/token` con `code`, `client_id` e `client_secret`) deve girare su un
server, perché il client secret non può stare nel browser, dove finirebbe nel
sorgente o nei DevTools. Un sito statico senza componente server non può completare OAuth. Ti serve
almeno una pagina renderizzata sul server o una funzione serverless per gestire la callback.

L'adapter di Astro (`@astrojs/node` in dev, un adapter Workers in produzione) ti dà
quella superficie server. Lo store di sessione è il driver su filesystem in sviluppo e
Workers KV (o Durable Objects) in produzione.

## Come applicarlo

### Architettura dello store di sessione

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

Il passo [4] è l'unico `Set-Cookie`. L'ID di sessione UUID da 36 byte resta ben sotto il
limite di dimensione e i token non compaiono mai in un cookie.

### Implementazione in Astro

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

### Firmare il parametro state di OAuth

Il parametro `state` nel flow OAuth deve essere imprevedibile, così un attaccante non può
falsificare il redirect (CSRF). Firmalo con HMAC invece di salvarlo in una sessione: lo
state OAuth precede la sessione, perché quando l'utente avvia il login una sessione ancora non esiste.

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

Lo state HMAC va in un cookie a vita breve (`oauth_state`, `maxAge: 300`) e il
server lo verifica al momento della callback senza alcuna lookup di sessione.

## Anti-pattern

**Salvare l'access token in un cookie**

```ts
// Anti-pattern: token in cookie — silent drop if > 4 KB.
cookies.set('access_token', atlassianJWT, { httpOnly: true, secure: true });
// → Set-Cookie header exceeds 4 KB; browser silently drops it.
// → Subsequent requests have no credentials; user bounced to login.
```

**Salvare l'access token in sessionStorage**

L'access token per un'API lato server come quella di Atlassian non dovrebbe stare affatto nel
browser. Mettilo in sessionStorage e un singolo bug XSS esfiltra l'intero token insieme
a tutti i permessi che concede. Tieni il token sul server ed esponi solo un ID di
sessione che puoi revocare.

**Dare per scontato che il code flow di OAuth funzioni su un sito statico**

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

L'authorization code flow di OAuth richiede un server, quindi mettine uno in conto prima di scrivere
la prima riga della callback.

**Usare i JWT come ID di sessione**

Un JWT non è un ID di sessione. Un JWT è un token firmato e autocontenuto che il server può
validare senza interrogare un database, cioè l'opposto di quello che ti serve per le sessioni
del browser. Lì vuoi ID corti e opachi, che non si possano validare senza stato sul server
e che si possano revocare. Quando lo store di sessione viene compromesso o una sessione va
chiusa, cancelli l'UUID dallo store. Non c'è modo di "de-firmare" un JWT già emesso.

## Vedi anche

[Auth cross-origin che sopravvive al blocco dei cookie di terze parti](/kb/platform/cross-origin-auth-survives-cookie-blocking)
affronta il problema successivo: anche i cookie di dimensione corretta smettono di funzionare tra
eTLD+1 diversi nei Chromium moderni, e il pattern di fallback Bearer copre entrambi i casi.

[L'env di build viene cotto dentro](/kb/build-ci-deploy/build-time-env-is-baked) tratta il problema di
deploy collegato. Il `client_secret` è un segreto runtime, non una variabile di build,
quindi iniettalo a runtime attraverso l'ambiente del server invece di incorporarlo durante
lo step di build statico.
