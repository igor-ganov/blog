---
title: 'Una feature CRUD non è un bounded context'
category: ddd
summary: 'Gruppi di entità e schermate CRUD sono punti di partenza necessari, ma non diventano bounded context finché non esistono un Ubiquitous Language formalizzato e contratti espliciti tra contesti.'
principle: 'Gruppi di entità e feature CRUD non sono bounded context finché non hanno un Ubiquitous Language formalizzato e contratti espliciti tra loro; consolida molte feature CRUD in pochi bounded context e tratta le app client/di lettura come proiezioni.'
severity: context
tags: [ddd, bounded-context, strategic-design, ubiquitous-language]
sources:
  - project: 'un''azienda multiprodotto (caso di studio DDD)'
    date: 2026-05-27
    note: '27 feature CRUD contro 4 macro-aree; nessuna delle due segue i confini dei BC; consolidare in 5-7 BC, il client come proiezione'
related:
  - ddd/ubiquitous-language-first
  - ddd/conway-and-team-topologies
  - ddd/strategic-ddd-core-supporting-generic
order: 1
updated: 2026-06-11
---

## Perché conta

**Quando ripaga lo sforzo.** Il Domain-Driven Design è una risposta alla scala e alla complessità, non una postura di default. Disegnare bounded context e context map conviene su un sistema grande, con logica di dominio davvero complessa e più di un team. Su un progetto piccolo o semplice lo stesso apparato è solo zavorra: confini e contratti che costano più di quanto rendono, dove una banale suddivisione CRUD-per-entità avrebbe consegnato la feature. Organizzare il codice per feature e separarne i layer, invece, non dipende dalla dimensione. Questo è lo stile di casa a ogni scala (vedi [folder-by-usage](/kb/functional-architecture/one-function-per-file-folder-by-usage)). Tutto ciò che segue presuppone un dominio abbastanza grande da giustificare l'apparato.

Eric Evans definisce un Bounded Context come "a defined part of software where particular terms, definitions and rules apply in a consistent way" (Evans, DDD Europe 2019). Il confine non si traccia attorno a una tabella del database o a una schermata di amministrazione. Si traccia attorno a un vocabolario coerente e a un insieme di regole di business che hanno senso solo come unità. Martin Fowler ribadisce lo stesso punto: "Total unification of the domain model for a large system will not be feasible or cost-effective" (Fowler, https://martinfowler.com/bliki/BoundedContext.html). Quindi spezzare un sistema in pezzi arbitrariamente piccoli, una feature per entità, crea tanti problemi quanti ne crea il big-ball-of-mud all'estremo opposto.

Un'azienda multiprodotto (audit del 2026-05-27) ha commesso l'errore opposto. Il suo pannello di amministrazione conteneva 27 feature in stile CRUD, organizzate più o meno come una entità uguale una feature: Users, Roles, Products, Subscriptions, Invoices, Webhooks e così via. L'applicazione rivolta agli utenti, la dashboard, aggregava poi gli stessi concetti in quattro macro-aree. Nessuna delle due decomposizioni seguiva i confini dei bounded context. Non c'era un Ubiquitous Language formalizzato per area, nessun contratto pubblicato tra le aree, nessuna ownership esplicita. Il risultato è stato un triplo disallineamento: 12 prodotti commerciali non corrispondevano a 8 servizi tecnici, che non corrispondevano a 5 piattaforme Jira, gestite da 2 team. Ogni iniziativa che attraversava più di una feature CRUD richiedeva coordinamento implicito su tutti e tre i layer disallineati in una volta sola.

Vaughn Vernon dà un nome all'errore di fondo: "Subdomains live in the problem space, bounded contexts in the solution space" (Vernon, Implementing DDD, 2013, ISBN 978-0321834577; vedi anche Evans, DDD Europe 2019, https://www.infoq.com/news/2019/06/bounded-context-eric-evans/). Una feature CRUD è un artefatto dello spazio della soluzione: una schermata, un repository o una tabella. Finché non hai risposto a "che lingua parla quest'area, e qual è il contratto che espone alle altre?", hai un candidato a contesto, non un contesto.

Il costo di scambiare le feature CRUD per bounded context è concreto:

- I modelli condivisi assorbono in silenzio significati da più aree. Il concetto `User` in un contesto di Access Management significa "un principal con ruoli e permessi". In un contesto di Billing, la stessa parola significa "un pagatore con un metodo di pagamento e uno storico di fatture". Quando entrambi i significati vivono in un unico modello senza un confine, ogni modifica a un significato degrada l'altro.
- Le modifiche che attraversano più feature obbligano a toccare molti file in una volta, perché nessuna area possiede la propria lingua. Gli sviluppatori aggirano il problema con flag booleani, colonne di stato discriminate e convenzioni affidate ai commenti, ognuna delle quali segnala un confine mancante.
- Le applicazioni di lettura (dashboard, app mobile) importano direttamente il modello di scrittura. Quando la forma di lettura cambia per ragioni di business, cambia anche il modello di scrittura, accoppiando concern che non hanno nulla a che vedere tra loro.

## Come applicarlo

**Passo 1 — Audita i cluster candidati, non le singole entità.**

Elenca ogni concetto gestito dal tuo sistema. Raggruppali con questa domanda: "un esperto di dominio userebbe una parola diversa per questo concetto parlando dell'[area A] rispetto all'[area B]?". Ogni cluster in cui la risposta è "sì" segna il confine di un bounded context candidato. Il Bounded Context Canvas di DDD Crew (https://github.com/ddd-crew/bounded-context-canvas) offre una scheda di lavoro strutturata: nome, scopo, classificazione strategica, dipendenze in entrata/uscita e il glossario dell'Ubiquitous Language.

Nel caso di studio, le 27 feature CRUD si sono compattate in circa cinque-sette bounded context candidati sotto questa lente:

```
Candidate BC           Entities included (from the 27-feature list)
─────────────────────  ──────────────────────────────────────────────
Identity & Access      User, Role, Permission, Session, ApiKey
Product Catalogue      Product, ProductVariant, Feature, FeatureFlag
Subscription & Billing Subscription, Plan, Invoice, PaymentMethod, Coupon
Tenant Onboarding      Tenant, TenantSettings, OnboardingStep, Contract
Anomaly Detection      AnomalyRule, AnomalyEvent, Alert, Threshold, Detector
```

Cinque contesti invece di 27 feature. Ogni cluster porta un nome che un esperto di dominio userebbe, non quello a cui ricorrerebbe un amministratore di database.

**Passo 2 — Formalizza l'Ubiquitous Language prima di scrivere codice.**

Per ogni contesto candidato, produci un glossario: termine, definizione, ciò che NON è (disambiguazione degli omonimi) ed esempio d'uso in una frase che un esperto di dominio direbbe davvero. Finché questo glossario non esiste e non è stato rivisto da almeno un esperto di dominio, il confine resta provvisorio. Vedi `/kb/ddd/ubiquitous-language-first` per il processo completo.

**Passo 3 — Definisci esplicitamente i contratti tra contesti.**

Ogni dipendenza tra due contesti deve passare attraverso un'interfaccia pubblicata. I pattern di Context Mapping del DDD (Evans, DDD Reference, https://www.domainlanguage.com/ddd/reference/) forniscono il vocabolario: Customer/Supplier, Conformist, Anti-Corruption Layer (ACL), Open Host Service (OHS), Published Language. Come minimo, documenta: quale contesto è a monte, quale a valle, quale traduzione (se c'è) avviene al confine e chi è responsabile delle breaking change.

Nel caso di studio, la dashboard agiva da consumatore diretto di più modelli di scrittura a monte, senza alcun layer di traduzione. Tratta invece la dashboard come un modello di lettura: una proiezione (o Backend for Frontend, BFF) che si iscrive agli eventi di dominio dei contesti a monte e materializza una forma ottimizzata per la lettura. La dashboard non ha responsabilità di scrittura. Invia comandi al contesto proprietario tramite un OHS.

```
Write side                    Read side
─────────────────────────     ──────────────────────────────
Subscription BC ──events──►  Dashboard BFF (projection)
Anomaly Detection BC ─────►  (aggregates events, builds
Tenant Onboarding BC ──────►   read model for UI queries)
```

Questa separazione non è cosmetica. Quando la forma di lettura deve cambiare per una nuova feature di UI, ricostruisci la proiezione e il modello di scrittura resta intatto. Quando cambia una regola lato scrittura, emetti una nuova versione dell'evento e la proiezione si adatta tramite il suo ACL. Nessuno dei due lati impone un cambiamento all'altro.

**Passo 4 — Applica l'Inverse Conway Maneuver.**

Una volta disegnata la context map logica, allinea l'ownership dei team a essa. Un team possiede uno o più bounded context; nessun contesto è condiviso tra team senza un'interfaccia formale. Vedi `/kb/ddd/conway-and-team-topologies` per la trattazione completa.

## Anti-pattern

**Anti-pattern 1: una classe repository per entità = un bounded context.**

Sintomo: hai 27 servizi/repository e 27 "moduli" o "feature" corrispondenti, ognuno con il nome di una tabella del database. Nessun modulo ha un glossario. Cambiare il significato di `status` sulla tabella `Subscription` ti costringe a cercare i riferimenti in ogni altro modulo.

L'entità non è il contesto. Un Aggregate Root (Evans, DDD Reference) è il confine di consistenza per un cluster di oggetti. Sta dentro un bounded context, è più piccolo di uno, mai sinonimo di esso.

**Anti-pattern 2: la dashboard importa direttamente il modello di dominio.**

Sintomo: l'app rivolta agli utenti importa tipi, DTO o perfino repository dal servizio lato scrittura. Una modifica al modello lato scrittura rompe la compilazione della UI.

Questo fonde due concern distinti, l'elaborazione dei comandi e il servizio delle query, in un unico modello. I modelli di lettura dovrebbero essere proiezioni costruite ad hoc, come descritto sopra.

**Anti-pattern 3: shared kernel di default.**

Sintomo: un package `common` o `shared` contiene tipi di dominio importati da ogni altro modulo. Il package cresce senza ownership e diventa un punto di accoppiamento nascosto. Qualsiasi modifica a un tipo condiviso richiede un audit su tutto il sistema.

Il pattern Shared Kernel (Evans, DDD Reference) è legittimo ma circoscritto: è "a subset of the domain model that two teams agree to share", con co-ownership esplicita e un processo formale di modifica. Non è una discarica per tutto ciò che capita di usare in due punti.

**Anti-pattern 4: dare ai contesti i nomi dei layer infrastrutturali.**

Sintomo: bounded context chiamati `api`, `database`, `frontend`, `backend`. Sono concern di deployment, non di dominio. Un contesto chiamato `api` non ha Ubiquitous Language perché "api" non corrisponde ad alcun concetto di business.

I nomi dei contesti vanno presi dal vocabolario del dominio: Billing, Fulfillment, Identity, Catalogue, Anomaly Detection.

## Vedi anche

Il riferimento di Context Mapping del DDD Crew (https://github.com/ddd-crew/context-mapping) offre un set di carte stampabili per tutti e nove i pattern di Context Map. Usalo nei workshop per rendere visibili le dipendenze tra contesti prima che finiscano nel codice.

L'EventStorming (Alberto Brandolini; glossario DDD Crew https://github.com/ddd-crew/eventstorming-glossary-cheat-sheet) è la tecnica di scoperta consigliata per individuare i confini dei contesti a partire dagli eventi di dominio anziché dai modelli dati esistenti. Fa emergere i confini di linguaggio che l'analisi centrata sulle entità si lascia sfuggire.
