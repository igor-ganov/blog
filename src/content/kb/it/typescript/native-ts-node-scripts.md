---
title: 'Node esegue TypeScript — scrivi script .ts, niente build'
category: typescript
summary: 'Scrivi gli script di utilità per Node come file .ts nativi; Node 22+ li esegue direttamente rimuovendo i tipi, senza passo di transpile, senza output .js e senza runner di terze parti.'
principle: 'Scrivi gli script per Node come .ts nativi che Node esegue direttamente; niente .js, niente passo di transpile, niente runner o flag di terze parti.'
severity: preferred
tags: [typescript, node, scripts, tooling]
sources:
  - project: 'uno standard ingegneristico'
    date: 2026-06-02
    note: 'script .ts nativi, niente librerie o flag di terze parti'
  - project: 'tooling di amministrazione Jira'
    date: 2026-05-22
    note: 'script .ts numerati eseguiti sul TS nativo di Node 24'
related:
  - tooling-runtime/bun-by-default
order: 5
updated: 2026-06-10
---

## Perché conta

Per anni eseguire TypeScript in Node ha significato una di tre seccature: compilare prima in JavaScript (`tsc && node dist/script.js`), affidarsi a un runner di terze parti (`ts-node`, `tsx`), oppure passare flag sperimentali. Ognuna ha un prezzo. Un passo di build lascia lo script vecchio finché non ti ricordi di ricompilare. I runner di terze parti sono dipendenze in più, la cui versione di TypeScript fissata si allontana dalla tua. I flag sono oscuri e tendono a rompersi in silenzio quando Node si aggiorna sotto di te.

Node 22 ha introdotto il supporto nativo a TypeScript tramite la rimozione dei tipi (il flag `--experimental-strip-types`, attivo per default da Node 22.6). Node 23 ha tolto la funzione dallo stato sperimentale. **Node 24**, che è la versione su questa macchina (`v24.7.0`), esegue i file `.ts` direttamente senza flag, senza config e senza pacchetti aggiuntivi:

```
node script.ts
```

Questa è l'intera invocazione. La regola di stile in questo codebase non lascia margini: **genera solo script `.ts` che Node sa eseguire nativamente. Niente `.js`. Niente librerie o flag di terze parti. Node sa eseguire TS da solo.**

Gli script del tooling di amministrazione Jira (2026-05-22) sono stati il primo posto dove questo è stato applicato ovunque. Quel tooling era un insieme di script `.ts` numerati (`01-fetch-sprint.ts`, `02-map-issues.ts`, ecc.) che giravano direttamente su Node 24 senza comando di build nel `package.json` e senza output compilato. Sono rimasti in TypeScript per tutta la loro vita: modifichi il file `.ts`, lo esegui, fatto.

**Rapporto con bun**: il runtime di default del progetto è `bun` (vedi [bun-by-default](/kb/tooling-runtime/bun-by-default)). Questo articolo non sostiene Node al posto di bun. Anche bun esegue `.ts` nativamente ed è di solito la scelta migliore. Quello che entrambi i runtime hanno in comune è che **per gli script non serve alcuna pipeline di build**. Non scrivi `.js`, non lanci `tsc`, non installi `ts-node`.

## Come applicarlo

### Eseguire uno script direttamente

```bash
# Node 24 — no flags, no build step
node script.ts

# bun — also runs .ts natively (preferred default)
bun run script.ts
# or just
bun script.ts
```

Niente compilazione, niente cartella `dist/`, niente file `.js` intermedio.

### Struttura dello script

Scrivi gli script con tipi TypeScript completi. La rimozione dei tipi cancella le annotazioni al momento dell'esecuzione e non fa altro alla sintassi, quindi sta' lontano da qualunque funzione TypeScript che richieda una vera trasformazione:

- **Ammesso**: annotazioni di tipo, interface, alias di tipo, generics, `as const`, `satisfies`, `import type`.
- **Non rimosso (da evitare negli script)**: `enum` (usa oggetti `as const` al suo posto), decoratori legacy, blocchi `namespace`.

```typescript
// 01-fetch-sprint.ts
// Jira tooling script — runs with: node 01-fetch-sprint.ts

import type { Sprint } from './types.ts';

const JIRA_BASE = process.env['JIRA_BASE'] ?? 'https://company.atlassian.net';
const BOARD_ID = process.env['BOARD_ID'] ?? '42';

const fetchActiveSprint = async (): Promise<Sprint> => {
  const res = await fetch(`${JIRA_BASE}/rest/agile/1.0/board/${BOARD_ID}/sprint?state=active`);
  if (!res.ok) throw new Error(`Jira responded ${res.status}`);
  const body: unknown = await res.json();
  // validate here — see validate-at-the-boundary
  return body as Sprint; // replace with real decoder in production
};

const sprint = await fetchActiveSprint();
console.log(`Active sprint: ${sprint.name} (id ${sprint.id})`);
```

Eseguilo:

```bash
node 01-fetch-sprint.ts
```

L'esecuzione non richiede alcun tsconfig; Node rimuove i tipi con i propri default. Se vuoi il type-checking nell'editor, un piccolo `tsconfig.json` sopra la cartella degli script fa il suo lavoro:

```jsonc
// tsconfig.scripts.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true  // no build output; we run .ts directly
  },
  "include": ["scripts/**/*.ts"]
}
```

### Sostituire enum

`enum` richiede una trasformazione che la rimozione dei tipi non esegue mai. Usa invece un oggetto `as const`:

```typescript
// Bad — enum requires transformation, fails with type-stripping
enum IssueStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Done = 'done',
}

// Good — plain const object; no transformation needed
const IssueStatus = {
  Open: 'open',
  InProgress: 'in_progress',
  Done: 'done',
} as const;

type IssueStatus = typeof IssueStatus[keyof typeof IssueStatus];
// 'open' | 'in_progress' | 'done'
```

### Importare altri file .ts

Quando uno script importa un altro file `.ts`, usa l'estensione `.ts` nel percorso dell'import (non `.js`):

```typescript
// Good — explicit .ts extension matches the actual file
import type { Sprint } from './types.ts';
import { parseSprint } from './parse-sprint.ts';

// Bad — .js extension that does not match any file on disk
import { parseSprint } from './parse-sprint.js';
```

La risoluzione `NodeNext` di Node, abbinata alla rimozione dei tipi, risolve correttamente gli import `.ts`.

### Script numerati per tooling sequenziale

Quando un flusso di lavoro procede a passi, fa' precedere ogni script da un numero. L'ordine si documenta da solo, i file si ordinano bene nell'elenco di una cartella, e puoi comunque eseguire ogni singolo passo per conto suo.

```
scripts/
  01-fetch-sprint.ts
  02-map-issues.ts
  03-generate-report.ts
```

```bash
node scripts/01-fetch-sprint.ts
node scripts/02-map-issues.ts
node scripts/03-generate-report.ts
```

Oppure come script di comodo nel package.json:

```jsonc
{
  "scripts": {
    "report": "node scripts/01-fetch-sprint.ts && node scripts/02-map-issues.ts && node scripts/03-generate-report.ts"
  }
}
```

## Anti-pattern

### Compilare in JavaScript prima di eseguire

```bash
# Bad — extra step, output files clutter the repo, script is stale between edits
tsc --project tsconfig.scripts.json
node dist/scripts/01-fetch-sprint.js
```

**Sintomo**: qualcuno modifica il sorgente, si dimentica di ricompilare, esegue il `.js` vecchio e non capisce perché la modifica non ha fatto nulla.

### Usare ts-node o tsx

```bash
# Bad — third-party runner, version drift, extra dependency
npx ts-node scripts/01-fetch-sprint.ts
npx tsx scripts/01-fetch-sprint.ts
```

**Sintomo**: `ts-node` e `tsx` fissano il proprio TypeScript attraverso il proprio albero di dipendenze, che può divergere dalla versione del progetto. Piccole differenze di type-checking fanno poi passare uno script in locale e fallire in CI, o il contrario.

### Scrivere lo script in JavaScript

```typescript
// Bad — script.js with JSDoc types
/** @param {string} id */
const fetchIssue = async (id) => { /* ... */ };
```

**Sintomo**: niente controlli a tempo di compilazione, quindi gli errori saltano fuori solo a runtime. TypeScript è già lì e gira nativamente, perciò scrivere script senza tipi non ti porta nulla.

### Usare i flag sperimentali esplicitamente

```bash
# Bad — unnecessary; Node 24 requires no flags for .ts
node --experimental-strip-types script.ts
```

**Sintomo**: il flag annuncia un'assunzione sbagliata sulla versione di Node. Su Node 24 è implicito, quindi tenerlo inganna il prossimo lettore facendogli credere che serva ancora.

### Usare enum

```typescript
// Bad — does not strip cleanly
enum Direction { North = 'N', South = 'S' }
```

**Sintomo**: `SyntaxError: Unexpected reserved word` oppure `SyntaxError: Decorators are not valid here`, a seconda della versione di Node. Passa agli oggetti `as const`.

## Imposizione

- Imposta `"noEmit": true` in qualunque tsconfig che copra gli script, così un job di CI che prova a emettere `.js` da una cartella di script fa fallire la build.
- Una regola `.gitignore` a livello di progetto su `dist/` o `scripts/dist/` tiene l'output compilato fuori dai commit.
- Regola di lint: `@typescript-eslint/no-restricted-syntax` può vietare `TSEnumDeclaration` nei file di script.
- Fissa la versione minima di Node a 22 nel campo `engines` del `package.json`, così la capacità di TS nativo diventa un requisito dichiarato:

```jsonc
{
  "engines": { "node": ">=22.0.0" }
}
```

## Vedi anche

- [bun-by-default](/kb/tooling-runtime/bun-by-default) — `bun` è il runtime di default; esegue anch'esso `.ts` nativamente ed è la scelta preferita per la maggior parte degli script.
