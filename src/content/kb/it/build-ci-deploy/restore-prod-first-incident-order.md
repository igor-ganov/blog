---
title: 'Quando la produzione è rossa, prima ripristina, poi cerca la causa'
category: build-ci-deploy
summary: 'Durante un guasto in produzione l''ordine è hot-fix → conferma del deploy verde → apertura della PR sulla causa → scrittura dei test. Scrivere i test o aprire la PR pulita mentre il sito è giù allunga il disservizio.'
principle: 'Durante un guasto in produzione, l''ordine è hot-fix → conferma del deploy verde → apertura della PR sulla causa → scrittura dei test. Non scrivere test né aprire la PR pulita mentre il sito è giù.'
severity: strong
tags: [incident, production, deployment, process, reliability]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-05-05
    note: 'ordine: hot-fix → deploy verde → PR sulla causa → test'
related:
  - error-handling/no-self-rolled-yaml
  - process/prove-with-production-screenshots
order: 5
updated: 2026-05-05
---

Quando la produzione è rotta, ripristina il servizio. Capire perché si è rotta, scrivere un test che
dimostra il guasto, aprire una PR con la correzione architetturale pulita: tutto necessario, tutto dopo che il
sito è verde.

L'istinto di "sistemarlo come si deve" mentre il sito è giù è comprensibile, perché evita di
distribuire un hotfix che viene subito rimpiazzato dalla correzione vera. Quello che fa davvero è
tenere il sito giù più a lungo mentre scrivi i test e aspetti la review, con utenti e stakeholder
che guardano il disservizio trascinarsi. Un recupero in due passi (hotfix ora, correzione pulita dopo) costa quasi sempre
meno di un recupero in un solo passo che richiede tre volte il tempo.

## Perché conta

**Una SPA di amministrazione contenuti, 2026-05-05.**

La build del sito pubblico è diventata rossa per un errore di parsing YAML in un file di contenuto
(vedi [no-self-rolled-yaml](/principles/error-handling/no-self-rolled-yaml) per la causa).
Il log della build puntava al file incriminato. La sequenza corretta era:

1. Identificare il file rotto dal log della CI.
2. Applicare l'hot-patch al contenuto nel repo dei contenuti (non nel repo dell'applicazione: il suo `src/content`
   è gitignored; i contenuti vivono in un repo a parte).
3. Fare push della patch. Un'automazione crea un commit vuoto sul repo dell'applicazione, che innesca
   un nuovo deploy.
4. Guardare il deploy diventare verde. Confermare che il sito sia su.
5. Solo allora: aprire la o le PR che correggono la causa e aggiungono i test.

Il primo istinto del team è stato partire dal passo 5: aprire la PR pulita con un uso corretto della
libreria YAML, aggiungere test di regressione, fare review, merge, deploy. Questo ha tenuto il sito rosso per tutta
la durata di quel lavoro, e ogni minuto di downtime speso in code review e scrittura di test
era evitabile.

L'hotfix in sé, mettere tra apici la stringa YAML ostile nel file di contenuto, ha richiesto meno di due minuti
una volta identificato il file rotto. Lo scarto tra "identificato" e "sito verde" avrebbe
dovuto essere sotto i cinque minuti. Non lo è stato.

## Come applicarlo

### Passo 1: Identificare lo stato rotto

```sh
# Get the failing run ID from the most recent workflow run
gh run list --workflow deploy.yml --limit 5

# View the log for the failing steps only
gh run view <run-id> --log-failed
```

Il flag `--log-failed` filtra ai passi falliti, che in un fallimento di build puntano
dritti al file e all'errore. Non leggere il log intero, solo il fallimento.

### Passo 2: Applicare l'hot-patch nel repo giusto

Se il fallimento è negli input della build (contenuti, configurazione, variabili d'ambiente) e non nel
codice dell'applicazione, la patch va nel repo degli input, non nel repo dell'applicazione.

Per la pipeline dei contenuti della SPA di amministrazione contenuti:

```sh
# Content lives in the content repo, not in the application repo
# src/content is listed in the application repo's .gitignore

# In the content repo:
git checkout master
# Edit the broken file — quote the hostile YAML string
# title: 'Correct: with colon' rather than title: Correct: with colon
git add content/articles/the-broken-file.md
git commit -m "hotfix: quote colon in title to fix build"
git push
# Automation triggers an empty commit on the application repo, which triggers redeploy
```

### Passo 3: Confermare che il deploy sia verde

Non passare al passo 4 finché il deploy non è confermato verde. Guarda il workflow run in diretta o interrogalo:

```sh
gh run watch --workflow deploy.yml
# or
gh run list --workflow deploy.yml --limit 1
```

Il sito deve essere su e servire correttamente prima che inizi la fase di post-mortem. Scatta uno
screenshot di produzione se la correzione è visiva (vedi
[prove-with-production-screenshots](/principles/process/prove-with-production-screenshots)).

### Passo 4: Aprire la PR sulla causa

Dopo che il sito è verde, apri una PR che:

- Corregge il codice di base che ha permesso il guasto (per esempio sostituisce il
  serializzatore YAML fatto in casa con una libreria vera).
- Aggiunge un test di regressione che avrebbe intercettato il guasto prima che arrivasse in CI.
- Documenta l'incidente nella descrizione della PR con la cronologia e la causa.

Fai la review di questa PR con calma e mergiala col processo normale senza pressioni di tempo, dato
che il sito è già verde.

### Stringhe YAML ostili — il pattern di correzione specifico

L'incidente del 2026-05-05 è stato innescato da un valore YAML che conteneva i due punti. L'hotfix
immediato è mettere la stringa tra apici:

```yaml
# ❌ Broken — colon after space is a YAML mapping indicator
title: An article about REST: designing APIs

# ✅ Fixed — single-quoted string; YAML allows colons inside single quotes
title: 'An article about REST: designing APIs'

# ✅ Also valid — double-quoted
title: "An article about REST: designing APIs"
```

I file del repo dei contenuti si modificano a mano, quindi una persona può applicare gli apici in meno di un minuto.
La correzione pulita (una libreria YAML nel serializzatore, un controllo di parsing in pre-commit) va nella
PR di follow-up.

### Innescare un nuovo deploy senza una modifica al codice

Alcuni progetti hanno bisogno di una modifica al codice nel repo dell'applicazione per innescare la CI, anche quando la correzione
vive in un altro repo. Un commit vuoto fa il lavoro:

```sh
# In the application repo
git commit --allow-empty -m "chore: trigger redeploy after content hotfix"
git push
```

In alternativa, usa un trigger `workflow_dispatch` di GitHub Actions se il workflow lo supporta:

```sh
gh workflow run deploy.yml --ref main
```

## Anti-pattern

Questi allungano tutti il disservizio senza motivo:

**Aprire una PR pulita mentre il sito è giù.** La PR ha bisogno di review, la review richiede tempo,
e il sito resta giù per tutto quel tempo. L'hotfix avrebbe ripristinato il servizio in pochi minuti.

**Scrivere prima i test di regressione.** I test confermano che il bug esiste, cosa che il guasto in produzione
conferma già. I test sono necessari, ma vanno nella PR sulla causa, non nell'hotfix.

**Voler capire la causa completa prima di agire.** "Voglio capire perché è successo
prima di toccare qualcosa" è l'istinto giusto per un post-mortem e quello sbagliato
quando il sito è rosso. Prima ripristina, poi indaga.

**Fare l'hotfix nel repo sbagliato.** Se i contenuti vivono fuori dal repo dell'applicazione, l'hotfix
va nel repo dei contenuti. Patchare il repo sbagliato innesca un deploy che non porta la
correzione.

```sh
# ❌ Wrong repo — the content site's src/content is gitignored; this change has no effect
cd content-repo
vim src/content/articles/the-broken-file.md
git add src/content/articles/the-broken-file.md
git commit -m "hotfix"
git push
# The broken file is sourced from the content repo at build time.
# This commit changes a gitignored file; the build is unchanged.
```

## Applicazione

Questa è una regola di processo, non una regola di codice. Falla rispettare tramite:

1. **Runbook degli incidenti.** Un runbook scritto nella cartella `docs/` del repo che descrive i
   quattro passi. I nuovi membri del team lo leggono durante l'onboarding, e resta la fonte
   autorevole per l'ordine degli interventi sugli incidenti.

2. **Review post-incidente.** Dopo ogni incidente in produzione, una breve review scritta
   registra la cronologia, la causa e se l'ordine degli interventi è stato seguito.
   Annota le deviazioni senza colpevolizzare, e lascia che lo schema delle deviazioni guidi gli aggiornamenti del runbook.

3. **Consapevolezza di chi è on-call.** Prima che arrivi un incidente, chi è on-call deve sapere quale
   repo contiene i contenuti, quale repo innesca i deploy e come innescare un nuovo deploy senza
   una modifica al codice. Scoprirlo durante un disservizio è troppo tardi.
