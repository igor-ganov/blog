---
title: 'Ogni repo deve compilare da solo in CI'
category: build-ci-deploy
summary: 'Un repo che viene clonato da solo in CI deve contenere tutto il necessario: tsconfig inline, la propria configurazione biome, .gitattributes eol=lf, nessun riferimento a lint nelle cartelle superiori, devDeps nel proprio package.json e dipendenze github:org/repo invece di workspace:*.'
principle: 'Un repo che viene clonato da solo in CI deve contenere tutto il necessario: tsconfig inline (niente extends ../base), la propria configurazione biome, .gitattributes eol=lf, nessun riferimento a lint nelle cartelle superiori, devDeps nel proprio package.json e dipendenze github:org/repo invece di workspace:*.'
severity: strong
tags: [ci, typescript, biome, git, monorepo, submodule, build]
sources:
  - project: 'un monorepo multi-pacchetto'
    date: 2026-04-11
    note: 'i repo usati come submodule devono essere autosufficienti per il checkout indipendente in CI'
related:
  - build-ci-deploy/crlf-lf-discipline
  - functional-architecture/lint-enforces-architecture
order: 3
updated: 2026-04-11
---

Un submodule o un repo standalone che compila sulla tua macchina ma fallisce in CI è un
tipo costoso di falso negativo. Il runner della CI clona solo quel repo, su una VM Linux
pulita, senza alcuna cartella superiore. Se il repo cerca qualcosa fuori dal proprio
albero (un tsconfig condiviso, una configurazione biome in `../`, un pacchetto installato
nella radice del workspace) la run fallisce a uno step che non c'entra niente con la
modifica che stavi davvero testando.

Ecco la prova. Clona il repo in una cartella vuota, lancia `bun install`, poi
`tsc --build`, poi `bunx biome ci .`. Se tutti e tre passano, il repo è standalone. Se uno
qualsiasi degli step fallisce perché la cartella superiore non c'è, non lo è, e devi
sistemarlo prima di poterti fidare della pipeline.

## Perché conta

**Un monorepo multi-pacchetto, 2026-04-11.**

La libreria è cresciuta dentro un monorepo, sulla macchina di uno sviluppatore. Il suo
`tsconfig.json` estendeva una configurazione base due livelli più su:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  }
}
```

La configurazione biome faceva riferimento a una configurazione condivisa nella cartella
superiore:

```json
{
  "extends": ["../../biome.json"]
}
```

Lo script di lint in `package.json` puntava a una configurazione oxlint due cartelle più
su:

```json
{
  "scripts": {
    "lint": "oxlint --config ../../.oxlintrc.json src/"
  }
}
```

Le dipendenze tra repo usavano il protocollo workspace:

```json
{
  "dependencies": {
    "@acme/shared": "workspace:*"
  }
}
```

Tutto questo funzionava in locale, perché la cartella superiore c'era, il workspace era
installato e il pacchetto condiviso si risolveva. In CI il runner clonava solo il repo in
`/home/runner/work/`, quindi `../../` semplicemente non esisteva. Ogni comando falliva con
il proprio messaggio di errore, e nessuno di questi indicava la configurazione come causa:

- `tsc --build` — "Cannot find file '../../tsconfig.base.json'"
- `bunx biome ci .` — "Failed to load config: ../../biome.json not found"
- `bun run lint` — "Cannot open config file: ../../.oxlintrc.json"
- `bun install` — pacchetto condiviso del workspace non trovato nel registry

Ci sono voluti quattro fallimenti e quattro sessioni di debug prima che lo schema
diventasse evidente: ognuno risaliva a un percorso che usciva dalla radice del repo.

La correzione ha affrontato una categoria alla volta:

1. Mettere inline tutte le opzioni del compilatore TypeScript — niente `extends` verso un
   percorso esterno.
2. Aggiungere un `biome.json` autosufficiente con tutta la configurazione inline.
3. Sostituire il percorso della configurazione nello script oxlint con una chiamata
   `biome ci .` sulla configurazione locale.
4. Sostituire le dipendenze `workspace:*` con riferimenti `github:org/repo#commit-or-tag`.
5. Spostare tutte le `devDependencies` (biome, oxlint, typescript) nel `package.json` del
   repo stesso.
6. Aggiungere un `.gitattributes` con `* text=auto eol=lf` (vedi
   [disciplina CRLF/LF](/principles/build-ci-deploy/crlf-lf-discipline)).
7. Togliere `--frozen-lockfile` dallo step di install della CI — i lockfile non vengono
   committati per i repo usati come submodule.

## Come applicarlo

### tsconfig.json — tutto inline

```json
// ❌ Depends on a file outside the repo
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  }
}

// ✅ Self-contained — all options inline
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

Copia le opzioni del compilatore dalla base condivisa nel momento in cui estrai il repo.
La copia si discosterà dalla base col tempo, e va bene così. Il discostamento è visibile e
puoi riesaminarlo; un percorso `extends` rotto resta invisibile finché la CI non ci
inciampa.

### biome.json — autosufficiente con lo schema corretto

```json
// ❌ Extends an outside config
{
  "extends": ["../../biome.json"]
}

// ✅ Self-contained; schema version matches the installed biome version
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "includes": ["**", "!!dist/**", "!!node_modules/**"]
  }
}
```

Il pattern `files.includes` usa la sintassi di negazione di Biome 2.x. Il prefisso `"!!"`
esclude `dist/` così Biome non fa il lint dell'output compilato. Toglilo e Biome farà il
lint dei file generati, segnalando errori che non hanno niente a che fare con il tuo
sorgente.

### package.json — devDeps presenti, nessun riferimento al workspace

```json
// ❌ Missing devDeps (assumed to be in workspace root), workspace dep
{
  "name": "@org/my-lib",
  "dependencies": {
    "@org/shared": "workspace:*"
  }
}

// ✅ devDeps in the repo, github: ref for cross-repo deps
{
  "name": "@org/my-lib",
  "devDependencies": {
    "@biomejs/biome": "2.0.0",
    "typescript": "5.8.3"
  },
  "dependencies": {
    "@org/shared": "github:org/shared#v1.4.2"
  }
}
```

Il formato `github:org/repo#ref` si risolve senza interrogare un registry né serve un
workspace locale. Fissa il ref a un tag o a un hash di commit. Il nome di un branch è
mutabile, quindi non riprodurrà due volte lo stesso install.

### .gitattributes — imporre i fine riga LF

```gitattributes
# .gitattributes at the repo root
* text=auto eol=lf
```

Così ogni file di testo nel repo resta con fine riga LF nell'object store di git, qualunque
sia la piattaforma di chi committa. Vedi
[disciplina CRLF/LF](/principles/build-ci-deploy/crlf-lf-discipline) per la motivazione completa.

### Workflow CI — niente --frozen-lockfile per i repo submodule

```yaml
# .github/workflows/ci.yml

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      # ❌ --frozen-lockfile fails if bun.lockb is not committed
      - run: bun install --frozen-lockfile

      # ✅ Plain install — lockfile not committed for submodule repos
      - run: bun install

      - run: bunx tsc --build
      - run: bunx biome ci .
```

I repo submodule non committano i lockfile in git, perché il lockfile contiene percorsi
assoluti e hash relativi al workspace che non significano niente fuori dalla macchina che
li ha scritti. Il flag `--frozen-lockfile` pretende un lockfile committato e fallisce
quando non c'è.

### Verificare il checkout standalone

Prima di aprire una PR, conferma che il repo compili da zero:

```sh
# In a temp directory — not inside the monorepo
git clone git@github.com:org/repo.git /tmp/repo-test
cd /tmp/repo-test
bun install
bunx tsc --build
bunx biome ci .
# All three must succeed with no errors
```

## Anti-pattern

```jsonc
// ❌ tsconfig.json — extends an outside path
// Symptom: "Cannot find file ../../tsconfig.base.json" in CI
{ "extends": "../../tsconfig.base.json" }

// ❌ biome.json — extends an outside config
// Symptom: "Failed to load config: ../../biome.json not found" in CI
{ "extends": ["../../biome.json"] }

// ❌ package.json — workspace dep
// Symptom: bun install fails; shared package not found in registry
{ "dependencies": { "@org/shared": "workspace:*" } }

// ❌ package.json — missing devDeps
// Symptom: bunx biome — command not found; tsc — command not found
{ "devDependencies": {} }
```

```yaml
# ❌ CI workflow — frozen lockfile without committed bun.lockb
- run: bun install --frozen-lockfile
# Symptom: "error: lockfile not found" — bun.lockb is not in the repo
```

## Applicazione

1. **Test del checkout standalone.** Rendi il primo step del workflow CI una verifica che
   il checkout sia davvero isolato — nessun symlink verso cartelle esterne, nessun
   percorso `../` in alcun file di configurazione:

   ```sh
   # Fail if any config file references a parent directory
   grep -r '\.\./\.\.' tsconfig.json biome.json package.json 2>/dev/null && {
     echo "Config file references a parent-directory path — repo is not standalone"
     exit 1
   } || true
   ```

2. **`tsc --build` e `bunx biome ci .` come step CI obbligatori.** Entrambi devono passare
   da un checkout pulito. Vincola i merge a questi controlli.

3. **Riferimenti `github:` in code review.** Qualsiasi dipendenza `workspace:*` o
   `file:../` nel `package.json` di un repo submodule è un difetto. Segnalala in review.
