---
title: 'Le env di build vengono incorporate — verificale contro la CI'
category: build-ci-deploy
summary: 'Vite e Astro incorporano le env pubbliche come stringhe letterali al momento della build, prendendole dalla macchina che compila; un .env locale non viene mai letto dalla CI, quindi qualsiasi variabile VITE_* o astro:env pubblica assente dal workflow finisce nel bundle come stringa vuota o manda in crash un worker.'
principle: 'Vite/Astro incorporano le env pubbliche (VITE_*, astro:env pubbliche) come stringhe letterali al momento della build, prendendole dall''ambiente della macchina che compila; un .env locale non viene letto dalla CI. Verifica ogni riferimento contro le env del workflow, fallisci in modo rumoroso quando ne manca una e non mettere mai segreti server dietro un prefisso pubblico.'
severity: non-negotiable
tags: [build, ci, environment, vite, astro, secrets, cloudflare]
sources:
  - project: 'un sito a contenuti statici'
    date: 2026-04-12
    note: 'VITE_GITHUB_CLIENT_ID assente in CI → OAuth con stringa vuota → outage P0; sembrava un''app OAuth cancellata'
  - project: 'un client per Jira'
    date: 2026-06-08
    note: 'astro:env pubblica incorporata in build; astro:env segreta validata all''init del modulo; passa i segreti a wrangler via pipe'
related:
  - build-ci-deploy/restore-prod-first-incident-order
  - web-components/no-ssr-custom-elements-on-edge
order: 1
updated: 2026-06-08
---

Al momento della build Vite sostituisce ogni riferimento `import.meta.env.VITE_*` con il
valore della variabile come stringa letterale, letto da `process.env` sulla macchina che
compila. Non c'è nessuna lettura a runtime. Il bundle distribuito contiene solo la stringa.
Se durante la build `process.env.VITE_GITHUB_CLIENT_ID` vale `"gh-client-abc123"`, il bundle
spedisce `"gh-client-abc123"`. Se la variabile è `undefined`, il bundle spedisce `"undefined"`,
oppure, con un fallback nullish, `""`.

Un runner di GitHub Actions è una VM Ubuntu pulita e non legge il tuo file `.env`. Le
variabili esistono solo se le dichiari esplicitamente sotto `env:` nel workflow, prese da
`vars.*` (variabili di repository) o `secrets.*`.

Quindi lo scarto tra "funziona in locale" e "rotto in CI" dipende interamente da cosa si
trova nell'ambiente nell'istante in cui gira `vite build` o `astro build`.

## Perché conta

**Outage P0, 2026-04-12, un sito a contenuti statici.**

Il progetto aveva un flusso di login OAuth con GitHub. Il client ID era salvato in un `.env`
locale:

```
VITE_GITHUB_CLIENT_ID=Ov23liXXXXXXXXXXXXXX
```

Era anche referenziato nel codice con un fallback di sicurezza pensato per essere difensivo:

```ts
// src/auth/github.ts — the exact pattern that shipped
const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';
const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&...`;
```

Il workflow di CI non aveva nessun blocco `env:` per `VITE_GITHUB_CLIENT_ID`, quindi la build
andava a buon fine senza problemi. Vite sostituiva il riferimento con `undefined`, scattava
il `?? ''` e il bundle spediva `client_id=` come stringa vuota. Build verde, deploy verde,
sito su. Il sintomo compare solo quando un utente clicca "Sign in with GitHub":

```
GET https://github.com/login/oauth/authorize?client_id=&redirect_uri=...
→ 404
```

GitHub restituisce un 404 generico, non una pagina di errore OAuth, quindi il sintomo si
legge esattamente come "l'app OAuth è stata cancellata o trasferita". Il team ha passato
circa un'ora a escludere modifiche a livello di account prima che un'ispezione del network
tab tirasse fuori il `client_id=` vuoto.

La correzione era piccola: accorgersi che al workflow mancava la variabile, aggiungerla dallo
store `vars.*` del repository, rilanciare la build. Tre righe aggiunte al file di workflow
avrebbero evitato tutto l'outage.

**Riscontro secondario, 2026-06-08, un client per Jira (Astro + Cloudflare Workers).**

Il modulo `astro:env` di Astro ha due classi di variabili:

- Le variabili `PUBLIC_*` vengono incorporate al momento della build — identico al
  comportamento di Vite.
- Le variabili `SECRET_*` vengono lette al momento della richiesta e validate
  all'inizializzazione del modulo.

La validazione delle variabili segrete avviene quando il modulo viene importato per la prima
volta. Se un segreto è assente dall'ambiente del worker (non impostato via
`wrangler secret put`), ogni route che tocca quel modulo lancia un 500 prima che giri
qualsiasi logica dell'handler. Questo ha messo fuori uso un intero worker dopo un deploy
fresco verso un nuovo ambiente in cui i segreti non erano ancora stati provisionati.

Una seconda trappola sullo stesso progetto: eseguire `wrangler secret put NAME` in modalità
interattiva caricava una stringa vuota quando il terminale era collegato a una pipeline che
non forniva stdin. Cloudflare lo accettava, quindi il segreto sembrava "impostato", ma il suo
valore era `""`. Passa sempre il valore esplicitamente via pipe:

```sh
# ❌ Interactive — silently uploads "" when run non-interactively
wrangler secret put CF_API_TOKEN

# ✅ Piped — uploads the exact value, safe in scripts and CI
printf '%s' "$CF_API_TOKEN" | wrangler secret put CF_API_TOKEN
```

## Come applicarlo

### 1. Elenca ogni riferimento VITE_* e astro:env pubblico

```sh
# Find every public env reference in source
grep -rn 'import\.meta\.env\.VITE_\|getSecret\|getEnv' src/ --include='*.ts' --include='*.tsx' --include='*.astro'
```

Elenca ogni nome. Poi apri il file di workflow e conferma che ogni nome compaia in un blocco
`env:` o venga iniettato tramite uno step.

### 2. Mappa ogni variabile alla sua fonte in CI

```yaml
# .github/workflows/deploy.yml

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      # Public vars: visible in the bundle — use repository variables (vars.*)
      VITE_GITHUB_CLIENT_ID: ${{ vars.VITE_GITHUB_CLIENT_ID }}
      VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
      # Sensitive but public (e.g. analytics write key): still vars.*, but document it
      VITE_POSTHOG_KEY: ${{ vars.VITE_POSTHOG_KEY }}
    steps:
      - uses: actions/checkout@v4
      - run: bun install
      - run: bun run build
```

Le variabili che non portano segreti vanno in `vars.*` (visibili nella UI, non oscurate nei
log). Tutto ciò che è segreto va in `secrets.*`, che le oscura. Nessuna delle due viene letta
da `.env`.

### 3. Fallisci in modo rumoroso quando manca una variabile

Sostituisci i fallback silenziosi con guardie a build-time. Una guardia che lancia impedisce
a una build riuscita di produrre un artefatto rotto:

```ts
// src/env.ts — import this instead of importing import.meta.env directly

// ❌ Silent fallback — the build succeeds, the artifact is broken
const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';

// ✅ Loud guard — the build fails, no broken artifact ships
const requireEnv = (name: string): string => {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

export const GITHUB_CLIENT_ID = requireEnv('VITE_GITHUB_CLIENT_ID');
```

In `astro:env` di Astro, è la dichiarazione dello schema stesso a fornire la guardia:

```ts
// src/env.ts (astro:env style)
import { defineConfig } from 'astro/config';

// astro.config.mjs
export default defineConfig({
  env: {
    schema: {
      // PUBLIC_ vars are inlined at build time; missing = build error
      PUBLIC_GITHUB_CLIENT_ID: envField.string({ context: 'client', access: 'public' }),
      // SECRET_ vars are validated at runtime on first import; missing = 500
      CF_API_TOKEN: envField.string({ context: 'server', access: 'secret' }),
    },
  },
});
```

### 4. Non dare mai il prefisso VITE_ a un segreto server

Una variabile con prefisso `VITE_` viene incorporata nel bundle client ed è visibile a
chiunque scarichi la pagina. Un token API di Cloudflare, una password di database, qualsiasi
credenziale che non deve essere visibile al client non deve portare il prefisso `VITE_`,
anche quando il codice che la legge gira solo lato server in un progetto basato su Vite.

```ts
// ❌ Token visible in the client bundle
const token = import.meta.env.VITE_CF_API_TOKEN;

// ✅ Server-only: access via process.env (SSR) or astro:env SECRET_
const token = process.env.CF_API_TOKEN;
```

Rinomina la variabile alla fonte. Cambia il nome del segreto nel workflow. Ruota la
credenziale se è mai stata distribuita con il prefisso pubblico.

### 5. Provisiona correttamente i segreti del worker

Quando deployi su Cloudflare Workers, le variabili segrete devono essere presenti prima che
la prima richiesta arrivi al worker. Usa la forma con pipe in qualsiasi contesto non
interattivo:

```sh
# In CI, reading from a GitHub secret
printf '%s' "${{ secrets.CF_API_TOKEN }}" | wrangler secret put CF_API_TOKEN

# Locally, reading from .env
source .env && printf '%s' "$CF_API_TOKEN" | wrangler secret put CF_API_TOKEN
```

Verifica con `wrangler secret list` che il segreto esista e che il suo valore non sia vuoto
prima di deployare.

## Anti-pattern

```ts
// ❌ Pattern 1 — nullish fallback hides a missing var, ships empty string
const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';
// Symptom: client_id= in the OAuth redirect, GitHub 404, looks like deleted OAuth app.

// ❌ Pattern 2 — server secret behind a public prefix
const dbPassword = import.meta.env.VITE_DB_PASSWORD;
// Symptom: password visible in bundle; bundle is public.

// ❌ Pattern 3 — no workflow env: block, assumes .env is read
// (no code — the antipattern is the absence of an env: block in the YAML)
// Symptom: VITE_* is undefined on the runner; build succeeds with empty literals.

// ❌ Pattern 4 — interactive wrangler secret put in a script
wrangler secret put CF_API_TOKEN   // reads stdin; stdin is /dev/null in CI
// Symptom: secret is "set" but empty; every worker route 500s on first import.
```

## Come imporlo

1. **Cancello grep in CI.** Aggiungi uno step prima di `bun run build` che conferma che ogni
   nome `VITE_*` trovato nel sorgente sia presente nell'ambiente:

   ```sh
   # scripts/check-env.sh
   missing=0
   for name in $(grep -roh 'VITE_[A-Z0-9_]*' src/ | sort -u); do
     if [ -z "${!name}" ]; then
       echo "Missing env var: $name"
       missing=1
     fi
   done
   [ $missing -eq 0 ] || exit 1
   ```

2. **`requireEnv` all'inizializzazione del modulo.** La guardia in `src/env.ts` (mostrata
   sopra) gira prima che qualsiasi componente o pagina venga renderizzato; se una variabile è
   assente lo step di build lancia e nessun artefatto viene prodotto.

3. **Audit delle variabili di repository.** Tieni nel blocco `env:` del workflow un commento
   che elenca ogni variabile, la sua fonte (`vars.X` o `secrets.X`) e se è pubblica o
   sensibile. Quel commento è la lista autorevole; chi entra nel team può provisionare un
   ambiente nuovo a partire da lì senza dover scavare nel codice sorgente.

## Vedi anche

Dopo un outage da env di build, il recupero segue l'[ordine di intervento restore-prod-first](/principles/build-ci-deploy/restore-prod-first-incident-order):
hot-fix del workflow, conferma del deploy verde, poi apri la PR sulla causa radice che
aggiunge la guardia `requireEnv`. Non scrivere prima la guardia mentre il sito è giù.

Il comportamento a runtime di `astro:env` su Cloudflare Workers ritorna in
[no-ssr-custom-elements-on-edge](/principles/web-components/no-ssr-custom-elements-on-edge),
che copre altre insidie di init dei moduli sui runtime edge.
