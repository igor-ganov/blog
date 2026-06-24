---
title: 'Non inghiottire mai un errore'
category: error-handling
summary: 'I catch vuoti e i successi fabbricati nascondono proprio i guasti che provocano gli incidenti in produzione. Gli errori si propagano o si gestiscono in modo esplicito, mai si mettono a tacere.'
principle: 'Niente catch vuoti, niente `.catch(() => {})`, niente successo fabbricato. O filtri esplicitamente la classe di errore e rilanci il resto, oppure indirizzi il reject in un punto dove viene visto.'
severity: non-negotiable
tags: [error-handling, reliability, observability]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-05-09
    note: 'I gestori catch silenziosi erano la ragione strutturale per cui una classe di regressioni sul salvataggio restava invisibile; vietati tramite biome noEmptyBlockStatements.'
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-04-29
    note: 'I gestori RBAC restituivano {success:true} mentre GitHub rispondeva 4xx: i salvataggi non facevano nulla in silenzio per ore.'
related:
  - error-handling/always-check-res-ok
  - error-handling/no-self-rolled-yaml
  - functional-architecture/errors-as-values-with-effect
  - platform/idb-structured-clone-boundary
order: 1
updated: 2026-05-09
---

Un catch vuoto diventa invisibile esattamente nel momento in cui ti serve.
`.catch(() => {})` non gestisce un errore; cancella la prova che ne sia avvenuto uno. Il
guasto è comunque successo, e ora nessun log, nessuna notifica e nessun test lo vedrà
mai. Su una SPA di amministrazione contenuti è andata proprio così: i gestori catch
silenziosi erano la ragione per cui un'intera classe di regressioni sul salvataggio in
produzione è rimasta invisibile finché qualcuno non si è accorto, a mano, che non si
salvava niente.

Quindi: non inghiottire mai un errore in silenzio. `try/catch` vuoti, `.catch(() => {})`,
`.catch(() => undefined)` e `.then(onOk, () => {})` sono tutti vietati.

## Perché conta

Due incidenti, stessa causa radice.

La SPA di amministrazione contenuti finiva per committare uno stato del repository non
compilabile. La build del sito statico falliva, ma il percorso d'errore lato admin
inghiottiva ogni segnale, così l'editor vedeva un successo mentre la produzione andava in
rosso. Lo stesso schema era nascosto sotto l'init del service worker, dove
`.then(loadRoleAfterInit, () => {})` scartava i guasti di avvio dello SW.

A parte questo, il livello RBAC (org-membership `PUT`, team `PUT`, invite `POST`, revoke
`DELETE`) restituiva `{ success: true }` dal service worker **mentre GitHub aveva
risposto con un 4xx**. Il gestore non controllava mai `res.ok`, quindi fabbricava un
successo, la UI si aggiornava e mostrava il vecchio stato. I salvataggi non facevano
nulla in silenzio, e nessuno se ne accorgeva finché non passavano ore di tentativi. Un
successo fabbricato è solo un altro errore inghiottito.

Il costo è lo stesso in entrambi i casi. Il guasto è reale, ma affiora come un sintomo
confuso lontano dalla causa, di solito solo dopo che qualcuno se ne accorge. Lo paghi in
ore di debug e nella fiducia persa in ciò che pensavi di aver salvato.

## Come applicarla

Decidi, in modo esplicito, cosa fai con il reject. Ci sono esattamente tre scelte
legittime, e "niente" non è una di queste.

**1. Vero fire-and-forget → inoltra il reject.** Se davvero non vuoi attendere
qualcosa, non scartarne il guasto. Indirizzalo al gestore globale così resta
osservabile.

```ts
// src/utils/fire-and-forward.ts — rejections reach `unhandledrejection`.
export const fireAndForward = (p: Promise<unknown>): void => {
  void p.catch((error) => {
    globalThis.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { reason: error, promise: p }));
  });
};
// In a service worker, the equivalent logs with a category: fireAndLog(p, 'sw-init').
```

**2. Swallow selettivo → filtra la classe, rilancia il resto.** "Ignora EEXIST, propaga
tutto il resto" è legittimo; "ignora tutto" no. Fai in modo che il ramo indesiderato
continui a propagarsi.

```ts
// Idempotent mkdir: only EEXIST is expected.
export const ensureDir = async (path: string): Promise<void> => {
  try {
    await mkdir(path);
  } catch (error) {
    void (isEexist(error) ? 0 : rethrow(error)); // anything else still throws
  }
};
```

**3. Gestiscilo davvero.** Mostra l'errore all'utente, riprova con backoff, oppure
mettilo in coda. Il punto è che l'errore raggiunga del codice che ci fa qualcosa.

Per la logica fallibile che gira spesso, conviene trasformare gli errori in **valori**
invece che in throw: un `Either`/`Effect` il cui canale d'errore il type system ti
obbliga ad affrontare. Vedi
[gli errori come valori con Effect](/principles/functional-architecture/errors-as-values-with-effect).

## Anti-pattern

```ts
// ❌ The empty catch — deletes evidence.
try {
  await save();
} catch {}

// ❌ Fire-and-forget that forgets the failure too.
void appendEntry(entry); // throws inside? nobody will ever know

// ❌ Fabricated success — the SW says ok while the API said no.
const res = await fetch(url, { method: 'PUT' });
return { success: true }; // never checked res.ok — see "always check res.ok"

// ❌ The two-argument then with a no-op rejection handler.
init().then(loadRole, () => {});
```

## Applicazione automatica

`biome lint/suspicious/noEmptyBlockStatements` è impostato su **error** (è attivo nel
`biome.json` di questo repo), il che vieta del tutto i `try/catch` vuoti. L'equivalente
in ESLint è `no-empty` con `allowEmptyCatch: false`. La variante con successo fabbricato
è intercettata dalla regola gemella [controlla sempre `res.ok`](/principles/error-handling/always-check-res-ok). Quando
trovi un template literal `${key}: ${value}` o un `.catch(() => {})` in revisione,
trattalo come un difetto e non come una pignoleria di stile.

## Vedi anche

Lo stesso istinto, non lasciare mai passare un guasto inosservato, guida
[controlla sempre res.ok](/principles/error-handling/always-check-res-ok) e il rifiuto di
[scriversi a mano serializzatori fragili](/principles/error-handling/no-self-rolled-yaml) che
falliscono in silenzio davanti a input ostili.
