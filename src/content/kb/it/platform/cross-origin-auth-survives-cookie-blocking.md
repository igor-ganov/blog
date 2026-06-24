---
title: 'Auth cross-origin che sopravvive al blocco dei cookie di terze parti'
category: platform
summary: 'Quando sito e API stanno su eTLD+1 diversi, i cookie non possono trasportare l''auth — restituisci i token nel corpo della risposta, salvali in sessionStorage e inviali come Authorization: Bearer; in produzione riduci tutto a un unico apex.'
principle: 'Quando il sito e l''API stanno su eTLD+1 diversi, restituisci i token di sessione e CSRF nel corpo della risposta, salvali in sessionStorage e invia Authorization: Bearer; lato server accetta sia il cookie sia il Bearer; in produzione riduci tutto a un unico apex, dove i cookie funzionano nativamente.'
severity: strong
tags: [platform, auth, cookies, cors, csrf, sessions, bearer-token]
sources:
  - project: 'una piattaforma di food delivery'
    date: 2026-05-24
    note: 'token nel corpo→sessionStorage→Bearer; accetta cookie o Bearer; il Bearer è CSRF-safe; un unico apex in prod'
related:
  - platform/tokens-dont-fit-in-cookies
  - error-handling/always-check-res-ok
order: 2
updated: 2026-05-24
---

L'autenticazione basata su cookie si appoggia al browser, che attacca i cookie alle
richieste da solo. È proprio quell'attaccamento automatico il bersaglio delle protezioni
sulla privacy. Da Chrome 80 (2020), Chromium ha stretto progressivamente la gestione dei
cookie di terze parti. I cookie ora hanno per default `SameSite=Lax`, e i cookie cross-site
(anche `SameSite=None; Secure`) vengono bloccati dalla fase di eliminazione dei cookie di
terze parti del Privacy Sandbox. Quando il sito e l'API vivono su eTLD+1 diversi, cioè
registrazioni con public suffix diverso, i cookie dell'API sono cookie di terze parti dal
punto di vista del sito, quindi non si fissano mai.

L'ambiente di preview di una piattaforma di food delivery (2026-05-24) l'ha reso concreto.
Il sito era pubblicato su un host `.pages.dev` (Cloudflare Pages) e l'API su un host
`.workers.dev` (Cloudflare Workers), che sono due eTLD+1 distinti: `pages.dev` e
`workers.dev`. L'API rispondeva con `Set-Cookie: SameSite=None; Secure`, Chromium moderno
lo scartava e `document.cookie` sull'origin del sito tornava vuoto. Senza un cookie da
validare, la protezione CSRF basata su cookie sulle rotte API mutanti restituiva 403 per
ogni scrittura, e ogni operazione autenticata in preview era morta.

## Perché conta

### Il confine dell'eTLD+1

Un cookie è considerato "same-site" quando il dominio registrabile coincide tra l'origin
della pagina e il bersaglio della richiesta. Il dominio registrabile è l'eTLD+1: il
dominio di primo livello effettivo (dalla Public Suffix List) più un'etichetta.

| Origin del sito | Origin dell'API | eTLD+1 coincide? |
|---|---|---|
| `app.example.com` | `api.example.com` | Sì — entrambi `example.com` |
| `app.pages.dev` | `api.workers.dev` | No — `pages.dev` ≠ `workers.dev` |
| `app.example.com` | `api.example.com` | Sì — entrambi `example.com` |

I deployment di preview sulle piattaforme multi-tenant rompono di continuo la
corrispondenza dell'eTLD+1. La piattaforma lo fa di proposito per impedire l'accesso ai
cookie tra tenant diversi, e non puoi evitarlo senza un dominio custom, quindi la strategia
di auth deve saperci convivere.

### Perché i token Bearer sono CSRF-safe

Il Cross-Site Request Forgery funziona perché il browser attacca i cookie alle richieste
in automatico. La pagina di un attaccante può lanciare `fetch('https://api.example.com/delete', {
method: 'DELETE' })`, il browser ci appiccica il cookie di sessione della vittima e l'API
non ha modo di distinguere la richiesta legittima da quella falsificata.

`Authorization: Bearer <token>` non viaggia mai in automatico. La pagina di un attaccante,
inoltre, non può leggere il `sessionStorage` di un altro origin, grazie alla same-origin
policy. Quindi un token Bearer in sessionStorage non può essere esfiltrato cross-site, e
una richiesta falsificata non ha modo di includerlo. I token Bearer non hanno bisogno di
protezione CSRF, e questo deriva dal trasporto stesso della credenziale, non dal formato
del token.

```
Cookie auth:     browser attaches automatically → CSRF protection required
Bearer (header): must be explicitly attached by JS → CSRF-safe by design
```

## Come applicarlo

### 1. Restituisci i token nel corpo della risposta

L'endpoint di login (e la callback OAuth) restituisce sia il token di sessione sia il token
CSRF nel corpo JSON della risposta, accanto o al posto di un header `Set-Cookie`.

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

### 2. Salva i token in sessionStorage lato client

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

Qui usa `sessionStorage` invece di `localStorage`, perché un token di sessione non dovrebbe
sopravvivere alla sessione del browser. Chiudere la scheda disconnette l'utente, che è la
postura di sicurezza giusta per un'app senza un'opzione esplicita di "ricordami".

### 3. Invia i token come Bearer + X-CSRF-Token

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

### 4. Lato server accetta sia il cookie sia il Bearer

L'API deve accettare entrambi i trasporti di credenziale: il cookie per la produzione
same-origin e il Bearer per la preview cross-origin e per le app native.

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

### 5. Riduci tutto a un unico apex in produzione

In produzione, sia il sito sia l'API stanno sotto lo stesso dominio registrabile
(`example.com` / `api.example.com`). Lì i cookie sono same-site, quindi non scatta alcun
blocco cross-origin. Il percorso Bearer resta attivo come fallback per le app mobile
native, i client CLI e le integrazioni server-to-server.

```
Preview:    app.pages.dev → api.workers.dev   (different eTLD+1; Bearer path)
Production: example.com → api.example.com      (same eTLD+1; cookie path)
```

Il sistema di auth viene messo alla prova nella sua condizione più dura, cioè cross-origin,
in preview prima di arrivare in produzione, così una regressione nel percorso Bearer salta
fuori durante la review.

## Anti-pattern

**Contare su `SameSite=None; Secure` per sopravvivere al cross-origin**

`SameSite=None; Secure` permette al cookie di viaggiare con le richieste cross-site, ma il
blocco dei cookie di terze parti di Chromium moderno gli impedisce di essere impostato in
primo luogo. Una risposta `Set-Cookie` da un'API cross-origin viene ignorata, e il cookie
non viene mai scritto.

**Usare `localStorage` invece di `sessionStorage` per i token di sessione**

`localStorage` persiste finché qualcosa non lo svuota esplicitamente. Un token di sessione
parcheggiato lì sopravvive alla sessione del browser, quindi l'utente chiude la scheda, ne
apre una nuova ed è ancora loggato. Per la maggior parte delle app è una sorpresa che
nessuno ha chiesto. Resta su `sessionStorage`, a meno che la persistenza "ricordami" non
sia un requisito di prodotto esplicito.

**Non proteggere il controllo CSRF dietro il percorso Bearer**

Se la guardia CSRF non riconosce le credenziali Bearer e ricade su un controllo CSRF basato
su cookie, il percorso Bearer fallisce con 403 a ogni richiesta mutante. La guardia deve
saltare esplicitamente il controllo dell'header CSRF quando è presente
`Authorization: Bearer`.

## Vedi anche

[I token non entrano nei cookie](/principles/platform/tokens-dont-fit-in-cookies) — il caso
correlato in cui il token è troppo grande per un cookie anche sullo stesso origin. Entrambi
i problemi ti spingono verso store di sessione lato server che tengono nel cookie solo un
ID di sessione.
