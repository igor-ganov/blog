---
title: "La legge di Conway e la manovra di Conway inversa"
category: ddd
summary: "L'architettura rispecchia la struttura di comunicazione dell'organizzazione; per ottenere l'architettura che vuoi, prima rimodella i team perché le corrispondano."
principle: "L'architettura rispecchia la struttura di comunicazione dell'organizzazione (Conway 1968); per ottenere l'architettura che vuoi, ristruttura i team perché le corrispondano (Conway inversa), allineando i team stream-aligned ai flussi di business con team platform ed enabling a supporto."
severity: context
tags: [ddd, conway, team-topologies, organizational-design, inverse-conway]
sources:
  - project: 'Conway 1968 / Team Topologies'
    date: 2026-05-27
    note: 'Conway alla lettera; Conway inversa; 4 tipi di team, 3 modalità di interazione; allineare i team agli stream'
  - project: 'un''azienda multi-prodotto (caso di studio DDD)'
    date: 2026-05-27
    note: 'le piattaforme allineate alla tecnologia fanno esplodere il carico cognitivo'
related:
  - ddd/bounded-contexts-not-crud-features
  - process/cite-sources-no-improvisation
order: 4
updated: 2026-06-11
---

## Perché conta

**Quando ripaga lo sforzo.** È una questione che riguarda più team. La legge di Conway opera a qualsiasi scala, ma *mappare deliberatamente i team sui bounded context* tramite la manovra di Conway inversa diventa uno strumento solo quando hai diversi team e context da allineare. In un singolo team piccolo non c'è nulla da allineare: un team, una struttura di comunicazione. Tirala fuori quando l'organizzazione è abbastanza grande da far divergere i confini dei team da quelli dei context. Ciò che resta costante a prescindere dalla scala è la struttura per feature e la separazione dei layer (vedi [folder-by-usage](/kb/functional-architecture/one-function-per-file-folder-by-usage)).

Nel 1968 Melvin Conway pubblicò l'osservazione diventata poi assioma nell'architettura software: "Qualsiasi organizzazione che progetta un sistema (in senso ampio) produrrà un progetto la cui struttura è una copia della struttura di comunicazione dell'organizzazione" (Conway, "How Do Committees Invent?", Datamation, aprile 1968, https://www.melconway.com/Home/Conways_Law.html). L'affermazione descrive ciò che le organizzazioni producono inevitabilmente, non ciò che dovrebbero produrre. La conseguenza pratica, come l'ha messa Martin Fowler, è che non puoi progettare l'architettura per uscire da una struttura organizzativa: "Se l'architettura del sistema e l'architettura dell'organizzazione sono in conflitto, vince l'architettura dell'organizzazione" (Fowler, https://martinfowler.com/bliki/ConwaysLaw.html).

La manovra di Conway inversa trasforma quell'osservazione in uno strumento di progettazione. Se vuoi una determinata architettura di sistema, progetta prima la struttura dei team che la produrrebbe in modo naturale. Fowler la chiama "far evolvere la struttura dei team per favorire l'architettura desiderata" (ibid.). Non c'è alcun trucco. I canali di comunicazione determinano dove cadono le giunzioni di integrazione. I team che si parlano di continuo producono sottosistemi strettamente integrati, mentre i team che interagiscono solo tramite interfacce formali finiscono con sottosistemi debolmente accoppiati e contratti stabili. Quindi progettare la struttura dei team è già progettare l'architettura.

Il Domain-Driven Design e la manovra di Conway inversa combaciano in modo pulito. Un bounded context dovrebbe essere di proprietà di un solo team, e nessun context dovrebbe essere condiviso tra team senza un'interfaccia formale (i pattern della Context Map). Quando entrambe le condizioni valgono, la legge di Conway produce da sola l'architettura giusta, perché i confini dei team impongono la struttura di comunicazione che tiene i context separati.

Un'azienda multi-prodotto (esaminata il 2026-05-27) ha mostrato cosa succede quando la struttura organizzativa combatte l'architettura che vuoi. La piattaforma aveva:

- 12 prodotti commerciali
- 8 servizi tecnici
- 5 progetti Jira, ciascuno chiamato come un layer tecnologico o una piattaforma (`admin-panel`, `dashboard-user`, `api-gateway`, `infrastructure`, `mobile`)
- 2 team di engineering

I progetti Jira erano allineati alla tecnologia, non al dominio né allo stream. Introdurre un nuovo livello di abbonamento richiedeva ticket in `admin-panel` (per aggiungere le schermate CRUD), `api-gateway` (per aggiungere gli endpoint), `dashboard-user` (per esporre il livello ai clienti) e spesso `infrastructure` (per provisioning di nuove risorse). Ogni progetto Jira era di fatto un confine di team virtuale, quindi qualsiasi iniziativa rilevante per il business ne attraversava diversi insieme, esigendo coordinamento tra tutti e cinque i progetti pur esistendo solo due team reali. Il risultato era una coda permanente di iniziative cross-platform, ciascuna bloccata dall'iniziativa cross-platform che la precedeva. Skelton e Pais lo chiamano disallineamento dei fracture plane, e la coda ne è il sintomo in termini di carico cognitivo (Team Topologies, Skelton & Pais, 2019/2025, https://teamtopologies.com/key-concepts).

## Come applicarla

**Passo 1 — Capire i quattro tipi di team di Team Topologies.**

Skelton e Pais definiscono quattro tipi di team, ciascuno con uno scopo distinto e una relazione distinta con il carico cognitivo (Team Topologies, https://teamtopologies.com/key-concepts):

```
Team type               Purpose
──────────────────────  ────────────────────────────────────────────────────────────
Stream-aligned          Delivers value in a business flow end-to-end. Owns a
                        domain area (bounded context cluster) from input to output.
                        Has everything it needs to build, deploy, and operate its
                        stream with minimal external coordination.

Platform                Reduces cognitive load for stream-aligned teams by providing
                        self-service internal infrastructure (deployment pipelines,
                        observability, data stores, auth). Operates as a product.

Enabling                Short-lived; helps stream-aligned teams acquire capabilities
                        they do not yet have (a new framework, a new architectural
                        pattern). Exits when capability is transferred.

Complicated-Subsystem   Owns a genuinely complex technical or mathematical subsystem
                        (e.g., a physics engine, a real-time signal-processing pipeline)
                        that requires specialist knowledge beyond a stream-aligned team.
```

Stream-aligned è il default. I team Platform, Enabling e Complicated-Subsystem esistono per togliere carico cognitivo ai team stream-aligned, non per accaparrarsi la proprietà del proprio.

**Passo 2 — Capire le tre modalità di interazione.**

Ogni relazione tra team ha una modalità di interazione designata:

```
Interaction mode   Description
─────────────────  ──────────────────────────────────────────────────────────────
Collaboration      Two teams work jointly on a problem, sharing code and decisions.
                   High bandwidth; appropriate for exploration and capability
                   building. Should be time-boxed — prolonged collaboration
                   creates coupling.

X-as-a-Service     One team consumes what another team provides via a stable API
                   or interface. Low coordination overhead. The correct steady-state
                   for stream-aligned to platform relationships.

Facilitating       An enabling team helps a stream-aligned team; the enabling team
                   does not own the outcome. Exits when the stream-aligned team is
                   self-sufficient.
```

La modalità di interazione tra due team è essa stessa una decisione di progettazione. Un team stream-aligned bloccato in modalità Collaboration permanente con altri quattro team non è stream-aligned nei fatti. È diventato un hub di coordinamento, e il suo carico cognitivo lo dimostra.

**Passo 3 — Individuare i fracture plane.**

Un fracture plane è un confine naturale lungo cui puoi spezzare un sistema senza lacerare concetti di dominio coesi. Skelton e Pais elencano vari candidati: dominio di business, conformità normativa, frequenza di cambiamento dei dati, persona utente, confine geografico, ciclo di vita della tecnologia. Per la maggior parte delle organizzazioni il **dominio di business** è quello che ripaga. Spezza il sistema lungo i confini che gli esperti di dominio già riconoscono, poi allinea un team stream-aligned a ciascuna area risultante.

Nel caso di studio, i cinque progetti Jira allineati alla tecnologia andrebbero sostituiti dalla proprietà stream-aligned dei cluster di bounded context identificati nell'analisi di dominio:

```
Current (technology-aligned)       Proposed (stream-aligned)
──────────────────────────────     ──────────────────────────────────────────────
admin-panel (Jira project)         Identity & Access stream
dashboard-user (Jira project)      Subscription & Billing stream
api-gateway (Jira project)         Anomaly Detection stream (Core — most engineers)
infrastructure (Jira project)      Platform team (CI/CD, observability, auth infra)
mobile (Jira project)              (absorbed into stream teams as read-side concern)
```

Ogni team stream-aligned possiede l'intera verticale del proprio context: modello di dominio, API, database, test, deployment. L'iniziativa che prima si estendeva su cinque progetti Jira ora vive interamente nello scope di un solo team.

**Passo 4 — Applicare la manovra di Conway inversa in modo esplicito.**

Disegna prima la context map obiettivo (vedi `/kb/ddd/bounded-contexts-not-crud-features`). Poi progetta la struttura dei team che la produrrebbe:

- Ogni bounded context, o cluster di context strettamente correlati, mappa su un team stream-aligned.
- Le questioni infrastrutturali condivise (CI/CD, observability, infrastruttura di auth) mappano su un team platform che opera in modalità X-as-a-Service.
- Se un context (per esempio Anomaly Detection) ha una reale complessità algoritmica oltre la capacità del team di stream, un team Complicated-Subsystem può possedere il nucleo algoritmico mentre il team di stream possiede l'integrazione.

Annuncia la struttura dei team obiettivo prima di iniziare la migrazione tecnica. Il cambiamento organizzativo e quello tecnico devono muoversi insieme. Se fai prima la ristrutturazione tecnica (separando i repository senza separare i team) ottieni le giunzioni ma niente della struttura di comunicazione che le tiene al loro posto.

**Passo 5 — Gestire il carico cognitivo come vincolo di prima classe.**

Skelton e Pais trattano il carico cognitivo come il vincolo primario sull'efficacia di un team. Un team stream-aligned che possiede più di quanto riesca a tenere in memoria di lavoro — più context, tecnologie e punti di integrazione di quanti riesca a seguire — consegnerà software di qualità inferiore per quanto forti siano i suoi ingegneri. Il concetto di Team API (https://teamtopologies.com/key-concepts) mette per iscritto cosa un team possiede e cosa espone, il che rende quel carico visibile e negoziabile.

Sotto il vincolo dei due team del caso di studio, la mossa è il sequenziamento. Consolida prima le 27 feature CRUD nei cinque o sette bounded context, riducendo la superficie che ogni team deve tenere a mente, e solo allora prova a separare i team. Due team possono gestire un sistema più piccolo e ben delimitato. Aggiungere team a uno più grande e mal delimitato non aiuta finché non riduci il numero di confini.

## Anti-pattern

**Anti-pattern 1: team allineati alla tecnologia che producono architettura allineata alla tecnologia.**

Sintomo: i team sono chiamati come layer o piattaforme: `frontend-team`, `backend-team`, `infrastructure-team`, `mobile-team`. Ogni feature rivolta all'utente richiede un ticket in ciascun team. Le priorità si negoziano oltre i confini dei team a ogni sprint. Le release richiedono deployment sincronizzati su più team.

Questa è la legge di Conway che gira senza nessuno al volante. La struttura di comunicazione mette le giunzioni di integrazione sui confini tecnologici invece che su quelli di dominio, e ne esce un monolite distribuito: deployment distribuito sopra una logica di dominio strettamente accoppiata.

**Anti-pattern 2: trattare la manovra di Conway inversa come una riorganizzazione una tantum.**

Sintomo: la dirigenza annuncia una ristrutturazione dei team allineata ai domini di business. Tre mesi dopo i progetti Jira, le cartelle del codice e i turni di on-call rispecchiano ancora il vecchio allineamento tecnologico. I nuovi team stream-aligned si parlano tra loro quanto facevano i vecchi team tecnologici, perché gli artefatti condivisi non si sono mai spostati.

La manovra non è finita finché la struttura di comunicazione non è cambiata davvero. Significa spostare la proprietà degli artefatti (repository, runbook, turni di on-call, glossari di dominio) sui nuovi confini di team, non solo rinominare i canali Slack.

**Anti-pattern 3: modalità collaboration permanente tra team di stream.**

Sintomo: due team stream-aligned collaborano (co-progettando, co-revisionando, co-deployando) da oltre un anno. Nessuno dei due può fare release senza consultare l'altro. La collaborazione viene giustificata come "necessaria perché i domini sono correlati".

La modalità collaboration è ad alta banda e va bene per la scoperta. Ma quando due team devono collaborare in modo permanente solo per consegnare, il confine tra i loro domini è tracciato male, oppure manca un terzo team (Platform o Enabling) che dovrebbe assorbire la questione condivisa. Lo steady-state tra team stream-aligned è X-as-a-Service, dove un team pubblica un contratto e l'altro lo consuma senza overhead di coordinamento.

**Anti-pattern 4: team platform che possiede logica di dominio.**

Sintomo: il team platform possiede il modulo di autenticazione ma possiede anche le regole di autorizzazione per specifiche operazioni di business ("solo un TenantAdmin può creare una Subscription"). I cambiamenti alle regole di business richiedono un ticket al team platform.

Le regole di autorizzazione per le operazioni di dominio appartengono al context di dominio che possiede quelle operazioni, non alla piattaforma infrastrutturale. Il team platform fornisce il meccanismo: validazione JWT, gestione delle sessioni, token di ruolo. Il team stream-aligned fornisce la policy, decidendo quali ruoli possono fare cosa nel proprio dominio. Mescola i due e il team platform diventa un collo di bottiglia per ogni cambiamento di dominio.

## Vedi anche

La pagina dei concetti chiave di Team Topologies (https://teamtopologies.com/key-concepts) riassume i quattro tipi di team, le tre modalità di interazione, la Team API, il carico cognitivo e i fracture plane in una forma adatta alla lettura in workshop.

Il paper originale di Conway (https://www.melconway.com/Home/Conways_Law.html) è breve e vale la pena leggerlo per intero. Molti resoconti secondari semplificano o citano male l'affermazione, mentre il paper stesso è inequivocabile.

Il riferimento Context Mapping del DDD Crew (https://github.com/ddd-crew/context-mapping) fornisce il vocabolario per formalizzare i contratti inter-team da cui dipende la manovra di Conway inversa: una volta che i confini dei team si allineano a quelli dei context, i pattern della Context Map definiscono come appare ciascuna interfaccia tra team.
