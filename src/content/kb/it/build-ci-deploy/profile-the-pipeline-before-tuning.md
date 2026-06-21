---
title: 'Profila la pipeline prima di ottimizzarla'
category: build-ci-deploy
summary: 'Leggi i tempi per singolo step dall API della CI prima di ottimizzare qualsiasi cosa; il collo di bottiglia non sta quasi mai dove sembra. Metti in cache per versione dello strumento, aggiungi timeout-minutes agli step di installazione perché un blocco fallisca subito, e fissa le versioni dei runtime che danno problemi.'
principle: 'Ottimizza una pipeline partendo dai tempi misurati per singolo step, dal più grande al più piccolo. Metti in cache i download usando come chiave la versione dello strumento, limita ogni step di installazione con timeout-minutes e fissa le versioni del runtime quando una più recente rompe qualcosa — con un commento che dice perché.'
severity: preferred
tags: [ci, performance, github-actions, caching]
sources:
  - project: 'una SPA di content-admin'
    date: 2026-06-12
    note: 'Deploy 9m36s→5m36s. I tempi per step mostravano gli e2e a 6m55s su una pipeline da 9.5m — tutto il resto era rumore. Download dei browser messi in cache per versione di Playwright (~25s→~5s a caldo). Node 24 sul PATH ha fatto bloccare playwright install per oltre 1h due volte; fissato il 22 con timeout-minutes: 8 sullo step.'
related:
  - testing/parallel-workers-surface-races
  - build-ci-deploy/least-privilege-workflows
  - process/spike-riskiest-first
order: 8
updated: 2026-06-12
---

"Il deploy è lento" è una sensazione. Una tabella dei tempi per singolo step è un
piano. I provider di CI espongono la durata degli step tramite le loro API, quindi
recuperala prima di toccare qualunque cosa. L'intuito su dove se ne vada il tempo
della pipeline sbaglia con regolarità, e togliere 30 secondi a uno step da 30
secondi è invisibile dentro un run da dieci minuti.

## Perché conta

Un deploy da dieci minuti sulla SPA di content-admin (2026-06-12) si scomponeva
così: test unitari 70s, build 29s, installazione browser 25s, **E2E 6m55s**, coda
del deploy 30s. Uno step era il 70% della pipeline, e nient'altro contava finché
non si riduceva. Parallelizzare i worker E2E ha portato lo step a 2m46s e la
pipeline a 5m36s. Le leve più piccole (caching, limiti sull'installazione) sono
diventate utili solo dopo che la grande era atterrata.

Due guasti collaterali durante lo stesso lavoro hanno insegnato la metà operativa
della regola:

- Uno step `playwright install` **si è bloccato per oltre un'ora, due volte**,
  bruciando minuti del runner e bloccando la coda, perché Node 24 sul PATH rompeva
  l'installer. Senza `timeout-minutes`, una regressione dello strumento su quello
  step si trasforma in uno stallo silenzioso lungo un'ora. Mettigli un limite e la
  stessa regressione compare come una X rossa nel giro di minuti.
- La soluzione è stata fissare Node 22. Quel pin sembra arbitrario se il workflow
  non dice perché c'è. I pin senza spiegazione vengono "ripuliti" dal refactor
  successivo, e poi il blocco torna.

## Come applicarla

**Passo 1: misura.** Recupera i tempi degli step dall'API, non scorrendo i log:

```sh
gh run view <run-id> --json jobs \
  --jq '.jobs[].steps[] | {name, startedAt, completedAt}'
```

Ordina per durata, decrescente, e spendi le energie rigorosamente dall'alto verso
il basso. La [disciplina del più rischioso/più grande
prima](/kb/process/spike-riskiest-first) vale anche per le pipeline.

**Passo 2: metti in cache i download, usando come chiave la versione dello
strumento.**

```yaml
- name: Get Playwright version
  id: pw
  run: echo "version=$(bun pm ls | grep @playwright/test | …)" >> "$GITHUB_OUTPUT"
- uses: actions/cache@<sha>
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}
```

Usare la versione come chiave invece dell'hash del lockfile fa sopravvivere la
cache a bump di dipendenze non correlati e la invalida esattamente quando cambiano
i browser.

**Passo 3: limita ogni step di installazione.**

```yaml
- name: Install Playwright browsers
  timeout-minutes: 8   # a healthy install takes ~25s; a hang is a regression
  run: bunx playwright install --with-deps
```

**Passo 4: fissa ciò che si è rotto, e di' perché lì sul posto.**

```yaml
- uses: actions/setup-node@<sha>
  with:
    node-version: 22  # Node 24 makes `playwright install --with-deps` hang (2026-06-12)
```

## Anti-pattern

```yaml
# ❌ Tuning the 30s step while a 7-minute step sits untouched — no measurement.

# ❌ Unbounded install. A registry hiccup or tool regression = 1h of runner time.
- run: bunx playwright install --with-deps   # no timeout-minutes

# ❌ Cache keyed on the lockfile — invalidates on every unrelated dep bump.
key: playwright-${{ hashFiles('bun.lock') }}

# ❌ A bare pin with no reason. The next cleanup PR unpins it and the
#    hour-long hang returns with no paper trail.
node-version: 22
```

## Come farla rispettare

Dopo ogni modifica alla pipeline, recupera di nuovo la tabella dei tempi e scrivi
entrambi i numeri (prima/dopo) nella PR. Controlli in review: ogni step di
installazione o download ha `timeout-minutes`, ogni chiave di cache codifica la
versione dello strumento che mette in cache, e ogni pin di versione porta con sé
una motivazione in-file con una data.
