---
title: 'Un Service Worker che custodisce un token è un confused deputy'
category: platform
summary: 'Un SW (o qualunque broker in pagina) che esegue operazioni privilegiate con una credenziale memorizzata deve riverificare l''autorizzazione del chiamante su ogni rotta privilegiata: il gating a livello di UI non è un confine di sicurezza.'
principle: 'Ogni handler privilegiato dietro una credenziale memorizzata ricalcola il ruolo del chiamante e rifiuta prima di agire; il controllo vive nell''handler, non nella UI che lo chiama.'
severity: strong
tags: [platform, service-worker, rbac, confused-deputy, security]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-06-11
    note: 'Le rotte del SW per il cambio di ruolo nell''organizzazione e per gli inviti venivano eseguite con il token admin memorizzato e senza alcun controllo di ruolo; le rotte roles-config nella stessa codebase avevano il gate. Qualsiasi script same-origin poteva auto-promuoversi ad admin.'
related:
  - platform/proxy-must-pin-targets
  - platform/sanitize-html-before-injection
order: 7
updated: 2026-06-11
---

Un Service Worker che fa da backend-for-frontend finisce per custodire il token
dell'utente; è il suo lavoro. Le rotte al suo interno eseguono poi
chiamate alla API di GitHub con quel token. Il SW serve *ogni* script in esecuzione
sull'origine, non solo i componenti di UI che hai scritto tu. Una rotta privilegiata che si fida
del proprio chiamante può essere pilotata da qualunque script same-origin, che sia
un punto d'appoggio XSS, una dipendenza compromessa o un'estensione del browser con
accesso alla pagina.

Questo è il classico confused deputy: un componente con autorità (il token) che
esegue azioni per conto di un chiamante con minore autorità, senza controllare.

Su una SPA di amministrazione contenuti (2026-06-11) l'audit ha trovato tre rotte
del SW eseguite con il token admin memorizzato e **senza controllo di ruolo**:
`POST /api/github/org-role` (cambia il ruolo di chiunque), `POST /api/github/org-invite`
e la revoca dell'invito. Le rotte roles-config *nella stessa directory* il controllo
ce l'avevano. Quindi il pattern già esisteva, semplicemente non è mai stato applicato
agli handler più recenti. Una sola
`fetch('/api/github/org-role', {method: 'POST', body: '{"login":"me","role":"admin"}'})`
da qualunque contesto same-origin aggira l'intero modello RBAC.

## Come applicarlo

Un singolo gate condiviso, chiamato per primo in ogni handler privilegiato:

```ts
export const requireAdmin = (): Response | undefined => {
  const username = workerState.config?.username
  const role = username ? resolveRole(username) : undefined
  return role === 'admin' ? undefined : errorResponse('Admin only', 403)
}

// In each privileged handler:
return requireAdmin() ?? performPrivilegedThing(cfg, body)
```

La forma con `??` mantiene l'handler dichiarativo: il gate restituisce una `Response`
403 oppure `undefined`, e il lavoro vero parte solo una volta superato il gate.

Due scelte di design contano più dello snippet:

- **Il controllo ricalcola l'autorizzazione da uno stato che il chiamante non può
  impostare.** Qui il ruolo si risolve dal file dei ruoli dell'organizzazione e dalla
  cache degli org-admin. Non legge mai un campo della richiesta né alcunché che
  postMessage possa trasportare.
- **GitHub continua comunque a far rispettare gli scope del token sotto.** Il gate del
  SW è difesa in profondità. Il suo compito è trasformare "qualsiasi XSS significa
  takeover dell'organizzazione" in "l'XSS è confinato a ciò che l'utente corrente
  poteva già fare comunque".

## Anti-pattern

```ts
// "Only the admin UI calls this route."
// The SW cannot know that. Every same-origin script is a caller.
export const handleSetRole = async (request: Request) =>
  applyRole(cfg.owner, cfg.token, await request.json())

// Checking in the component instead of the handler:
v-if="role === 'admin'" // hides the button; the route still answers anyone
```

Sintomo: niente, finché qualcuno di ostile non lo trova. I controlli di privilegio che
vivono solo nei template non producono errori né log, quindi di solito il primo segnale
che ottieni è il rilievo dell'audit.

## Applicazione

Un unit test per ogni rotta privilegiata che verifichi 403 per un chiamante non admin e
successo per un admin, con la chiamata a GitHub mockata e verificata **non chiamata** nel
percorso di rifiuto. Regola di review a livello di grep: ogni handler che legge
`config.token` deve o chiamare il gate o portare un commento che spieghi perché è
pubblico.
