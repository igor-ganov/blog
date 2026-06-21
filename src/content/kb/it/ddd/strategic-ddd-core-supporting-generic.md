---
title: 'Investi dove ti distingui: Core, Supporting, Generic'
category: ddd
summary: 'Non ogni parte del dominio merita ingegneria su misura; classifica i sottodomini come Core, Supporting o Generic e concentra lo sforzo scarso sul Core.'
principle: 'Classifica i sottodomini come Core / Supporting / Generic e concentra l''ingegneria scarsa sul Core; il Generic si compra o si adotta.'
severity: context
tags: [ddd, strategic-design, core-domain, subdomain, investment]
sources:
  - project: 'Core Domain Charts di Evans / DDD Crew'
    date: 2026-05-27
    note: 'Core/Supporting/Generic; differenziazione×complessità; concentrarsi sul Core'
related:
  - ddd/bounded-contexts-not-crud-features
  - ddd/conway-and-team-topologies
order: 3
updated: 2026-06-11
---

## Perché conta

**Quando ripaga lo sforzo.** Classificare i sottodomini è uno strumento per allocare gli investimenti. Rende solo quando hai abbastanza dominio da allocare e abbastanza scarsità da rendere l'allocazione una decisione vera. Su un sistema grande, con logica intricata e priorità in concorrenza, la divisione Core/Supporting/Generic ti dice dove mettere le persone migliori. Su un progetto piccolo o semplice l'intero dominio ti sta in testa e l'esercizio è solo cerimonia. Applicalo quando il dominio è abbastanza grande che "dove *non* investiamo" diventa una domanda a cui qualcuno deve davvero rispondere. Qualunque sia la dimensione, struttura per feature e separa i livelli (vedi [folder-by-usage](/kb/functional-architecture/one-function-per-file-folder-by-usage)).

Evans ha introdotto la classificazione dei sottodomini come strumento principale per le decisioni di investimento ingegneristico (Evans, Domain-Driven Design, 2003, Addison-Wesley, ISBN 978-0321125217; DDD Reference, https://www.domainlanguage.com/ddd/reference/). La classificazione ha tre livelli:

- **Core Domain**: la parte del dominio in cui la tua organizzazione ha un vantaggio competitivo unico. Nessun prodotto pronto all'uso risolve questo problema in un modo che ti differenzi. Qui vanno i tuoi ingegneri più bravi, e il modello merita la progettazione più curata.
- **Supporting Subdomain**: necessario perché il Core funzioni, ma non differenziante di per sé. Spesso devi costruirlo, ma non deve raggiungere lo standard di qualità che imponi al Core.
- **Generic Subdomain**: problemi già risolti, che il settore ha gestito bene. Autenticazione, invio email, elaborazione dei pagamenti, infrastruttura di osservabilità. Compralo, adotta open source, oppure usa un fornitore SaaS. Costruirli in casa è spreco.

La classificazione non è permanente. Un concetto Generic oggi può diventare Core se l'azienda decide di differenziarsi su di esso, e un concetto Core può diventare commodity man mano che il mercato recupera terreno. I Core Domain Charts di DDD Crew (https://github.com/ddd-crew/core-domain-charts) danno un framework a due assi per questa decisione: **Differenziazione di business** (quanto vantaggio competitivo offre quest'area?) sull'asse verticale contro la **Complessità** (quanto è difficile da costruire o gestire?) sull'asse orizzontale. I quattro quadranti producono quattro strategie di investimento:

```
                    High Differentiation
                           |
          Invest heavily   |   Invest heavily
          (complex Core)   |   (simple Core —
                           |    protect this)
   Low ────────────────────┼──────────────── High
 Complexity                |                Complexity
          Buy or adopt     |   Partner or
          (Generic)        |   adopt carefully
                           |   (complex Generic)
                    Low Differentiation
```

Conta perché la capacità ingegneristica è sempre scarsa rispetto all'ampiezza di un sistema software. Senza una classificazione esplicita, i team distribuiscono lo sforzo in proporzione alla superficie. Un modulo di autenticazione Generic riceve la stessa progettazione attenta di un motore di rilevamento anomalie Core, perché entrambi hanno lo stesso numero di file, lo stesso peso nello sprint e lo stesso overhead di revisione architetturale. Così il Core finisce sotto-investito mentre il Generic viene sovra-ingegnerizzato.

Un'azienda multi-prodotto (analizzata il 2026-05-27) aveva un piccolo team di ingegneri responsabile di molti prodotti. Le sue 27 feature CRUD consumavano uno sforzo di sviluppo grosso modo uniforme. Diverse di esse (autenticazione, gestione dei ruoli, generazione fatture, notifiche email) sono sottodomini Generic da manuale, tutti risolti da fornitori SaaS maturi come Auth0, Stripe e Sendgrid. Costruire e mantenere versioni custom di questi bruciava capacità che poteva andare alle feature che distinguono davvero l'azienda sul mercato. Anomaly Detection, il Core, produceva allerte dai dati di telemetria ed era la fonte primaria di valore competitivo, eppure portava lo stesso peso nello sprint di una schermata CRUD per la gestione dei ruoli.

## Come applicarlo

**Passo 1 — Elenca i sottodomini, non le feature.**

Un sottodominio è un'area coerente di conoscenza del dominio, non un modulo o una schermata. Produci l'elenco con gli stakeholder di business invece di derivarlo dal codice. Chiedi: "Se dovessi spiegare a un nuovo assunto cosa fa questa azienda, quali sono le cinque-dieci aree di competenza che definiscono il business?" Ogni area è un candidato sottodominio.

Per il caso studio, un primo elenco potrebbe apparire così:

```
Subdomain              Candidate classification   Reasoning
─────────────────────  ─────────────────────────  ────────────────────────────────────────
Anomaly Detection      Core                       Proprietary rule engine; product USP
Tenant Onboarding      Supporting                 Necessary; not differentiating
Subscription & Billing Supporting / Generic       Generic billing → Stripe; custom plans rules → Supporting
Identity & Access      Generic                    Auth0 or equivalent; no differentiation
Product Catalogue      Supporting                 Internal admin; no external competition
Notification Dispatch  Generic                    Sendgrid or equivalent
Reporting & Analytics  Supporting → Core          Could become Core if analytics is the USP
```

**Passo 2 — Applica gli assi Differenziazione di business × Complessità.**

Assegna un punteggio a ogni sottodominio su entrambi gli assi. Una scala a tre punti (Basso / Medio / Alto) tiene il workshop in movimento. Posiziona ciascuno sul Core Domain Chart. Il risultato è un grafico che rende le priorità di investimento leggibili anche agli stakeholder non tecnici.

Il template Core Domain Charts di DDD Crew (https://github.com/ddd-crew/core-domain-charts) è l'artefatto canonico per questo esercizio, pensato per essere prodotto in modo collaborativo in una o due ore.

**Passo 3 — Allinea la strategia di investimento alla classificazione.**

La classificazione guida quattro decisioni concrete:

1. **Core — costruiscilo con le persone migliori e i massimi standard di progettazione.** Applica l'intero arsenale tattico del DDD: aggregati ricchi, eventi di dominio, progettazione attenta degli invarianti. Privilegia l'espressività del modello sulla velocità di implementazione. Evans: "The Core Domain is the part that makes your system worth building and worth using. It is the place where all the careful Domain-Driven Design work should be concentrated" (DDD, 2003).

2. **Supporting — costruiscilo in modo pragmatico, magari con uno stile transaction-script.** Il modello non deve essere ricco quanto quello del Core. Un servizio CRUD ben strutturato, con input e output chiari, basta. Resisti all'impulso di applicare gli stessi pattern architetturali che usi sul Core, perché qui l'overhead non si giustifica.

3. **Generic — compra, adotta o usa SaaS.** Il costo di integrazione (mantenere un adapter, gestire le chiavi API, governare i confini degli SLA) è quasi sempre inferiore al costo continuo di costruire e gestire il proprio. Documenta il confine d'integrazione come Anti-Corruption Layer, così che il modello del fornitore esterno non contamini il tuo modello di dominio a valle.

4. **Rivaluta periodicamente.** Riclassifica man mano che la strategia di business evolve. Un sottodominio che era Generic perché esisteva un prodotto pronto all'uso può diventare Supporting o Core se il prodotto non va più bene o se l'azienda decide di differenziarsi su di esso. Registra data e motivazione di ogni riclassificazione.

**Passo 4 — Proteggi il Core dalle preoccupazioni generiche.**

Una modalità di fallimento ricorrente è il codice del Core domain che accumula preoccupazioni infrastrutturali: chiamate di logging, logica di retry, annotazioni dell'ORM, chiamate al client HTTP. Quell'accoppiamento rende il Core più difficile da testare e da far evolvere. Il Core deve contenere solo logica di dominio espressa nel Ubiquitous Language, con l'infrastruttura spinta ai bordi tramite porte (interfacce) e adapter (implementazioni). Il pattern Hexagonal Architecture (Ports and Adapters) impone strutturalmente questa separazione.

## Anti-pattern

**Anti-pattern 1: Trattare ogni sottodominio come Core.**

Sintomo: Ogni modulo ha aggregati ricchi, eventi di dominio, un ACL, un linguaggio pubblicato e un team dedicato. Il modulo di autenticazione ha la stessa sofisticazione architetturale del motore di rilevamento anomalie. La velocity crolla perché ogni modifica si trascina dietro l'intera cerimonia, a prescindere dall'impatto di business.

La sofisticazione ha un costo. Quel costo si giustifica nel Core ed è sprecato nei sottodomini Generic e Supporting.

**Anti-pattern 2: Costruire da zero i sottodomini Generic.**

Sintomo: Il team passa tre sprint su un sistema di controllo degli accessi basato sui ruoli perché "i nostri requisiti sono unici". Sei mesi dopo ha falle di sicurezza sottili, nessuno strumento di audit e un manutentore dedicato che lo tiene in vita.

Autenticazione, autorizzazione, elaborazione dei pagamenti, invio email e infrastruttura di osservabilità sono Generic in qualsiasi classificazione ragionevole. A meno che tu non sia un'azienda di sicurezza, un fornitore IAM o un processore di pagamenti, costruire questi in casa consuma capacità del Core senza produrre alcuna differenziazione.

**Anti-pattern 3: Lasciare che il Generic si infiltri nel modello del Core.**

Sintomo: l'Aggregate del Core contiene un campo `stripeCustomerId`. Gli eventi di dominio trasportano `sendgridMessageId`. Il modello del Core ora codifica identificatori di fornitori esterni, accoppiando la parte più preziosa del sistema alle scelte dei vendor.

Il pattern Anti-Corruption Layer (Evans, DDD Reference) esiste proprio per evitare questo. Il Core parla la propria lingua, l'adapter traduce al confine, e il Core non importa mai tipi dall'SDK del fornitore.

**Anti-pattern 4: Classificare in base alla sola complessità tecnica.**

Sintomo: un team classifica come Core il suo modulo tecnicamente più complesso perché è "difficile da costruire". La complessità tecnica è un asse, non l'unico. Un pezzo di infrastruttura molto complesso ma indifferenziato (un message broker custom, un ORM su misura) è Generic indipendentemente dalla sua profondità tecnica. L'asse che decide è la differenziazione di business.

## Vedi anche

Il repository Core Domain Charts di DDD Crew (https://github.com/ddd-crew/core-domain-charts) include template stampabili ed esempi svolti per il workshop Differenziazione di business × Complessità.

La DDD Reference (Evans, CC-BY 4.0, https://www.domainlanguage.com/ddd/reference/) tratta Core Domain, Subdomains e Generic Subdomains nella sezione Strategic Design, ed è il riferimento breve autorevole per la classificazione.
