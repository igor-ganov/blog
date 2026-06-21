---
title: 'Controlla sempre res.ok — non inventare il successo'
category: error-handling
summary: 'Un wrapper di fetch che restituisce {success:true} senza guardare res.ok mente a chi lo chiama; la UI si ricarica, mostra dati vecchi e l''utente passa ore a chiedersi perché non si salva niente.'
principle: 'Qualunque wrapper attorno a fetch/swFetch deve lanciare un''eccezione su !res.ok; mai restituire {success:true} senza controllare la risposta.'
severity: non-negotiable
tags: [error-handling, fetch, service-worker, reliability]
sources:
  - project: 'una SPA di content-admin'
    date: 2026-04-29
    note: 'I gestori RBAC restituivano {success:true} mentre GitHub rispondeva 4xx; lanciare su !res.ok tramite ensureOk/okOrThrow'
related:
  - error-handling/never-swallow-errors
  - backend-events/telemetry-never-crashes
order: 2
updated: 2026-04-29
---

Una chiamata `fetch` che riceve un `4xx` o un `5xx` **non** lancia un'eccezione. La
`Promise` si risolve normalmente, e solo `res.ok` ti dice se il server ha accettato la
richiesta. Un wrapper che ignora questo dettaglio e restituisce `{ success: true }` sta
fabbricando un segnale di successo a partire da un fallimento, cosa che equivale a
[ingoiare l'errore](/kb/error-handling/never-swallow-errors) con qualche passaggio in più.
Chi chiama crede che la scrittura sia andata a buon fine, quindi la UI si ricarica e mostra
lo stato vecchio. L'utente non vede nulla di strano, riprova, di nuovo non vede nulla di
strano, e alla fine apre una segnalazione che dice "non si salva niente".

La regola è assoluta: **qualunque codice che incapsula `fetch` o `swFetch` deve lanciare
su `!res.ok`** prima di restituire qualsiasi cosa a chi lo chiama.

## Perché conta

Il 2026-04-29 il livello RBAC della SPA di content-admin è stato analizzato dopo che
qualcuno ha finalmente individuato il sintomo: i salvataggi non facevano nulla, in
silenzio. Era riproducibile da un periodo imprecisato, e le stesse operazioni venivano
ritentate a mano per ore prima che qualcuno facesse escalation.

La causa stava in quattro gestori che coprivano la parte critica dell'RBAC:

- iscrizione all'organizzazione `PUT`
- iscrizione al team `PUT`
- invito `POST`
- revoca `DELETE`

Ogni gestore chiamava la GitHub API tramite `swFetch`, non leggeva alcuna proprietà della
risposta e restituiva `{ success: true }`. GitHub aveva risposto con `4xx` per problemi di
permessi, token scaduti e payload malformati, ma il service worker segnalava successo a
ogni chiamata. La UI riceveva quel segnale di successo, faceva ripartire una richiesta
della lista delle iscrizioni e mostrava lo stato invariato come se tutto fosse andato a
buon fine. Il form sembrava funzionare mentre i dati non si muovevano mai.

Lo stesso schema di successo fabbricato è saltato fuori nei gestori degli asset durante la
stessa finestra di analisi. Upload file, eliminazione file e operazioni in blocco
restituivano tutti `{ success: true }` senza guardare la risposta, quindi un `503` della
CDN o un `409` dello storage veniva accettato in silenzio come scrittura confermata.

La correzione aveva due parti. Ogni gestore ha ottenuto un controllo esplicito di `res.ok`
che lancia un errore tipizzato contenente lo status code e il corpo della risposta. Poi due
helper, `ensureOk` in `src/sw/rbac/response-ok.ts` e `okOrThrow` in
`src/views/SettingsView/org-invite-api.ts`, sono stati spostati nel livello condiviso in
modo che i gestori futuri abbiano un unico punto di chiamata verificabile invece di
ripetere il controllo inline.

Un `{ success: true }` fabbricato è un `catch (() => {})` implicito su un fallimento HTTP,
e questo rende l'incidente un corollario diretto del principio "non ingoiare gli errori".

## Come applicarlo

### L'helper okOrThrow

Centralizza il controllo. Mettere `if (!res.ok) throw ...` inline in ogni gestore garantisce
che da qualche parte venga dimenticato o scritto in modo diverso, quindi estrailo una volta
sola.

```ts
// src/views/SettingsView/org-invite-api.ts  (canonical client-side helper)

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message = `HTTP ${status}`,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Asserts res.ok, consuming the body for the error message when it is not.
 * Throws HttpError so callers can distinguish network errors from HTTP errors.
 */
export const okOrThrow = async (res: Response): Promise<Response> => {
  if (res.ok) return res;
  const body = await res.text().catch(() => '(unreadable)');
  throw new HttpError(res.status, body);
};
```

```ts
// src/sw/rbac/response-ok.ts  (service-worker mirror, identical contract)

export const ensureOk = async (res: Response): Promise<Response> => {
  if (res.ok) return res;
  const body = await res.text().catch(() => '(unreadable)');
  throw new HttpError(res.status, body);
};
```

Entrambi condividono lo stesso contratto. Restituiscono la `Response` in caso di successo,
così chi chiama può continuare a concatenare `.json()` o `.text()`, e lanciano un
`HttpError` tipizzato in caso di fallimento, così chi chiama può ispezionare lo status in un
catch type-safe.

### Incapsulare swFetch in un gestore del service worker

```ts
// ❌ Before — fabricated success regardless of GitHub's answer.
const handleOrgMembershipPut = async (
  event: ExtendableMessageEvent,
): Promise<void> => {
  const { org, username, role } = event.data;
  await swFetch(`/orgs/${org}/memberships/${username}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
  event.ports[0].postMessage({ success: true }); // GitHub may have said 422.
};

// ✅ After — throws before the success message is ever sent.
const handleOrgMembershipPut = async (
  event: ExtendableMessageEvent,
): Promise<void> => {
  const { org, username, role } = event.data;
  const res = await swFetch(`/orgs/${org}/memberships/${username}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
  await ensureOk(res); // throws HttpError if GitHub returned 4xx/5xx
  event.ports[0].postMessage({ success: true });
};
```

La riga `event.ports[0].postMessage({ success: true })` ora è raggiungibile solo quando
`ensureOk` non ha lanciato. Qualunque `HttpError` si propaga al catch di primo livello del
gestore dei messaggi del SW, che rispedisce `{ success: false, error: ... }` al client.

### Incapsulare fetch lato client

La stessa disciplina vale per il codice fuori dal SW. Qualunque funzione che chiama `fetch`
direttamente deve far passare la risposta attraverso `okOrThrow` prima di trattarla come
riuscita.

```ts
// ❌ Before — no status check; a 403 lands silently.
export const postInvite = async (org: string, email: string): Promise<void> => {
  await fetch(`/api/orgs/${org}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

// ✅ After — okOrThrow throws; the caller's catch surfaces it to the UI.
export const postInvite = async (org: string, email: string): Promise<void> => {
  const res = await fetch(`/api/orgs/${org}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  await okOrThrow(res);
};
```

Dato che `okOrThrow` restituisce la `Response`, puoi concatenarlo inline quando ti serve
anche il corpo:

```ts
const data = await fetch(url)
  .then(okOrThrow)
  .then((res) => res.json() as Promise<InviteResult>);
```

### Cosa deve fare chi chiama con l'errore lanciato

Lanciare è solo metà del contratto. Chi chiama deve catturare `HttpError` e indirizzarlo da
qualche parte visibile, come un toast, un ref di errore o una coda di retry, e mai in un
catch vuoto. Abbina questa regola a [non ingoiare gli
errori](/kb/error-handling/never-swallow-errors).

```ts
// In a Vue component handler:
const handleRevoke = async (username: string): Promise<void> => {
  try {
    await revokeOrgMember(username);
    await refresh();
  } catch (err) {
    // HttpError carries status + body; anything else is unexpected.
    error.value =
      err instanceof HttpError
        ? `Revoke failed (${err.status}): ${err.body}`
        : 'Unexpected error — please retry.';
  }
};
```

## Anti-pattern

```ts
// ❌ Returning a hardcoded success without touching the response at all.
const uploadAsset = async (file: File): Promise<{ success: boolean }> => {
  await swFetch('/assets', { method: 'POST', body: file });
  return { success: true }; // storage may have returned 409 or 503
};

// ❌ Checking ok but silently discarding the failure path.
const deleteAsset = async (id: string): Promise<void> => {
  const res = await swFetch(`/assets/${id}`, { method: 'DELETE' });
  if (res.ok) return;
  // nothing in the else branch — the failure disappears
};

// ❌ Checking status numerically without covering the full 4xx/5xx range.
const patchTeam = async (team: string, data: TeamPatch): Promise<void> => {
  const res = await fetch(`/teams/${team}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (res.status === 404) throw new Error('not found');
  // 403, 422, 500, etc. still return without error
};

// ❌ Swallowing the response entirely by only awaiting the json() branch.
const getRole = async (username: string): Promise<Role> => {
  const res = await swFetch(`/users/${username}/role`);
  return res.json() as Promise<Role>; // json() on a 401 HTML body will throw a parse
                                      // error, not an HttpError — the wrong error leaks
};
```

Ognuno di questi produce lo stesso sintomo a runtime. Dal punto di vista di chi chiama la
scrittura sembra riuscita, la UI si ridisegna con uno stato vecchio, e nessuno si accorge
del fallimento finché un utente non nota che i dati non sono cambiati, magari ore dopo.

## Come imporlo

Nessuna singola regola di lint rileva in modo universale "risultato di fetch usato senza
controllo di res.ok", perché l'oggetto risposta è tipizzato come `Response` che tu lo guardi
o no. Quello che funziona è un'imposizione strutturale:

1. **Vieta i controlli `!res.ok` inline** — obbliga ogni gestore a chiamare `ensureOk` o
   `okOrThrow`. Così il punto di chiamata diventa evidente in code review ed è facile fare
   grep degli usi non protetti (chiamate a `swFetch` non seguite da `ensureOk`).
2. **Gate in code review** — qualunque nuovo gestore che chiama `fetch` o `swFetch` e
   restituisce un valore di successo deve mostrare la chiamata a `ensureOk`/`okOrThrow`;
   l'assenza è un difetto.
3. **Test di integrazione** — testa esplicitamente il percorso 4xx: fai un mock dell'API
   che restituisce `403`, verifica che la UI mostri un errore. Un test che copre solo il
   percorso felice si perde tutta la classe di bug descritta qui.

## Vedi anche

Un `{ success: true }` fabbricato è l'istanza specifica per HTTP del principio generale di
[non ingoiare gli errori](/kb/error-handling/never-swallow-errors). Gli helper di telemetria
che inviano analytics fire-and-forget cadono nello stesso tranello, trattato in [la
telemetria non manda mai in crash](/kb/backend-events/telemetry-never-crashes).
