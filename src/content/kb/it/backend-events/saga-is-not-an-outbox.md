---
title: 'Una saga non è un outbox'
category: backend-events
summary: 'La saga è una transazione multi-step a livello di workflow con compensazioni; l''outbox è un meccanismo di affidabilità a livello di trasporto: sono due strati diversi.'
principle: "La saga è una transazione multi-step a livello di workflow con compensazioni; l'outbox è un meccanismo di affidabilità a livello di trasporto. Sono due strati diversi: non proporre una saga come sostituto dell'outbox."
severity: strong
tags: [backend-events, saga, outbox, architecture, distributed-systems]
sources:
  - project: 'un servizio di event sourcing'
    date: 2026-05-14
    note: 'saga scartata per un''ingestione a singolo step; la saga sta nello strato workflow, l''outbox nel trasporto'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - backend-events/storage-in-service-db-per-engine-adapters
order: 3
updated: 2026-05-14
---

"Perché non usare una saga?" salta fuori in ogni discussione di design che tocca le
transazioni distribuite. Le saga gestiscono davvero la consistenza tra più servizi, quindi
la domanda sembra ragionevole, ma mette insieme due problemi che vivono in due strati
diversi. La confusione costa tempo vero. I team discutono il pattern e prototipano la logica
di compensazione, poi tornano comunque a un outbox, perché il problema di affidabilità non
ha mai riguardato la gestione del workflow.

Un servizio di event sourcing ha risposto a questa domanda in modo esplicito il 2026-05-14,
quindi c'è una decisione concreta da indicare invece di ragionare in astratto.

## Perché conta

Mentre il servizio di event sourcing veniva progettato, la questione saga contro outbox è
emersa perché entrambi coinvolgono più servizi e consistenza eventuale. La nota di
decisione:

> Saga scartata di proposito per il servizio di event sourcing. L'ingestione è un solo
> step: il producer scrive un ChangeEvent e il servizio lo registra. Non c'è alcun workflow
> di business multi-step da coordinare. Nessun workflow significa nessuna saga.

Questa è l'inquadratura minima. L'argomento più completo richiede di sapere cosa fa
davvero ciascun pattern.

**Una saga è un costrutto a livello di workflow.** Modella un processo di business di lunga
durata che attraversa più servizi come una sequenza di transazioni locali, ognuna delle
quali pubblica un evento o un comando per innescare lo step successivo. Quando uno step
fallisce, la saga esegue transazioni di compensazione per annullare gli step precedenti.
L'esempio classico è un ordine e-commerce che riserva l'inventario, addebita una carta e poi
pianifica la spedizione: tre servizi distinti, tre commit locali e un insieme definito di
compensazioni per quando uno step fallisce dopo che altri hanno fatto commit.

**Un outbox è un costrutto a livello di trasporto.** Risolve un solo problema. Garantisce
che un messaggio venga pubblicato su un broker esattamente una volta rispetto a un commit
sul database locale, anche se il processo va in crash tra la scrittura e la pubblicazione.
Non ha alcun concetto di step di workflow, compensazione o coordinamento tra servizi.
Assicura soltanto che il messaggio lasci il servizio in modo affidabile.

I due operano su strati diversi:

```
Workflow layer:  [ Saga — coordinates steps, triggers compensations ]
                        │                        │
                        │  publishes events       │  receives commands
                        ▼                        ▼
Transport layer: [ Outbox + relay ]       [ Inbox + idempotent consumer ]
```

Una saga _ha bisogno_ di un outbox sotto di sé. Se uno step della saga pubblica su un broker
senza un outbox, quella pubblicazione può andare persa in caso di crash. Una saga senza un
trasporto affidabile salta silenziosamente degli step, il che è probabilmente peggio del non
avere alcuna saga.

### Perché nasce la confusione

La confusione nasce perché saga e outbox condividono caratteristiche superficiali: entrambi
coinvolgono eventi, entrambi attraversano i confini dei servizi, entrambi rispondono ai
fallimenti parziali. A separarli è il significato di "fallimento" in ciascun caso.

- Fallimento della saga: fallisce uno **step di business** (pagamento rifiutato, inventario
  insufficiente). La risposta è la compensazione: invertire gli step precedenti per
  ripristinare la consistenza a livello di business.
- Fallimento dell'outbox: fallisce una **consegna di messaggio** (broker non disponibile,
  crash del processo). La risposta è il retry: ritentare la stessa consegna finché non
  riesce.

La logica di compensazione e la logica di retry non sono intercambiabili. Non puoi fare il
"retry" di un pagamento che è stato rifiutato; annulli invece la prenotazione. E non puoi
"compensare" il fatto che un broker sia giù, metti il messaggio in coda e riprovi.

## Come applicarlo

### Quando ricorrere a una saga

Usa una saga quando tutte e tre queste condizioni sono vere:

1. L'operazione attraversa **più servizi**, ognuno con la propria transazione locale.
2. C'è un **fallimento significativo dal punto di vista del business** in uno o più step che
   non si può semplicemente ritentare (pagamento rifiutato, scorte esaurite, una API esterna
   che restituisce un errore di business).
3. Gli step già committati devono essere **esplicitamente invertiti** quando uno step
   successivo fallisce.

```ts
// Saga coordinator sketch — orchestration style
type SagaStep<TContext> = {
  readonly execute: (ctx: TContext) => Promise<TContext>;
  readonly compensate: (ctx: TContext) => Promise<void>;
};

const runSaga = async <TContext>(
  steps: readonly SagaStep<TContext>[],
  initial: TContext,
): Promise<TContext> => {
  const committed: SagaStep<TContext>[] = [];
  let ctx = initial;

  for (const step of steps) {
    try {
      ctx = await step.execute(ctx);
      committed.push(step);
    } catch (err) {
      // compensate in reverse order
      for (const done of [...committed].reverse()) {
        await done.compensate(ctx).catch(console.error);
      }
      throw err;
    }
  }

  return ctx;
};
```

Ogni step pubblica comunque i propri eventi tramite un outbox. La saga coordina il workflow;
l'outbox garantisce che ogni pubblicazione raggiunga il broker.

### Quando il solo outbox basta

Usa solo un outbox quando:

- L'operazione è **una singola transazione locale** che deve notificare altri servizi.
- Il fallimento significa "messaggio non consegnato": il retry è la risposta corretta.
- Non ci sono step precedenti da compensare.

Questo pattern di ingestione è proprio questo caso. Il producer scrive un solo ChangeEvent
nella propria transazione e il servizio di event sourcing lo registra. Se la registrazione
fallisce, il messaggio viene riconsegnato. Non c'è nulla da compensare, dato che o l'evento
è registrato o non lo è.

```ts
// Not a saga. One step. Retry on failure. Outbox handles reliability.
export const handleInboundEvent = async (event: InboundEvent): Promise<void> => {
  await changeEventsCollection.insertOne({
    _id: event.eventId,   // idempotent insert — see transactional-outbox-idempotent-consumer
    ...mapToRecord(event),
  });
};
```

## Anti-pattern

```ts
// Bad: proposing a saga to solve a delivery-reliability problem.
// The saga here adds compensation overhead for a problem that needs retry, not reversal.

const ingestEventSaga: SagaStep<IngestContext>[] = [
  {
    execute: async (ctx) => {
      await changeEventsCollection.insertOne(ctx.record);
      return ctx;
    },
    compensate: async (ctx) => {
      // What does it mean to "undo" recording a change event?
      // Deleting it introduces a different consistency problem.
      await changeEventsCollection.deleteOne({ _id: ctx.record._id });
    },
  },
];
// This is a retry problem. Use an outbox and an idempotent consumer.


// Bad: a saga that does not use an outbox for its step publications.
// Step publishes are fire-and-forget — silently lost on crash.
const reserveInventoryStep: SagaStep<OrderContext> = {
  execute: async (ctx) => {
    await inventoryDb.reserve(ctx.orderId, ctx.items);
    await broker.publish('inventory.reserved', ctx); // no outbox — unreliable
    return ctx;
  },
  compensate: async (ctx) => {
    await inventoryDb.release(ctx.orderId);
    await broker.publish('inventory.released', ctx); // also unreliable
  },
};
// Each broker publish here needs its own outbox to be reliable.
```

Il primo anti-pattern spreca lavoro di design su una logica di compensazione che è
semanticamente priva di senso per la modalità di fallimento reale. Il secondo costruisce una
saga su un trasporto che perde silenziosamente i messaggi, così il workflow che dovrebbe
garantire non regge mai.

## Vedi anche

L'implementazione completa dell'outbox su cui andrebbero costruiti gli step della saga si
trova in [Outbox transazionale + consumer idempotente](/principles/backend-events/transactional-outbox-idempotent-consumer).
Il design degli adapter per-engine che rende l'outbox portabile su una flotta a motori misti
è in [Outbox nel DB del servizio stesso; adapter per-engine, mai 2PC](/principles/backend-events/storage-in-service-db-per-engine-adapters).
