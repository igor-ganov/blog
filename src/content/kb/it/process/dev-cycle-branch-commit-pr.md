---
title: 'Il ciclo di sviluppo dal ticket alla PR'
category: process
summary: 'Segui un ciclo costante: branch feat/<wi>-<short-title>, commit <WI>: Descrizione, prima un E2E che fallisce, build, verifica nel runtime reale, documentazione, PR.'
principle: 'Segui un ciclo costante: branch feat/<wi>-<short-title>, commit "<WI>: Descrizione", piano + piano di test, prima un E2E che fallisce, build, verifica nel runtime reale, documentazione (README per cartella + documentation/user), pulizia finale, PR.'
severity: preferred
tags: [process, dev-cycle, git, branch, commits, pr, workflow]
sources:
  - project: 'skill dev-cycle'
    date: 2026-06-02
    note: 'formato branch/commit; prima il test che fallisce; desktop-first; documentazione; PR'
related:
  - process/desktop-target-first
  - process/spec-driven-ears-not-user-stories
order: 8
updated: 2026-06-10
---

Il ciclo di sviluppo è la sequenza che porta un elemento del backlog da "pronto per
partire" a "PR mergiata". Sta un livello sotto il workflow guidato dalle spec. La spec
produce i task attraverso requisiti, design e task; il ciclo di sviluppo esegue ogni
task sempre allo stesso modo. Farlo sempre allo stesso modo elimina l'overhead del "e
adesso cosa faccio?", e fa sì che i reviewer sappiano già in anticipo cosa conterrà una
PR uscita da questo ciclo.

## Perché conta

Un ciclo costante ti dà un output costante. Una PR uscita da questo ciclo ha un branch
con un nome, commit che puoi ricondurre a un task, un test che è partito rosso ed è
finito verde, il comportamento verificato nel runtime reale e una documentazione che
combacia con il codice. Quando uno di questi pezzi manca, la PR risulta incompleta,
perché la checklist la conoscono già tutti.

Il ciclo incorpora anche le priorità. La documentazione si scrive prima di aprire la PR,
non a sprint finito. La verifica desktop-first è uno step esplicito, non qualcosa che
fai se avanza tempo. E il test che fallisce all'inizio è la prova che quel test poteva
fallire davvero, l'unica cosa che lo rende utile per intercettare una regressione più
avanti.

## Come applicarlo

### Step 1: Recuperare il contesto

Prima di scrivere una riga di codice, recupera:

- L'elemento del backlog (task, issue, ticket) e la sua descrizione completa.
- L'epic padre o la fase di spec a cui appartiene il task.
- Gli elementi correlati: task dipendenti, sezioni di design collegate, requisiti
  referenziati.

Non leggi tanto per leggere. Estrai i contratti che l'implementazione deve rispettare e
che i test devono verificare: forma dell'API, schema dei dati, tipi di evento.

### Step 2: Branch

```bash
git checkout -b feat/<work-item-id>-<short-title>
# Examples:
# feat/123-outbox-relay
# feat/BLOG-47-mobile-nav
```

Crea il branch dall'ultimo `main` (o dal merge base del branch padre dell'epic se stai
lavorando dentro un epic gated). Non riutilizzare un branch di un task precedente.

### Step 3: Piano di esecuzione e piano di test

Scrivi (o conferma) il piano di esecuzione nella issue del task o in una nota di
appunti:

```markdown
## Execution plan
1. Add `failure_count` column migration (TASK-7, REQ-4)
2. Add promotion logic in OutboxRelay.attemptDelivery
3. Add metric emission
4. Unit test: promotion at exactly 10 failures
5. Unit test: metric emitted on promotion
6. Integration test: relay promotes real row in test DB

## Test plan
- Unit: OutboxRelay.attemptDelivery – promotes at threshold
- Unit: OutboxRelay.attemptDelivery – emits dlq.moved metric
- Integration: relay process – end-to-end promotion in test DB
- E2E (if applicable): admin panel shows DLQ count
```

Il piano di test non lo scrivi per archiviarlo. Decide quali test scrivi nello step 4.

### Step 4: Scrivi prima il test che fallisce

Scrivi il test prima dell'implementazione. Eseguilo. Verifica che fallisca per il motivo
giusto (la funzionalità non esiste ancora, non un errore di sintassi o un problema di
import).

```ts
// Confirm this fails before the implementation exists.
it('promotes message to DLQ after 10 consecutive failures', async () => {
  const relay = createRelay(config);
  const msg = await seedMessage(db, { failureCount: 9 });

  await relay.attemptDelivery(msg.id); // 10th failure — should promote

  const dlq = await db.query('SELECT * FROM outbox_dead_letter WHERE id = $1', [msg.id]);
  expect(dlq.rows).toHaveLength(1);
});
```

Un test che non è mai stato rosso non ha mai dimostrato di intercettare niente. Fallo
fallire prima.

### Step 5: Implementare

Scrivi il minimo codice che fa passare il test che fallisce. Non aggiungere
comportamenti non coperti da test. Non allargare lo scope oltre il confine del task. Se
durante l'implementazione scopri che la spec è sbagliata, fermati e segui il processo di
modifica della spec descritto in
[traceability-and-phase-reviews](/kb/process/traceability-and-phase-reviews).

Committa in modo atomico. Ogni commit dovrebbe essere così:

```
<WI>: Short imperative description

Optional longer explanation if the change is not self-evident.
```

Esempi:
```
TASK-7: Add failure_count column to outbox table
TASK-7: Promote message to DLQ after 10 consecutive failures
TASK-7: Emit dlq.moved metric on promotion
```

Il prefisso con il work item è ciò che ti permette di ricondurre qualsiasi commit al suo
task, alla sezione di design che ci sta dietro e ai requisiti da cui è nato.

### Step 6: Controllare nell'IDE

Dopo ogni modifica logica, controlla nell'IDE errori di tipo, violazioni del linter e
warning. Non lasciare che un arretrato di problemi nell'IDE si accumuli fino alla fine;
risolvi ognuno appena salta fuori. Una PR che introduce nuovi errori di tipo o
violazioni del linter non è pronta per la review.

### Step 7: Assicurarsi che faccia la build

```bash
bun run build
```

La build dev'essere pulita. Una PR che non builda non è una PR.

### Step 8: Verifica desktop-first

Se il progetto ha un target desktop, builda l'app desktop e verifica lì la funzionalità
per prima cosa. Vedi [desktop-target-first](/kb/process/desktop-target-first) per il
protocollo completo. La prova tramite screenshot è obbligatoria.

Se il progetto è solo web, esegui la build di produzione in locale e verifica nel browser
tramite l'MCP, non solo nel dev server.

### Step 9: Eseguire gli E2E Playwright

Esegui l'intera suite Playwright. Passa tutto, tre run di fila, con zero flaky. Nessun
test saltato, nessun fallimento noto.

```bash
bun run test:e2e
```

Un test flaky è un test che fallisce. Sistemalo prima di aprire la PR.

### Step 10: Aggiornare la documentazione

Ogni PR che cambia il comportamento deve aggiornare la documentazione:

- **README.md in ogni cartella toccata** — scopo, struttura, decisioni chiave.
- **documentation/user/** — guida alla funzionalità se la modifica è visibile all'utente.

La documentazione fa parte del ciclo, non è qualcosa da appiccicare dopo. Una PR che
cambia un'API senza aggiornare il README di quel modulo è incompleta.

### Step 11: Pulizia finale

Prima di aprire la PR:

- Rimuovi codice di debug, istruzioni `console.log`, codice commentato.
- Verifica che tutti i commenti TODO nei file modificati siano risolti oppure
  corrispondano a issue tracciate (niente "TODO: fix this later" nel codice nuovo).
- Esegui il linter un'ultima volta.
- Esegui la build un'ultima volta.

### Step 12: Controllo manuale nel browser MCP

Apri il browser MCP puntato sulla build finale e prova di nuovo la funzionalità.
Verifica che la console sia pulita. Fai gli screenshot finali.

### Step 13: Aprire la PR

La descrizione della PR segue questa struttura:

```markdown
## Summary
- What this PR delivers (one sentence per bullet, max three bullets).
- Reference to the task/issue: closes #123.

## Changes
- Brief list of implementation changes (module names, new files, removed files).

## Test plan
- What was tested and how.
- Screenshot attachments (desktop, mobile if applicable).

## Checklist
- [ ] Tests pass (all layers, zero flakes)
- [ ] Build passes
- [ ] Desktop verified (if applicable)
- [ ] Mobile verified (if applicable)
- [ ] Documentation updated
- [ ] No debug code
```

## Anti-pattern

**Partire dall'implementazione.** Se scrivi il codice prima del test che fallisce, il
test finisce per essere modellato così da far passare il codice che hai già scritto, non
per verificare un requisito. Diventa verde alla prima run e ti dice quasi niente sulla
copertura.

**Mettere più task in un'unica PR.** Ogni task in `tasks.md` corrisponde a una PR.
Accorparli rende più difficili review, bisection e rollback. L'eccezione sono i task
banalmente piccoli, senza complessità di design, come una rinomina o una modifica di
configurazione; raggruppali con una nota nella descrizione della PR.

**Rimandare la documentazione.** I documenti che scrivi una settimana dopo descrivono
l'implementazione come te la ricordi, non come l'avevi capita mentre la costruivi.
Scrivili durante il ciclo, con il codice davanti, e vengono fuori accurati.

**Aprire una PR in draft e dimenticarsi della checklist.** Una draft serve per un
feedback precoce sulla direzione. Non è un parcheggio per lavoro in corso con una
checklist senza risposte. Se ne apri una, scrivi nero su bianco cosa manca e quando
pensi di finire.

**Saltare lo step della build.** "I test passano, quindi la build è a posto." I test
girano in un ambiente con i moduli già risolti, e la build può comunque rompersi su un
import path, un asset mancante o una configurazione del bundler. Builda a parte, verifica
a parte.

## Vedi anche

Questo ciclo esegue il workflow guidato dalle spec. Il suo input è un task da `tasks.md`.
Il workflow che produce quei task è documentato in
[spec-driven-ears-not-user-stories](/kb/process/spec-driven-ears-not-user-stories)
e [traceability-and-phase-reviews](/kb/process/traceability-and-phase-reviews).
