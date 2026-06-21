---
title: 'Dependabot + CodeQL + auto-merge con vincoli'
category: build-ci-deploy
summary: 'Su un repo pubblico: Dependabot (raggruppato settimanale + sicurezza immediata), CodeQL security-extended, un gate di verifica CI + dependency-review, e auto-merge solo per patch/minor — i major restano alla revisione umana.'
principle: 'Su un repo pubblico: Dependabot (raggruppato settimanale + sicurezza immediata), CodeQL security-extended, un gate di verifica CI + dependency-review, e auto-merge solo per patch/minor — i major restano alla revisione umana.'
severity: preferred
tags: [ci, security, dependabot, codeql, automerge, branch-protection, github]
sources:
  - project: 'una libreria di web component headless'
    date: 2026-06-10
    note: 'Dependabot+CodeQL+verifica CI+dependency-review; auto-merge solo patch/minor; branch protection'
related:
  - build-ci-deploy/standalone-submodule-ci
  - functional-architecture/lint-enforces-architecture
order: 6
updated: 2026-06-10
---

Un repository pubblico accumula esposizione di sicurezza man mano che le sue dipendenze
invecchiano, e Dependabot porta a galla quell'esposizione al posto tuo. Senza barriere,
però, le PR di Dependabot si accumulano. O le mergi alla cieca oppure le lasci marcire in
un arretrato che nessuno tocca, e tutte e due le strade comportano un rischio. Questo
schema automatizza il lavoro a basso rischio (aggiornamenti patch e minor) e costringe una
persona a guardare il lavoro ad alto rischio: aggiornamenti major e advisory di sicurezza
che richiedono un giudizio.

Ci sono quattro pezzi in movimento. Dependabot trova gli aggiornamenti, CodeQL analizza il
codice in cerca di vulnerabilità introdotte, la CI controlla che la build continui a
passare, e il workflow di auto-merge unisce gli aggiornamenti sicuri così nessuno deve
farlo a mano.

## Perché conta

**Una libreria di web component headless, 2026-06-10.**

La libreria è un repo pubblico. Serviva una postura di manutenzione che restasse sicura nel
tempo senza obbligare uno sviluppatore a revisionare e mergiare a mano i bump di dipendenze
di routine ogni settimana. Gli obiettivi di progettazione:

- Gli aggiornamenti patch e minor si mergiano da soli se la CI passa — zero tempo umano.
- Gli aggiornamenti major richiedono una persona: possono includere cambi di API che rompono la compatibilità.
- Gli aggiornamenti da advisory ad alta severità vengono segnalati subito, non a cadenza settimanale.
- Il codice introdotto dalle dipendenze viene analizzato per pattern di vulnerabilità noti.
- Le PR che tirano dentro advisory ad alta severità vengono bloccate al gate della CI, non solo segnalate.

L'intera configurazione vive in `.github/`. Una parte sono file di workflow; il resto sono
impostazioni del repository applicate tramite l'API di GitHub, dato che non si possono
esprimere in file.

## Come applicarlo

### .github/dependabot.yml

```yaml
# .github/dependabot.yml
version: 2
updates:
  # npm dependencies — grouped to reduce PR noise
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      all-dependencies:
        patterns: ["*"]
    # Security updates bypass the weekly schedule and open immediately
    open-pull-requests-limit: 10

  # GitHub Actions — keep runners and actions up to date
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      all-actions:
        patterns: ["*"]
```

La chiave `groups` collassa più aggiornamenti di pacchetto in un'unica PR, il che taglia il
numero di PR da revisionare o mergiare automaticamente da potenzialmente decine a settimana
a una o due. Gli aggiornamenti di sicurezza non vengono mai raggruppati. Si aprono nel
momento in cui una vulnerabilità viene pubblicata, ignorando la cadenza settimanale.

### .github/workflows/codeql.yml

```yaml
# .github/workflows/codeql.yml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Weekly scan independent of pushes — catches newly published CVEs
    - cron: '0 3 * * 1'

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          # security-extended adds CWE coverage beyond the default ruleset
          queries: security-extended

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: /language:javascript-typescript
```

La suite di query `security-extended` copre injection, path traversal, prototype pollution
e altre categorie CWE che la suite predefinita salta. L'esecuzione settimanale via cron è
quella che intercetta una vulnerabilità in codice che non è cambiato, una volta che spunta
un nuovo CVE.

### .github/workflows/ci.yml

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    name: Verify
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bunx tsc --build
      - run: bunx biome ci .
      - run: bun run build

  dependency-review:
    name: Dependency Review
    runs-on: ubuntu-latest
    # Only runs on PRs — compares the base and head to find new deps
    if: github.event_name == 'pull_request'
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          # Block PRs that introduce packages with high or critical advisories
          fail-on-severity: high
          # Post a summary comment on the PR
          comment-summary-in-pr: always
```

Il job `dependency-review` è il gate che impedisce a Dependabot di mergiare in automatico un
"aggiornamento di sicurezza" che in realtà è un downgrade a una versione con un advisory.
Confronta l'albero delle dipendenze prima e dopo la PR e fallisce se una qualsiasi nuova
dipendenza porta un advisory di severità alta o critica.

### .github/workflows/dependabot-auto-merge.yml

```yaml
# .github/workflows/dependabot-auto-merge.yml
name: Dependabot Auto-merge

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  auto-merge:
    name: Auto-merge patch/minor
    runs-on: ubuntu-latest
    # Only run for Dependabot PRs
    if: github.actor == 'dependabot[bot]'
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Fetch Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Enable auto-merge for patch and minor updates
        # Majors are intentionally excluded: they may have breaking changes
        # and deserve human review regardless of CI status.
        if: |
          steps.metadata.outputs.update-type == 'version-update:semver-patch' ||
          steps.metadata.outputs.update-type == 'version-update:semver-minor'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`gh pr merge --auto` arma il merge solo quando tutti i controlli di stato richiesti passano.
Non approva la PR; le GitHub Actions non possono approvare PR per conto del proprietario del
repo, per design. Il merge scatta quando la CI (verify + dependency-review + codeql) diventa
verde.

I major restano fuori da tutto questo di proposito. Un bump major può rimuovere API,
cambiare il comportamento predefinito o richiedere una migrazione di configurazione. La CI
verde su un major ti dice che la build compila, non che l'upgrade sia sicuro. Qualcuno deve
leggere il changelog.

### Impostazioni del repository via gh api

Queste impostazioni non si possono esprimere nei file di workflow. Applicale una volta, dopo
che il repo esiste:

```sh
REPO="my-org/web-components"

# Enable Dependabot alerts and automated security fixes
gh api repos/$REPO/vulnerability-alerts -X PUT
gh api repos/$REPO/automated-security-fixes -X PUT

# Enable secret scanning and push protection
gh api repos/$REPO \
  --method PATCH \
  --field security_and_analysis='{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}'

# Enable auto-merge at the repo level (required for gh pr merge --auto to work)
gh api repos/$REPO --method PATCH --field allow_auto_merge=true

# Branch protection on main: require the verify check, require conversation resolution
gh api repos/$REPO/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["Verify"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_conversation_resolution": true
}
EOF
```

`enforce_admins: false` tiene funzionante il push diretto da admin, cosa che vuoi per gli
hotfix d'emergenza. `required_conversation_resolution: true` blocca il merge di una PR che
ha ancora commenti di revisione irrisolti, e questo conta per le PR di aggiornamento major
che passano dalla revisione umana.

## Anti-pattern

```yaml
# ❌ No groups — one PR per package update
# Symptom: 20+ Dependabot PRs open simultaneously; all ignored as noise
- package-ecosystem: npm
  schedule:
    interval: daily

# ❌ Auto-merge of majors
if: steps.metadata.outputs.update-type != 'version-update:semver-major'
# Symptom: a major that removes a used API merges automatically; CI misses runtime
# behavior changes that TypeScript types don't capture.

# ❌ No dependency-review gate
# Symptom: Dependabot security update is itself a downgrade to a vulnerable version;
# PR auto-merges; repo now has a dependency with an active CVE.

# ❌ Approve step using GITHUB_TOKEN
- run: gh pr review --approve "$PR_URL"
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
# Symptom: "Resource not accessible by integration" — Actions cannot self-approve.
# The auto-merge works without an approve step when branch protection does not
# require reviews (set required_pull_request_reviews: null).
```

## Applicazione

L'applicazione è strutturale. La regola di branch protection esige che il controllo `Verify`
passi prima che qualsiasi merge sia permesso, l'auto-merge scatta solo quando i controlli
passano, e i major non si mergiano mai da soli. Non resta nessun passaggio manuale da
saltare.

Rivedi la configurazione ogni trimestre:
- Verifica che CodeQL stia ancora analizzando con `security-extended`.
- Verifica che il `fail-on-severity` di `dependency-review` sia ancora `high`.
- Verifica che nessuna PR di aggiornamento major sia rimasta non revisionata per più di due settimane.

Quando una PR di aggiornamento major resta aperta oltre le due settimane, il passaggio di
revisione umana è diventato troppo costoso. Aggiusta il processo, non ricorrere a un bypass
dell'automazione.
