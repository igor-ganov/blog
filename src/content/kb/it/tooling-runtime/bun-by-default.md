---
title: 'Bun è il runtime predefinito'
category: tooling-runtime
summary: 'Usa bun per ogni attività TS/JS nel progetto; ricorri a un altro runtime solo quando il lockfile lo impone o bun è davvero assente.'
principle: 'Usa bun per eseguire TS/JS, lanciare script, installare dipendenze e servire file statici; ricorri a un altro runtime solo quando un lockfile del progetto lo impone o bun manca davvero.'
severity: strong
tags: [bun, runtime, tooling, static-server]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-05-27
    note: 'bun imposto al posto di python http.server/node/npm; bun x serve, bun run, bun install'
related:
  - typescript/native-ts-node-scripts
order: 1
updated: 2026-06-10
---

## Perché conta

Il 2026-05-27, durante una ricerca sul DDD, l'assistente ha tirato fuori `python -m http.server`
per avviare al volo un server di file statici. È stato bocciato sul posto. Non c'è motivo
di invocare Python per servire dei file quando bun porta con sé il proprio server statico, esegue
TypeScript in modo nativo ed è già nel PATH.

`node`, `npx` e `npm` ricevono lo stesso trattamento. Ognuno è un ulteriore cambio di contesto
mentale, un'altra fonte di incoerenza nell'ambiente di sviluppo e nella maggior parte dei casi
fa meno del comando bun che va a sostituire.

Cosa rende bun il predefinito:

- **Esecuzione nativa di TypeScript** — `bun run script.ts` funziona senza un passaggio di compilazione
  o un wrapper `ts-node`/`tsx`.
- **Server statico integrato** — `bun x serve <dir>`, oppure un `server.ts` di un solo file con
  `Bun.serve()`, sostituisce ogni server HTTP improvvisato in Python/Node.
- **Installazioni più rapide** — `bun install` risolve e scarica i pacchetti molto più velocemente di
  `npm install`, grazie a un lockfile binario e al fetching parallelo.
- **Binario unico** — nessuna discrepanza di versione tra il runner e il gestore di pacchetti.
- **Hot reload** — `bun --hot ./server.ts` ricarica all'istante, senza bisogno di `nodemon`.

Questo blog gira su bun dall'inizio alla fine: `bun install`, `bun run dev`, `bun run build`. Uno
standard di ingegneria codifica la stessa cosa come regola valida per tutto il progetto.

## Come applicarlo

### Servire file statici

```bash
# Serve a built dist directory on port 4173
bun x serve dist -p 4173

# Or write a minimal typed server (no Python, no npx http-server)
bun x serve . -p 8080
```

Per un server più ricco con rotte API, scrivi un `server.ts` ed eseguilo con hot reload:

```typescript
// server.ts
const server = Bun.serve({
  port: 4173,
  fetch(req) {
    const url = new URL(req.url);
    return new Response(Bun.file(`dist${url.pathname}`));
  },
});

console.log(`Listening on http://localhost:${server.port}`);
```

```bash
bun --hot ./server.ts
```

### Eseguire script TypeScript

```bash
# Good — bun handles the TS compilation internally
bun run scripts/seed.ts

# Also fine for package.json scripts
bun run build
bun run dev
bun run test
```

### Installare le dipendenze

```bash
# Good
bun install
bun add zod
bun add -d typescript

# Equivalent of npx for one-off tools
bunx prettier --write src/
bun x astro check
```

### Passare argomenti extra agli script del package

Secondo la convenzione del progetto, passa gli argomenti extra dopo `--`:

```bash
bun run test -- --reporter=verbose
bun run build -- --debug
```

### Rilevare il binario di bun

Se uno script deve localizzare bun a livello di codice:

```typescript
// Bun exposes itself as a global when running under bun
const isBun = typeof Bun !== 'undefined';
const bunVersion = isBun ? Bun.version : undefined;
```

Il binario sta nel PATH con il nome `bun`.

## Anti-pattern

### Ricorrere a Python per servire i file

```bash
# Bad — introduces Python dependency, no TypeScript awareness, slow startup
python -m http.server 8080

# Good
bun x serve . -p 8080
```

Il sintomo: il progetto non ha alcuna dipendenza da Python, eppure un `python -m http.server`
sbucato dal nulla compare in uno script o nelle chiamate degli strumenti dell'assistente. È
esattamente l'incidente che ha prodotto questa regola (uno standard di ingegneria, 2026-05-27).

### Usare node per eseguire TypeScript

```bash
# Bad — requires ts-node or tsx, adds a compilation layer, different module resolution
npx tsx scripts/migrate.ts
node --loader ts-node/esm scripts/migrate.ts

# Good — bun resolves and executes in one step
bun run scripts/migrate.ts
```

### Usare npm/npx quando bun è disponibile

```bash
# Bad — slower, different lockfile format, redundant binary
npm install
npx astro check

# Good
bun install
bun x astro check
```

La discrepanza tra lockfile è un rischio concreto. Se `npm install` scrive un `package-lock.json`
accanto a `bun.lockb`, la CI e gli altri sviluppatori possono finire per risolvere versioni diverse.

### Ricorrere a un'alternativa senza verificare

Ci sono solo due motivi legittimi per usare un runtime diverso:

1. Un `package-lock.json` o uno `yarn.lock` è committato e il proprietario del progetto non ha
   ancora migrato. Rispetta il lockfile esistente invece di cambiare di nascosto.
2. Bun manca davvero da `$PATH` e non può essere installato nell'ambiente corrente.

«Sono abituato a node» e «npm è più comodo da digitare» non contano.

## Applicazione della regola

Lo standard di ingegneria contiene la regola alla lettera. L'assistente la legge all'inizio della
sessione e la applica senza che gli venga ricordato. Per la CI, aggiungi un controllo in
`.github/workflows`:

```yaml
- name: Verify no npm/node fallback in scripts
  run: |
    if grep -r "npm install\|npx \|python -m http" package.json scripts/ --include="*.ts"; then
      echo "Found forbidden runtime fallback"; exit 1
    fi
```

Per questo blog, il `bun.lockb` alla radice del repo è l'unica fonte di verità per il gestore di
pacchetti. Qualsiasi PR che introduca un `package-lock.json` va respinta.

## Vedi anche

- `typescript/native-ts-node-scripts` — eseguire file TypeScript in modo nativo senza un
  passaggio di compilazione o un binario wrapper.
- Documentazione di Bun: https://bun.sh/docs/cli/run
- Server di file statici di Bun: https://bun.sh/docs/api/http#bun-serve
