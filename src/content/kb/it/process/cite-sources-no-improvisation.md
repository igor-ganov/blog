---
title: 'Cita le fonti — niente improvvisazione'
category: process
summary: 'Ogni affermazione sostanziale poggia su una fonte verificata; nessuna best practice senza attribuzione; proponi una sola opzione forte, non un menu; critica il sistema, non le persone.'
principle: 'Ogni affermazione sostanziale poggia su una fonte verificata (link/citazione); nessuna best practice senza attribuzione; proponi una sola opzione forte, non un menu; critica il sistema, non le persone.'
severity: strong
tags: [process, research, sources, communication, editorial]
sources:
  - project: 'un''azienda multi-prodotto (caso di studio DDD)'
    date: 2026-05-27
    note: 'niente improvvisazione; affermazioni con fonte; una proposta forte; critica il sistema non le persone'
related:
  - ddd/conway-and-team-topologies
  - process/spec-driven-ears-not-user-stories
order: 7
updated: 2026-06-10
---

Una "best practice" senza attribuzione è solo un'opinione travestita. Senza una fonte non
puoi giudicare quanto sia vecchia l'affermazione, da quale contesto provenga o se si
applichi alla situazione che hai davanti. La ricerca dietro una decisione di progettazione
fa parte della decisione. Registra cosa si sapeva quando la scelta è stata fatta, dove
guardare quando le circostanze cambiano e quali prove la renderebbero invalida.

Questa knowledge base segue la regola che documenta. Ogni articolo porta un blocco
`sources` con nome del progetto, data e nota. Quel blocco è provenienza, non decorazione.

## Perché conta

Un lavoro di presentazione su DDD (2026-05-27) ha fissato un vincolo editoriale netto: ogni
affermazione sostanziale deve poggiare su una fonte canonica. A motivarlo sono stati tre
modi di fallire.

**"Best practice" improvvisata.** Prendi un'affermazione come "gli aggregati DDD dovrebbero
essere piccoli" senza citazione. Potrebbe indicare la preferenza dell'autore, una risposta
su Stack Overflow del 2014 che ha frainteso Vernon, un pattern che regge nei sistemi
event-sourced ma non in quelli CRUD, oppure l'indicazione vera e propria di Vaughn Vernon
in _Implementing Domain-Driven Design_ (2013). Stesso testo, applicabilità del tutto
diversa. Una citazione ti dice quale dei quattro stai leggendo.

**Menu di alternative.** Presentare tre opzioni e chiedere al lettore di scegliere è comodo
per chi scrive e inutile per chi legge, perché trasferisce il lavoro decisionale senza
trasferire la ricerca. Una proposta forte (una sola opzione, con il ragionamento) batte una
rassegna. Il lettore può comunque rifiutarla e chiedere alternative, che è una
conversazione diversa da "ecco tre opzioni, decidi tu".

**Dare la colpa alle persone.** Una critica che nomina una persona ("lo sviluppatore
precedente ha fatto una scelta sbagliata") non ti dà nulla su cui agire e mette tutti sulla
difensiva. Nomina invece il sistema o il processo ("l'assenza di un gate sulle spec ha
lasciato accumulare lo scope creep") e hai la causa radice e un punto dove applicare la
correzione.

## Come applicarlo

### Cita una fonte per ogni affermazione sostanziale

Un'affermazione sostanziale è qualsiasi asserzione che:
- Descrive il modo corretto di fare qualcosa (design pattern, passo di processo, scelta di
  tooling).
- Descrive il modo in cui fallisce un approccio alternativo.
- Cita un numero, un benchmark o una scadenza.

Per ciascuna di queste affermazioni, individua la fonte prima di scrivere l'affermazione. La
fonte può essere:

- Un libro, un capitolo e un autore precisi. ("Vaughn Vernon, _Implementing Domain-Driven
  Design_, 2013, capitolo 10: aggregati.")
- Una specifica o un RFC. ("Sintassi EARS: Mavin et al., IEEE RE 2009.")
- Un decision record di progetto. ("Decision record del Grand Refactoring, 2026-03-24: zero
  cast `as`.")
- Una pagina di documentazione ufficiale con un URL.

Se non riesci a individuare una fonte, riclassifica l'affermazione come opinione e
presentala come tale, oppure eliminala.

### Proponi una sola opzione

Quando serve una decisione:

1. Individua le opzioni davvero praticabili dati i vincoli.
2. Valutale rispetto ai vincoli.
3. Scegline una. Annota il perché.
4. Proponi quell'unica opzione con il ragionamento.

```markdown
<!-- ❌ Menu without a recommendation -->
For state management you could use:
- Signals (reactive, Angular-idiomatic)
- Services with BehaviorSubject (imperative, familiar)
- NgRx (predictable, heavy)

Which do you prefer?

<!-- ✅ One strong proposal with reasoning -->
Use Signals. Angular 17+ makes them the idiomatic reactive primitive;
they compose with `computed` and `effect`, avoid the subscription management
overhead of BehaviorSubject, and align with the angular-style rules already
in this codebase (signals-resource-compute). Source: Angular Signals RFC, 2023;
this repo's angular/signals-resource-compute article.
```

Il lettore può non essere d'accordo e chiedere alternative, e va bene. Il default resta una
singola raccomandazione forte invece di un buffet.

### Critica i sistemi, non le persone

Quando una decisione era sbagliata o un codebase ha un problema:

```markdown
<!-- ❌ Person-focused critique -->
The previous developer used `as` everywhere and clearly did not understand TypeScript.

<!-- ✅ System-focused critique -->
The codebase accumulated 148 `as` casts over time. This is consistent with a
development process that lacked a lint rule enforcement gate — the no-cast discipline
was a stated preference but not mechanically enforced, so it eroded under time
pressure. The Grand Refactoring added the Biome rule and zero-tolerance CI gate to
fix the process gap.
```

La critica al sistema dice cosa mancava (il gate di lint), perché contava (la preferenza
dichiarata si è erosa senza di esso) e come è stata risolta (il gate in CI). Ci puoi agire
sopra e nessuno deve difendersi.

### Il blocco di provenienza in questa knowledge base

Ogni articolo di questa knowledge base porta un blocco `sources`. Il formato:

```yaml
sources:
  - project: 'Project name / sub-area'
    date: YYYY-MM-DD
    note: 'What specifically this source contributes to the article.'
```

La data è quella della decisione di progetto o del documento, non quella in cui l'articolo è
stato scritto. Scrivi la nota in modo abbastanza specifico perché un lettore capisca quali
prove fornisce la fonte senza doverla andare a leggere.

Quando una decisione più recente ne sostituisce una più vecchia, entrambe compaiono nel
blocco sources con le loro date, e il corpo dell'articolo dice esplicitamente quale
sostituisce quale e perché.

## Anti-pattern

**"Nella mia esperienza…" senza un riferimento a un progetto.** L'esperienza personale è una
prova, ma è una prova debole senza dettagli. "Nella mia esperienza gli aggregati dovrebbero
essere piccoli" è più debole di "Su un pannello di amministrazione legacy (2026-03-24), gli
aggregati che attraversavano due bounded context hanno prodotto un accoppiamento che ha
richiesto tre sprint per essere sciolto; il Grand Refactoring ha risolto allineando i
confini degli aggregati a quelli dei BC."

**Citare una fonte secondaria quando quella primaria è disponibile.** Un post di blog che
riassume Vernon non è la stessa cosa di Vernon. Punta alla fonte primaria. Se è un libro,
cita il libro.

**Un elenco di opzioni senza alcuna scelta.** Vedi sopra. Un elenco senza una
raccomandazione trasferisce l'indecisione invece di risolverla.

**Trovare la fonte a posteriori.** Scrivere prima l'affermazione e poi trovare una fonte che
la sostiene vagamente. La fonte dovrebbe essere l'origine dell'affermazione, non una
giustificazione trovata dopo i fatti.

## Applicazione

Non esiste una regola di lint automatica per la qualità delle citazioni. L'applicazione è
editoriale: ogni articolo di questa knowledge base viene rivisto rispetto allo standard
prima di essere mergiato. Un articolo con affermazioni senza attribuzione è incompleto.

Negli output di ricerca, nei documenti di progettazione e negli architecture decision record
vale lo stesso standard. Un documento di progettazione che dice "dovremmo usare l'outbox
pattern perché è una best practice" è incompleto. Un documento di progettazione che dice
"dovremmo usare il transactional outbox pattern (Kleppmann, _Designing Data-Intensive
Applications_, 2017, capitolo 11; vedi backend-events/transactional-outbox-idempotent-consumer)
perché l'alternativa — le doppie scritture — è esposta al fallimento parziale nella modalità
di partizione di rete descritta in REQ-4" è completo.

## Vedi anche

Lo standard di citazione si applica nel modo più evidente nella ricerca DDD e nelle
decisioni architetturali, dove il campo ha una ricca letteratura primaria e la tentazione di
sostituire le opinioni di internet alle fonti canoniche è alta. L'articolo
[conway-and-team-topologies](/kb/ddd/conway-and-team-topologies) dimostra lo standard: ogni
affermazione è ancorata a una fonte specifica.
