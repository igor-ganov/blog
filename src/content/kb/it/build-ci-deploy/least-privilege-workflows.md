---
title: 'I workflow dichiarano i permessi e bloccano le action per SHA'
category: build-ci-deploy
summary: 'Ogni workflow di GitHub Actions riceve un blocco permissions esplicito a privilegi minimi, le action di terze parti vengono fissate sul commit SHA completo e i secret restano confinati allo step che ne ha bisogno — perché di default non hai nessuna di queste cose.'
principle: 'permissions: contents: read in cima a ogni workflow (allarga per singolo job solo quando serve davvero); ogni uses: fissato a uno SHA di 40 caratteri con la versione nel commento; secret nello env a livello di step dietro un controllo same-repo, mai a livello di job su pull_request.'
severity: strong
tags: [ci, github-actions, supply-chain, least-privilege, security]
sources:
  - project: 'una SPA di content-admin'
    date: 2026-06-11
    note: 'Audit: zero blocchi permissions su 9 workflow in due repo, tutte le action fissate a un tag, un PAT di sandbox nello env a livello di job su pull_request. Tutti e tre risolti in un solo passaggio; l ecosistema github-actions di dependabot tiene aggiornati i pin SHA.'
related:
  - build-ci-deploy/dependabot-codeql-automerge
  - build-ci-deploy/build-time-env-is-baked
order: 7
updated: 2026-06-11
---

Tre default di GitHub Actions sono sbagliati dal punto di vista della sicurezza, e
nessuno di essi ti salta all'occhio finché un audit o un incidente non lo trascina
alla luce:

1. Il `GITHUB_TOKEN` ambientale punta di default a una concessione ampia (dipende
   dall'impostazione di org/repo, e storicamente significava lettura/scrittura).
   Ogni step lo eredita, incluso il codice dentro una action compromessa o una
   dipendenza transitiva malevola che gira durante `bun install`.
2. I tag sono mutabili. `uses: some-org/some-action@v4` viene risolto di nuovo
   a ogni esecuzione. Basta dirottare l'account di un maintainer, ripuntare il tag,
   e il deploy successivo esegue il codice dell'attaccante seduto proprio accanto a
   `CLOUDFLARE_API_TOKEN`.
3. Lo `env` a livello di job consegna i secret a ogni step. Sugli eventi
   `pull_request` quel job esegue codice scritto nella PR. GitHub di default
   nasconde i secret alle PR da fork, ma le PR dallo stesso repo e le impostazioni
   allentate scavalcano entrambe quella protezione.

Su una SPA di content-admin e sul suo sito pubblico (2026-06-11), l'audit ha tirato
fuori tutti e tre insieme: nove workflow con zero blocchi `permissions:`, ogni
action fissata a un tag e un PAT di sandbox nello env a livello di job su un
workflow E2E innescato da `pull_request`.

## Come applicarlo

In cima a ogni workflow, prima di `jobs:`:

```yaml
# Least-privilege GITHUB_TOKEN — deploys use dedicated secrets,
# nothing here needs repo write access via the ambient token.
permissions:
  contents: read
```

Allarga per singolo job, e rendi evidente il motivo. Un workflow che fa push di
commit dovrebbe usare un PAT dedicato (raggio d'azione diverso, e puoi ruotarlo)
oppure ottenere `contents: write` esattamente sul job che fa il push, da nessun'altra
parte.

Ogni `uses:` riceve uno SHA completo e un commento leggibile da una persona:

```yaml
- uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
- uses: cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0 # v4.0.0
```

Quel commento fa un lavoro concreto. L'ecosistema `github-actions` di Dependabot lo
legge, fa avanzare lo SHA e riscrive il commento nella stessa PR. Fissare lo SHA
senza dependabot è il modo in cui finisci per eseguire una action vecchia di due
anni, quindi aggiungi entrambe le cose in un'unica modifica:

```yaml
# .github/dependabot.yml
- package-ecosystem: github-actions
  directory: /
  schedule:
    interval: weekly
```

Sposta i secret dallo env a livello di job a quello a livello di step, e a ogni job
innescato da una PR che tocca un secret dai un controllo same-repo:

```yaml
if: >-
  github.event_name == 'push' ||
  github.event.pull_request.head.repo.full_name == github.repository
steps:
  - name: Run real-mode suite
    env:
      GITHUB_E2E_KEY: ${{ secrets.GH_E2E_PAT }}   # this step only
    run: bun run test:e2e:realmode
```

## Anti-pattern

```yaml
# Whole-job secret on a PR trigger — every step, including PR code, sees it.
jobs:
  e2e:
    env:
      API_KEY: ${{ secrets.API_KEY }}

# Trusting a moving tag next to deploy credentials.
- uses: cloudflare/wrangler-action@v3

# Gating deploy logic on attacker-controllable text:
if: ${{ !startsWith(github.event.head_commit.message, 'content:') }}
# anyone who can phrase a commit message can skip the gate — make the
# check a required status check in branch protection instead.
```

## Enforcement

La branch protection rende i check E2E/deploy *obbligatori*, così un controllo a
livello di workflow non si può saltare scrivendo il messaggio di commit in un certo
modo. In aggiunta, zizmor o actionlint in CI segnaleranno i `permissions:` mancanti
e le action non fissate, e dependabot tiene i pin onesti.
