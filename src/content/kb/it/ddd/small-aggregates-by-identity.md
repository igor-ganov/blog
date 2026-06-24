---
title: 'Aggregati piccoli, riferiti per identità, eventualmente consistenti'
category: ddd
summary: "Le quattro regole di Vernon sugli aggregati non sono linee guida: sono i vincoli portanti che mantengono un modello di dominio operativamente sicuro ed evolvibile."
principle: 'Modella gli invarianti reali dentro i confini di consistenza, mantieni gli aggregati piccoli, riferisci gli altri aggregati per identità e usa la consistenza eventuale tra i confini.'
severity: context
tags: [ddd, aggregate, tactical-design, eventual-consistency, domain-events]
sources:
  - project: 'Vernon, Implementing DDD'
    date: 2026-05-27
    note: 'le quattro regole degli aggregati: invarianti, piccolo, per identità, consistenza eventuale'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - ddd/bounded-contexts-not-crud-features
order: 5
updated: 2026-06-11
---

## Perché conta

**Quando ripaga lo sforzo.** Questo è DDD tattico, e presuppone che tu stia già modellando aggregati, cosa giustificata solo su un sistema grande con logica di dominio davvero complessa e ricca di invarianti. Su un progetto piccolo o semplice, i confini formali degli aggregati e l'impianto della consistenza eventuale sono puro sovraccarico. Una tabella normale dentro una transazione fa il lavoro, e la cerimonia costa più di quanto renda. Applica le regole qui sotto quando il dominio è abbastanza complesso da rendere i confini di consistenza una vera questione di design. La struttura per feature e la separazione in layer reggono a ogni dimensione, comunque vada (vedi [folder-by-usage](/principles/functional-architecture/one-function-per-file-folder-by-usage)).

Vaughn Vernon ha codificato quattro regole per la progettazione degli aggregati in Implementing DDD (Vernon, 2013, ISBN 978-0321834577). Le elenca in ordine di precedenza, e quell'ordine ha un peso:

1. **Modella gli invarianti reali dentro i confini di consistenza.** Un Aggregate è un gruppo di oggetti di dominio che devono restare consistenti tra loro entro un singolo confine transazionale. Solo gli invarianti che richiedono davvero un'applicazione simultanea appartengono allo stesso aggregato.
2. **Progetta aggregati piccoli.** Vernon è diretto: "limita l'Aggregate alla sola Root Entity e a un numero minimo di attributi e/o proprietà di tipo Value." Un aggregato piccolo blocca meno risorse, ha un raggio d'azione minore quando una scrittura fallisce ed è molto più facile da ragionare quando devi dimostrare che una regola di consistenza vale.
3. **Riferisci gli altri aggregati per identità.** Un aggregato contiene solo l'identificatore di un altro aggregato — un `TenantId`, un `OrderId`, un `CustomerId` — mai un riferimento diretto all'oggetto. Questo evita i caricamenti a cascata e i requisiti di consistenza a cascata.
4. **Usa la consistenza eventuale fuori dal confine.** I cambiamenti che attraversano più aggregati o più bounded context vengono coordinati tramite domain event, non tramite transazioni distribuite. La consistenza tra i confini è eventuale, non immediata.

Sono vincoli portanti, e ciascuno si rompe in un modo preciso. Rompi la regola 2 e i tuoi aggregati abbracciano molte entità, quindi ogni scrittura richiede un lock sull'intero grafo degli oggetti e ottieni contesa su larga scala. Rompi la regola 3 tenendo riferimenti diretti agli oggetti attraverso i confini e ottieni caricamenti a cascata; peggio ancora, il confine perde significato, perché se l'Aggregate A tiene un riferimento diretto all'Aggregate B allora in pratica condividono un confine di consistenza, qualunque cosa dica il codice. Rompi la regola 4 con transazioni distribuite tra i confini dei context e hai costruito un monolite distribuito, dove un guasto in un servizio annulla il lavoro di un altro e ne accoppia la disponibilità.

L'Aggregate è un pattern tattico, e progettarlo correttamente dipende dall'aver fatto prima il lavoro strategico. Come afferma Evans nella DDD Reference (https://www.domainlanguage.com/ddd/reference/), "ogni Aggregate ha una radice e un confine. Il confine definisce cosa sta dentro l'Aggregate. La radice è una singola, specifica Entity contenuta nell'Aggregate." La radice è l'unico punto d'ingresso per i chiamanti esterni, il confine impone gli invarianti, e l'identità della radice è l'unica cosa che attraversa mai da un aggregato all'altro.

## Come applicarlo

**Passo 1 — Identifica gli invarianti reali.**

Un invariante è una regola di business che deve sempre valere, non una che "sarebbe carino far valere" ma una verificata atomicamente a ogni scrittura. Qualche esempio:

- "Una Subscription non può essere Active se il suo Plan è stato eliminato." — È una regola di consistenza tra Subscription e Plan; va verificata in fase di scrittura.
- "Il totale di una Invoice deve essere uguale alla somma delle sue voci." — È una regola interna all'aggregato Invoice; deve valere dopo ogni mutazione.
- "Due Tenant non possono condividere lo stesso indirizzo email." — È un vincolo di unicità; richiede un controllo di appartenenza a un insieme, spesso meglio imposto a livello di infrastruttura (indice univoco) che dentro un aggregato.

La disciplina sta nel distinguere gli invarianti reali dalle regole di consistenza eventuale. "Un Anomaly Alert dovrebbe essere inviato quando viene creato un AnomalyEvent" non è un invariante. È una reazione che può avvenire in modo asincrono, e forzarla a essere un invariante (mettendo la creazione dell'AnomalyAlert dentro la transazione dell'aggregato AnomalyEvent) rende l'aggregato responsabile dell'infrastruttura di notifica. Questo viola il principio di singola responsabilità e rende l'aggregato più difficile da testare.

**Passo 2 — Disegna il confine dell'aggregato attorno al minimo di oggetti necessari a imporre l'invariante.**

Parti da una Entity (la radice) e zero Value Object. Aggiungi un Value Object o una child Entity solo quando l'invariante non si può esprimere senza. La regola di Vernon è il test qui: se stai aggiungendo un oggetto perché è "collegato" o "comodo", fermati. Né il collegamento né la comodità sono un invariante.

Un esempio concreto nel context Subscription & Billing:

```
// Aggregate: Subscription
// Root entity: Subscription
// Internal Value Objects: SubscriptionStatus, BillingPeriod
// Internal child Entity: none needed for core invariants
// Referenced by identity only: PlanId, TenantId

class Subscription {
  readonly id: SubscriptionId;
  readonly tenantId: TenantId;      // identity reference — not the Tenant object
  readonly planId: PlanId;          // identity reference — not the Plan object
  readonly status: SubscriptionStatus;
  readonly billingPeriod: BillingPeriod;

  suspend(reason: SuspensionReason): SubscriptionSuspended {
    // invariant: can only suspend an Active subscription
    if (this.status !== SubscriptionStatus.Active) {
      throw new DomainError('Subscription is not active');
    }
    return new SubscriptionSuspended(this.id, reason, new Date());
  }
}
```

L'aggregato `Subscription` non contiene un oggetto `Tenant` né un oggetto `Plan`. Contiene le loro identità. Quando l'application service deve imporre una regola tra aggregati (es. "non ci si può abbonare a un Plan archiviato"), carica entrambi gli aggregati in modo indipendente, verifica la regola nel layer applicativo e procede. Quella regola non vive in nessuno dei due aggregati. È una policy di coordinamento di proprietà dell'application service.

**Passo 3 — Emetti domain event ai confini degli aggregati, consumali tra i confini dei context.**

Quando una mutazione riesce dentro un aggregato, l'aggregato registra un domain event che descrive cosa è successo. L'evento non viene pubblicato subito. Viene memorizzato accanto allo stato dell'aggregato nella stessa transazione (il pattern Transactional Outbox; vedi `/principles/backend-events/transactional-outbox-idempotent-consumer`), e un processo di relay legge l'outbox e pubblica gli eventi ai consumer a valle in modo asincrono.

È la quarta regola di Vernon in forma meccanica. Il metodo `suspend()` dell'aggregato Subscription restituisce un evento `SubscriptionSuspended`, e l'application service persiste l'aggregato aggiornato e l'evento atomicamente. Da lì il servizio di notifica, il servizio di analytics e la proiezione della dashboard ricevono l'evento ognuno per conto proprio e reagiscono nei propri tempi. Non c'è alcuna transazione distribuita e nessun accoppiamento tramite scritture condivise.

```
// Application service — coordinates across aggregates, owns no domain logic
async function suspendSubscription(
  subscriptionId: SubscriptionId,
  reason: SuspensionReason,
  repo: SubscriptionRepository,
  outbox: DomainEventOutbox
): Promise<void> {
  const subscription = await repo.findById(subscriptionId);
  const event = subscription.suspend(reason);

  // Atomic: aggregate state + event, same DB transaction
  await repo.saveWithEvent(subscription, event);
  // Relay picks up the event from the outbox asynchronously
}
```

**Passo 4 — Imponi i riferimenti per sola identità a livello di tipo.**

La fuga di riferimenti (tenere un riferimento a oggetto dove serve un riferimento per identità) è l'errore più comune nella progettazione degli aggregati. Si nasconde facilmente in una codebase che usa un ORM con lazy loading, perché l'ORM fa sembrare gratuita la navigazione tra oggetti di aggregati diversi. Non lo è. Ogni navigazione carica l'intero grafo dell'aggregato riferito, di solito senza che il chiamante sappia che è successo.

Imponi il confine a livello di tipo. In un modello di dominio l'unico tipo a cui è permesso attraversare un confine di aggregato è un wrapper di identità (`TenantId`, `PlanId`, `SubscriptionId`), e i tipi di dominio (`Tenant`, `Plan`, `Subscription`) non compaiono mai come campi di un altro aggregato. La code review lo impone, e le regole di lint lo impongono dove riesci a scriverle. In TypeScript, un branded type per ogni identità di aggregato rende la distinzione esplicita:

```
// Branded identity types — these cross boundaries
type SubscriptionId = string & { readonly _brand: 'SubscriptionId' };
type TenantId       = string & { readonly _brand: 'TenantId' };
type PlanId         = string & { readonly _brand: 'PlanId' };

// These do NOT cross aggregate boundaries as field types
// class Tenant { ... }
// class Plan { ... }
```

## Anti-pattern

**Anti-pattern 1: l'"aggregato divino" che possiede tutto ciò che gli è collegato.**

Sintomo: un aggregato `Tenant` contiene una lista di oggetti `Subscription`, ciascuno dei quali contiene una lista di oggetti `Invoice`, ciascuno dei quali contiene una lista di oggetti `LineItem` e una lista di oggetti `PaymentAttempt`. Aggiornare un qualsiasi dato legato al tenant blocca l'intero grafo, e aggiungere una singola voce di fattura richiede di caricare l'intero tenant, tutte le sue subscription e tutte le sue fatture.

La soluzione è spezzarlo: `Tenant`, `Subscription`, `Invoice` e `LineItem` sono radici di aggregato separate che si riferiscono a vicenda per identità. Una `Invoice` contiene un `SubscriptionId` e un `TenantId`, non gli oggetti `Subscription` o `Tenant`.

**Anti-pattern 2: usare riferimenti diretti agli oggetti attraverso i confini degli aggregati.**

Sintomo: la classe `Subscription` ha un campo di tipo `Tenant`, e le annotazioni ORM caricano il `Tenant` (in modo eager o lazy) ogni volta che si carica una `Subscription`. Ora un bug nell'aggregato `Tenant` fa fallire ogni scrittura di subscription, e una migrazione dello schema `Tenant` rompe ogni test sulle subscription.

Una volta che gli oggetti attraversano il confine, il confine smette di significare qualcosa. Sostituisci `tenant: Tenant` con `tenantId: TenantId` e carica il `Tenant` separatamente quando ti serve davvero.

**Anti-pattern 3: transazioni compensative come sostituto della consistenza eventuale.**

Sintomo: quando viene creata una `Subscription`, l'application service prova a creare un record `Tenant`, un record `BillingProfile` e un record di notifica dentro una singola transazione distribuita. Se il servizio di notifica è giù, l'intera creazione della subscription viene annullata.

Una transazione distribuita lega tra loro la disponibilità di ogni partecipante. Invece, crea l'aggregato `Subscription`, emetti un evento `SubscriptionCreated` e lascia che i servizi a valle (Billing, Notification) reagiscano in modo asincrono tramite il relay dell'outbox. Se il servizio di notifica è temporaneamente non disponibile, elabora l'evento appena si riprende. La `Subscription` è stata creata con successo, e la consegna della notifica è una preoccupazione separata con la propria semantica di retry.

**Anti-pattern 4: codificare lo stato di un processo dentro un singolo aggregato.**

Sintomo: un aggregato `Subscription` accumula campi e valori di stato che tracciano lo stato di un processo di business a più passi, come `isOnboardingComplete`, `isBillingProfileCreated` e `isWelcomeEmailSent`. L'aggregato si sta trasformando in silenzio in un process manager.

Un processo a più passi che coordina azioni tra più aggregati o servizi è una Saga (o Process Manager): un oggetto separato con la propria identità e la propria macchina a stati, che reagisce ai domain event degli aggregati coinvolti ed emette comandi in risposta. L'aggregato `Subscription` dovrebbe contenere solo gli invarianti che appartengono al concetto di subscription, e lo stato del processo di onboarding appartiene a un aggregato o process manager `OnboardingProcess`.

## Vedi anche

I pattern Transactional Outbox e Idempotent Consumer (vedi `/principles/backend-events/transactional-outbox-idempotent-consumer`) sono i meccanismi concreti dietro la quarta regola di Vernon. La consistenza eventuale tra i confini di aggregati e context è sicura solo quando gli eventi vengono consegnati in modo affidabile (outbox) e i consumer riescono ad assorbire la consegna duplicata (idempotenza).

La DDD Reference (Evans, CC-BY 4.0, https://www.domainlanguage.com/ddd/reference/) tratta Aggregate, Entity, Value Object, Domain Event, Repository e Factory come un unico insieme. I pattern tattici sono fatti per funzionare insieme, e leggerne uno isolato fa perdere il ruolo strutturale che gioca nell'insieme.
