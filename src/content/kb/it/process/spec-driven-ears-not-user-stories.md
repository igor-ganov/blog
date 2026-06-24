---
title: 'Sviluppo guidato dalla specifica — criteri EARS, non user story'
category: process
summary: 'Scrivi prima la specifica; i requisiti sono un breve README umano più criteri EARS raggruppati per capacità, non prosa in forma di user story.'
principle: 'Scrivi prima la specifica (requirements/design/tasks); i requisiti sono un breve README umano più criteri EARS raggruppati per capacità — non user story tipo "Come sviluppatore, voglio…" per un progetto individuale.'
severity: strong
tags: [process, spec-driven, requirements, EARS, documentation]
sources:
  - project: 'uno standard ingegneristico'
    date: 2026-06-02
    note: 'requirements/design/tasks; EARS; la specifica è la fonte di verità'
  - project: 'un servizio di event sourcing'
    date: 2026-05-14
    note: 'niente user story per un progetto individuale; EARS + README umano; 4-8 elementi per gruppo'
related:
  - process/traceability-and-phase-reviews
  - process/incremental-epics-stay-green
order: 1
updated: 2026-06-10
---

Le user story esistono per dare a un team interfunzionale un vocabolario condiviso tra
ruoli diversi. In un progetto individuale il ruolo è uno solo. Scrivere "Come
sviluppatore, voglio che la coda di consegna riprovi in caso di errore così i messaggi
non vanno persi" non aggiunge nulla rispetto alla prosa normale, e avvolge un fatto
semplice in una struttura di frase pensata per una conversazione che non sta avvenendo.
Il feedback dal servizio di event sourcing (2026-05-14) diceva proprio questo: togli le
user story, scrivi un normale README umano. I criteri EARS coprono la parte funzionale.

## Perché conta

Il flusso guidato dalla specifica (formalizzato nello standard ingegneristico,
2026-06-02) mette in sequenza tre artefatti in ordine rigoroso: **requirements.md →
design.md → tasks.md**. Ogni artefatto fa da cancello al successivo. La specifica è la
fonte di verità e il codice ne deriva, quindi quando implementazione e specifica non
concordano, è la specifica che interroghi per prima.

Ecco il fallimento che lo ha motivato. Il lavoro passava dritto da un ticket vago al
codice, scoprendo i requisiti a metà implementazione e codificandoli come decisioni
implicite nella codebase. Quelle decisioni erano invisibili alla review e a chiunque
dovesse mantenere la cosa in seguito. Riportarle in una specifica scritta dopo il fatto
è costato più di quanto sarebbe costato scrivere la specifica all'inizio.

Il formato user story era un secondo problema, separato. Su un progetto privato a una
sola persona la prosa per persona è sovraccarico aziendale e non porta nulla. È
sopravvissuta abbastanza a lungo da meritarsi un rifiuto esplicito nel registro delle
decisioni del progetto: i requisiti funzionali scritti come user story sono più difficili
da leggere come specifica, più difficili da mappare sui test e più difficili da
raggruppare per capacità.

## Come applicarlo

### Fase 1: requirements.md

Un file `requirements.md` ha esattamente tre parti:

**1. Panoramica breve** — un paragrafo su cos'è la feature, perché esiste e cosa
deliberatamente non fa. È la parte "README umano": prosa diretta, non finzione per
persona.

**2. Decisioni bloccate** — un elenco puntato di vincoli non aperti al dibattito durante
l'implementazione: scelte tecnologiche, contratti di integrazione, proprietà dei dati,
limiti non funzionali. Bloccarli qui evita che lo scope si allarghi durante il design.

**3. Requisiti funzionali raggruppati per capacità** — criteri EARS, numerati, raggruppati
sotto intestazioni che danno il nome alla capacità.

La sintassi EARS copre i casi comuni in modo pulito:

```
WHEN <trigger> THE SYSTEM SHALL <response>
WHILE <ongoing state> THE SYSTEM SHALL <response>
IF <precondition> THEN THE SYSTEM SHALL <response>
WHERE <feature is enabled> THE SYSTEM SHALL <response>
THE SYSTEM SHALL <unconditional requirement>
```

Un gruppo di capacità raccoglie 4–8 criteri. Se ne hai più di 8, dividi il gruppo. Un
gruppo gonfio di solito vuol dire che si stanno mescolando due capacità.

**Esempio — Consegna affidabile lato produttore:**

```markdown
## Producer-side reliable delivery

REQ-1: WHEN a producer publishes a message THE SYSTEM SHALL persist it to the
       outbox table within the same database transaction as the domain write.

REQ-2: WHEN the outbox relay reads a pending message THE SYSTEM SHALL attempt
       delivery and mark the message delivered on a 2xx response.

REQ-3: WHILE a message remains undelivered THE SYSTEM SHALL retry with
       exponential back-off capped at 5 minutes.

REQ-4: WHEN a message has failed delivery 10 times THE SYSTEM SHALL move it
       to the dead-letter table and emit a metric.

REQ-5: IF the outbox relay crashes mid-delivery THE SYSTEM SHALL detect the
       duplicate on restart via the idempotency key and skip re-delivery.
```

Ogni criterio è:
- Non ambiguo. "Mark delivered on 2xx" ti dà una condizione che puoi testare direttamente.
- Testabile in modo indipendente. Ognuno mappa su uno o pochi test.
- Non una soluzione. REQ-1 dice "persist to outbox table" perché quella è una decisione
  bloccata. Senza la decisione bloccata direbbe "persist durably" e lascerebbe il
  meccanismo al design.

### Fase 2: design.md

Il design risolve il come. Mappa ogni REQ-N su un componente, una struttura dati o una
decisione di protocollo, e registra i compromessi ovunque siano state valutate
alternative. Ogni sezione fa riferimento ai requisiti che soddisfa. Vedi
[traceability-and-phase-reviews](/principles/process/traceability-and-phase-reviews).

### Fase 3: tasks.md

I task scompongono il design in passi di implementazione. Ogni task fa riferimento alla
sezione di design e agli elementi REQ-N che realizza. I task sono l'input del ciclo di
sviluppo — vedi [il ciclo dal ticket alla PR](/principles/process/dev-cycle-branch-commit-pr).

### Quando le user story sono appropriate

Il formato user story non è vietato ovunque. Usalo quando il lavoro è interfunzionale o
rivolto all'interfaccia e il team ha davvero bisogno di ragionare dalla prospettiva
dell'utente: flussi di onboarding, schermate multi-persona, lavoro sull'accessibilità.
Lì "Come utente di screen reader…" porta informazione reale. Per una pipeline di backend,
una CLI o un servizio di un progetto individuale, salta l'involucro per persona.

## Anti-pattern

```markdown
<!-- ❌ User-story format on a solo backend project — adds no information,
        obscures the actual requirement, maps poorly to tests. -->
As a developer, I want the system to retry failed deliveries
so that messages are not lost.

<!-- ✅ EARS criterion — unambiguous, testable, groupable by capability. -->
WHILE a message remains undelivered THE SYSTEM SHALL retry with
exponential back-off capped at 5 minutes.
```

```markdown
<!-- ❌ Requirement that is really a solution — locks implementation
        in the wrong document. -->
REQ-3: WHEN a message fails THE SYSTEM SHALL use a Redis sorted set
       keyed by next-attempt timestamp to schedule retries.

<!-- ✅ Requirement states what, design states how. -->
REQ-3: WHILE a message remains undelivered THE SYSTEM SHALL retry with
       exponential back-off capped at 5 minutes.
<!-- In design.md: "Implemented via Redis sorted set keyed by
     next-attempt timestamp; rationale: …" -->
```

```markdown
<!-- ❌ Capability group with 12 items — two capabilities are mixed. -->
## Delivery

REQ-1 … REQ-12
```

Più di 8 elementi EARS sotto un'unica intestazione di solito vuol dire che l'intestazione
copre due capacità distinte. Dividi in "Producer-side reliable delivery" e "Consumer-side
idempotent processing" e rinumera.

## Applicazione

La specifica fa da cancello al codice. Nessun controllo di CI ti impedisce di scrivere
codice prima di una specifica, ma il ciclo di sviluppo inizia con "recupera la specifica",
non con "apri il codice". Il controllo in review è semplice: se una PR fa riferimento a
una feature senza una voce in `requirements.md` per essa, la PR è incompleta a
prescindere dalla copertura dei test.

La voce del servizio di event sourcing (2026-05-14) è il registro permanente del perché
il formato user story è stato rifiutato. Quando un futuro template o un default di un'IA
prova a reintrodurre le user story, rimanda a quella voce e a questo articolo.

## Vedi anche

EARS è stato descritto per la prima volta da Alistair Mavin et al. in "EARS (Easy Approach
to Requirements Syntax)" (2009 IEEE International Requirements Engineering Conference). La
sintassi qui segue direttamente quella specifica.
