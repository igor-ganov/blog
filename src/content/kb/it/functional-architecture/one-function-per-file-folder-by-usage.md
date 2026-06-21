---
title: 'Una funzione pura per file, organizzata per uso'
category: functional-architecture
summary: 'Suddividi la logica in file con un solo export, ognuno con il nome della propria funzione, organizzati in alberi di cartelle basati sull uso, e tieni ogni file sotto le 50 righe escludendo gli import.'
principle: 'Scomponi la logica in piccole funzioni pure — una funzione esportata per file (nome file = nome della funzione in kebab), ≤50 righe escludendo gli import, in cartelle raggruppate per uso, non per layer.'
severity: strong
tags: [functional-architecture, file-organisation, pure-functions, decomposition]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-07
    note: '≤50 righe escl. import; un export per file; cartelle-per-uso; profondità anziché ampiezza.'
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-03-24
    note: 'Oltre 70 file SW ristrutturati in un albero di dipendenze a 7 livelli durante un refactoring importante.'
related:
  - functional-architecture/lint-enforces-architecture
  - functional-architecture/no-branching-switch-and-strategies
order: 1
updated: 2026-06-10
---

Un file che esporta una sola funzione pura e porta il nome di quella funzione è l unità
più piccola di architettura funzionale che valga la pena considerare. Dai a ogni file
questa forma e il codice diventa un albero navigabile. Trovi ciò che ti serve seguendo il
percorso d uso, invece di scavare tra i barrel export o di passare in rassegna una
cartella `utils/` piatta.

La dimensione è l altra metà della regola: **≤ 50 righe escludendo le righe di import**.
Il limite si ripaga da solo. Una funzione che ha bisogno di più di 50 righe di
implementazione di solito fa due lavori, e allora la spezzi, oppure contiene logica che
andrebbe spostata più in basso, in un helper richiamato da una sottocartella sottostante.

## Perché conta

Un refactoring importante di una SPA di amministrazione contenuti (2026-03-24) ha
ristrutturato oltre 70 file di service worker in un **albero di dipendenze a 7 livelli**.
Il principio guida era enunciato senza giri di parole: "struttura ad albero — profondità
anziché ampiezza; file dipendenti nelle sottocartelle". Prima del refactoring il codice
aveva cartelle larghe e piatte, dove logica correlata si accumulava nella stessa directory
a prescindere da quanto fosse specifica. Per trovare la funzione dietro a un dettaglio
ristretto dovevi leggere diversi file, ciascuno con diversi export.

Dopo, ogni file aveva un solo export, il nome del file era il nome della funzione, e la
logica specializzata viveva nelle sottocartelle di ciò che dipendeva da essa. La profondità
a cui si trovava un file ti diceva quanto fosse specifico, quindi navigare l albero
significava navigare il grafo delle dipendenze.

Lo standard di ingegneria (2026-06-07) lo ha codificato in modo esplicito:

- Una funzione esportata per file.
- Nome del file in kebab-case uguale al nome della funzione in camelCase.
- File organizzati in cartelle e sottocartelle per **logica d uso**, approfondendo l albero
  man mano che la logica si specializza.
- Side effect solo in un sottile guscio imperativo in cima all albero.
- Ogni file ≤ 50 righe **escludendo le righe di import** — la regola ESLint integrata
  `max-lines` conta gli import; serve una regola custom `max-lines-no-imports` per imporre il
  vincolo reale.

## Come applicarlo

**Cartelle-per-uso, non cartelle-per-layer.**

Il layout per layer raggruppa per ruolo tecnico (`services/`, `utils/`, `helpers/`), così
ogni nuova esigenza finisce nelle stesse directory piatte. Il layout per uso raggruppa per
scopo del codice: la logica che esiste per servire un pezzo di logica più ristretto vive
sotto di esso nell albero.

```
// Bad: layer-based, flat
src/
  services/
    auth.ts          // 3 exports, 200 lines
    sync.ts          // 5 exports, 300 lines
  utils/
    format.ts        // 10 exports
    validate.ts      // 8 exports

// Good: usage-based, deep
src/
  sync/
    sync-queue.ts                         // export syncQueue
    process-sync-queue/
      process-sync-queue.ts               // export processSyncQueue
      build-sync-batch/
        build-sync-batch.ts               // export buildSyncBatch
        select-pending-items.ts           // export selectPendingItems
        compute-sync-priority.ts          // export computeSyncPriority
      apply-sync-result/
        apply-sync-result.ts              // export applySyncResult
        merge-remote-patch.ts             // export mergeRemotePatch
```

I file più profondi sono i più specializzati, e i loro chiamanti stanno esattamente un
livello più su. Niente allunga le mani di lato verso un secchio `utils/` confondendo la
direzione delle dipendenze.

**Un export, nome del file uguale al nome della funzione.**

```ts
// Bad: format-helpers.ts — multiple exports, caller must know which one to pick
export const formatDate = (d: Date): string => ...
export const formatCurrency = (n: number): string => ...
export const formatPercent = (n: number): string => ...

// Good: format-date.ts — one export, discoverable by filename
export const formatDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'short' }).format(d);
```

Il nome del file è l API. Autocomplete e `go-to-definition` ti portano sul codice giusto
senza mai aprire un barrel file.

**La regola delle 50 righe e la regola di lint custom.**

La regola ESLint integrata `max-lines` conta ogni riga, import inclusi. Un file con 10
import e 50 righe di implementazione ne segnala 60 e fallisce il controllo, anche se l
implementazione va benissimo. La regola che vuoi davvero esclude gli import:

```js
// eslint.config.js (excerpt)
{
  rules: {
    // Built-in — not sufficient alone; counts imports
    'max-lines': 'off',

    // Custom plugin or inline rule — counts only non-import lines
    'local/max-lines-no-imports': ['error', { max: 50 }],
  }
}
```

Un `max-lines-no-imports` minimale conta le righe dove `node.type !== 'ImportDeclaration'`
prima di confrontarle con il limite. Scrivilo una volta in
`eslint-rules/max-lines-no-imports.js` e si applica a ogni workspace.

**I side effect stanno in cima all albero.**

Le funzioni pure si compongono senza limiti. Una funzione che legge da `localStorage` o
lancia una richiesta di rete non si compone in sicurezza, perché chiamarla in un test
produce un side effect. Tieni quegli effetti nei file alla radice dell albero, file che
importano gli helper puri, li chiamano e poi eseguono l effetto. Gli helper puri si testano
ciascuno in isolamento, e solo il sottile guscio imperativo ha bisogno di test di
integrazione.

```ts
// pure-core/compute-retry-delay.ts — pure, testable in isolation
export const computeRetryDelay = (attempt: number, baseMs: number): number =>
  baseMs * 2 ** attempt;

// sync-item.ts — imperative shell; imports pure helpers, performs the effect
import { computeRetryDelay } from './pure-core/compute-retry-delay';

export const syncItem = async (item: SyncItem): Promise<void> => {
  const delay = computeRetryDelay(item.attempt, 500);
  await new Promise((resolve) => setTimeout(resolve, delay));
  await fetch('/api/sync', { method: 'POST', body: JSON.stringify(item) });
};
```

## Anti-pattern

```ts
// ❌ Barrel file with many exports — the filename communicates nothing about
//    the function inside; callers import from a bag of tricks.
// auth-utils.ts
export const buildAuthHeader = ...
export const parseJwt = ...
export const isTokenExpired = ...
export const refreshToken = ...

// ❌ File longer than 50 implementation lines — the function is doing too much
//    or contains logic that belongs in a named helper one level down.
// process-event.ts  (120 lines of implementation)
export const processEvent = (event: AppEvent): State => { ... }

// ❌ Folder grouped by technical layer — hides the dependency direction;
//    `utils/` grows without bound.
// utils/string-utils.ts  (14 exports across unrelated concerns)

// ❌ Default exports — the filename and the export name can diverge silently.
// format-date.ts
export default (d: Date) => ...  // consumer names it anything
```

Ognuno di questi ti costa la stessa cosa. Il nome del file smette di puntare in modo
affidabile a ciò che fa il codice, così il refactoring diventa lettura invece che
navigazione.

## Imposizione

Tre regole di lint lo impongono insieme:

1. `local/max-lines-no-imports` — limita l implementazione a 50 righe, ignorando le
   dichiarazioni di import. Integrata nella directory `eslint-rules/` del progetto.
2. `import/no-default-export` (o l equivalente `@typescript-eslint`) — vieta gli export di
   default, così i nomi dei file restano i nomi canonici.
3. Un-export-per-file — o una regola custom che conta i nodi `ExportNamedDeclaration`
   oppure un vincolo architetturale imposto da test sulle convenzioni di directory.

Tutte e tre girano in CI, senza permettere commenti `eslint-disable`. Quando una regola
scatta, spezza il file. Sopprimere il warning non è un opzione sul tavolo.

## Vedi anche

L albero cartelle-per-uso è la controparte strutturale della regola no-branching. Le mappe
di strategie rendono il branching esplicito ed esaustivo; le cartelle per uso rendono le
dipendenze esplicite e direzionali. Usa entrambe e l architettura è leggibile direttamente
dal filesystem.
