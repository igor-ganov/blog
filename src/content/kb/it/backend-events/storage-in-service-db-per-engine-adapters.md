---
title: "Outbox nel DB del servizio stesso; adapter per motore, mai 2PC"
category: backend-events
summary: "Metti l'outbox nel DB del servizio stesso e scrivi in modo atomico; in un contesto con motori misti usa adapter per ogni motore dietro interfacce neutre rispetto al motore — mai 2PC."
principle: "Metti l'outbox nel DB di business del servizio stesso (stesso motore/connessione) e scrivi in modo atomico con una transazione nativa; in un contesto con motori misti usa adapter di storage per ogni motore dietro interfacce neutre rispetto al motore — mai un DB outbox condiviso, una transazione cross-engine o il 2PC."
severity: strong
tags: [backend-events, outbox, adapters, transactions, architecture]
sources:
  - project: 'un servizio di event-sourcing'
    date: 2026-05-14
    note: 'adapter per motore; outbox nel DB del servizio stesso; tx nativa; niente 2PC/cross-engine'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - backend-events/saga-is-not-an-outbox
order: 2
updated: 2026-05-14
---

Il pattern outbox funziona solo se la riga dell'outbox viene scritta nella stessa operazione
atomica della riga di business. Quindi l'outbox deve vivere nello stesso database dei dati
di business. Quando servizi diversi girano su motori di database diversi (alcuni MongoDB,
altri MySQL), non esiste una transazione ACID cross-engine su cui appoggiarsi. Un singolo
database outbox condiviso ti costringerebbe al 2PC o a un coordinatore di transazioni
distribuite. Quel coordinatore diventa un nuovo single point of failure, accoppia i servizi
a livello di transazione e tende a sgretolarsi sotto i guasti di rete parziali, che sono
esattamente le condizioni in cui ti serviva che l'outbox reggesse.

Un servizio di event-sourcing ha chiuso la questione il 2026-05-14.

## Perché conta

La topologia del servizio di event-sourcing comprende servizi su MongoDB e servizi su MySQL.
La scorciatoia che sembra ovvia, un unico database outbox centrale su cui scrivono tutti,
rompe l'atomicità al confine del DB. Perché un servizio MySQL scriva la sua riga di business
e una riga di outbox in modo atomico, entrambe le scritture devono stare nella stessa
transazione MySQL sulla stessa connessione. Punta quella scrittura outbox verso un'istanza
MongoDB remota e ti serve una transazione distribuita. Se la rete tra il servizio e il DB
outbox cade a metà scrittura, ti ritrovi di nuovo nella modalità di guasto con perdita di
eventi che l'outbox doveva prevenire.

La soluzione adottata nel servizio di event-sourcing:

- **Interfacce `Outbox` e `Inbox` neutre rispetto al motore.** Il resto della libreria
  (relay, transport, retry) è scritto contro queste interfacce e non sa nulla di MongoDB
  o MySQL.
- **Adapter concreti per ogni motore.** `createMongoOutbox` / `createMongoInbox` per
  MongoDB (v1), `createMysqlOutbox` / `createMysqlInbox` previsti per MySQL. Ogni adapter
  usa il meccanismo di transazione nativo del motore.
- **L'outbox vive nel DB di business del servizio stesso.** Un servizio MySQL ottiene una
  tabella outbox MySQL; un servizio MongoDB ottiene una collection outbox MongoDB. Mai il
  contrario.
- **Nessun DB fisico condiviso.** La parola "condiviso" nel contesto della libreria
  significa un'_interfaccia_ condivisa e una _convenzione di implementazione_ condivisa, non
  un server o uno schema condivisi.

## Come applicarlo

### Definire interfacce neutre rispetto al motore

La libreria espone interfacce da cui dipendono i chiamanti, non driver concreti.

```ts
// event-source/src/outbox/types.ts

export type OutboxMessage = {
  readonly eventId: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly createdAt: Date;
  readonly publishedAt: Date | undefined;
};

export type TransactionHandle = unknown; // opaque to the interface layer

export interface Outbox {
  /** Write a message inside the caller's open transaction. */
  insert(msg: OutboxMessage, tx: TransactionHandle): Promise<void>;
  /** Return unpublished messages for the relay to drain. */
  listPending(limit: number): Promise<readonly OutboxMessage[]>;
  /** Mark a message as successfully published. */
  markPublished(eventId: string): Promise<void>;
}

export interface Inbox {
  /** True if this eventId was already processed. */
  isDuplicate(eventId: string): Promise<boolean>;
  /** Record the eventId as processed inside the caller's open transaction. */
  markProcessed(eventId: string, tx: TransactionHandle): Promise<void>;
}
```

`TransactionHandle` è tipizzato come `unknown` a livello di interfaccia. Ogni adapter lo
restringe internamente al proprio tipo specifico del motore, così quel tipo non trapela mai
verso i chiamanti.

### Adapter MongoDB — v1 (in produzione)

```ts
// event-source/src/outbox/adapters/mongo.ts

import type { ClientSession, Collection, Db } from 'mongodb';
import type { Outbox, OutboxMessage, TransactionHandle } from '../types';

type MongoOutboxDeps = {
  readonly db: Db;
};

const toMongoSession = (tx: TransactionHandle): ClientSession => {
  if (tx === undefined || tx === null) {
    throw new Error('MongoDB outbox requires a ClientSession as the transaction handle');
  }
  return tx as ClientSession; // narrowing inside the adapter boundary — acceptable
};

export const createMongoOutbox = ({ db }: MongoOutboxDeps): Outbox => {
  const col: Collection<OutboxMessage> = db.collection('outbox');

  return {
    insert: (msg, tx) => col.insertOne(msg, { session: toMongoSession(tx) }).then(() => undefined),

    listPending: (limit) =>
      col
        .find({ publishedAt: undefined })
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray(),

    markPublished: (eventId) =>
      col
        .updateOne({ eventId }, { $set: { publishedAt: new Date() } })
        .then(() => undefined),
  };
};
```

### Adapter MySQL — previsto

```ts
// event-source/src/outbox/adapters/mysql.ts  (planned)

import type { Connection } from 'mysql2/promise';
import type { Outbox, OutboxMessage, TransactionHandle } from '../types';

type MysqlOutboxDeps = {
  readonly getConnection: () => Promise<Connection>;
};

export const createMysqlOutbox = ({ getConnection }: MysqlOutboxDeps): Outbox => {
  const toConnection = (tx: TransactionHandle): Connection => {
    if (!tx) throw new Error('MySQL outbox requires an active Connection as the transaction handle');
    return tx as Connection;
  };

  return {
    insert: async (msg, tx) => {
      const conn = toConnection(tx);
      await conn.execute(
        `INSERT INTO outbox (event_id, topic, payload, created_at)
         VALUES (?, ?, ?, ?)`,
        [msg.eventId, msg.topic, JSON.stringify(msg.payload), msg.createdAt],
      );
    },

    listPending: async (limit) => {
      const [rows] = await (await getConnection()).execute<OutboxMessage[]>(
        `SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at LIMIT ?`,
        [limit],
      );
      return rows;
    },

    markPublished: async (eventId) => {
      await (await getConnection()).execute(
        `UPDATE outbox SET published_at = NOW() WHERE event_id = ?`,
        [eventId],
      );
    },
  };
};
```

### Doppia scrittura atomica — codice chiamante neutro rispetto al motore

Poiché l'interfaccia accetta un `TransactionHandle`, il codice del livello di business resta
lo stesso qualunque sia il motore sottostante. L'oggetto session o connection specifico del
motore viene passato dall'esterno.

```ts
// producer-service/src/orders/create-order.ts

import type { Outbox } from 'event-source/outbox/types';
import type { TransactionHandle } from 'event-source/outbox/types';

type Deps = {
  readonly outbox: Outbox;
};

// The caller provides the transaction handle — could be a Mongo ClientSession
// or a MySQL Connection held inside BEGIN … COMMIT. The business layer does not care.
export const createOrder =
  ({ outbox }: Deps) =>
  async (payload: CreateOrderPayload, tx: TransactionHandle): Promise<Order> => {
    const order = mapToOrder(payload);

    // business write — caller has already opened the transaction
    await ordersCollection.insertOne(order, { session: tx as never });

    // outbox write — same transaction handle, same atomic commit
    await outbox.insert(
      {
        eventId: crypto.randomUUID(),
        topic: 'order.created',
        payload: order,
        createdAt: new Date(),
        publishedAt: undefined,
      },
      tx,
    );

    return order;
  };
```

### Wrapper di transazione per ogni motore

Il livello più esterno, quello che apre e committa effettivamente la transazione, è
specifico del motore, ma vive al confine dell'infrastruttura anziché nella logica di
business.

```ts
// MongoDB transaction wrapper
const withMongoTransaction =
  <T>(session: ClientSession) =>
  (fn: (tx: TransactionHandle) => Promise<T>): Promise<T> =>
    session.withTransaction(() => fn(session));

// MySQL transaction wrapper
const withMysqlTransaction =
  <T>(conn: Connection) =>
  async (fn: (tx: TransactionHandle) => Promise<T>): Promise<T> => {
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  };
```

La stessa funzione di business `createOrder` gira sotto entrambi i wrapper senza modifiche.

## Anti-pattern

```ts
// Bad: outbox in a different DB from the business data.
// If the network to the shared outbox DB drops between the business commit and the
// outbox insert, the event is silently lost.
const sharedOutboxDb = new MongoClient(SHARED_OUTBOX_URI).db('outbox');
const outbox = createMongoOutbox({ db: sharedOutboxDb });

// business write goes to this service's MySQL
await conn.execute('INSERT INTO orders ...', [...]);

// outbox write goes to a remote MongoDB — NOT in the same transaction
await outbox.insert(msg, undefined);  // no transaction handle — gap here


// Bad: 2PC via a coordinator.
// Tight coupling, new SPOF, and it still fails under network partitions.
await coordinator.prepare(businessTx, outboxTx);
await coordinator.commit(businessTx, outboxTx);


// Bad: leaking the Mongo ClientSession into the interface.
export interface Outbox {
  insert(msg: OutboxMessage, session: ClientSession): Promise<void>; // engine-coupled
}
// A MySQL service can never satisfy this interface without a fake session object.
```

I pattern con DB condiviso e con 2PC rompono la garanzia di atomicità. Far trapelare la
session inchioda l'interfaccia a un singolo motore, così non puoi più riutilizzarla su una
flotta con motori misti.

## Come imporlo

- I test di architettura (per esempio con `dependency-cruiser`) possono verificare che
  nulla in `src/orders/` importi direttamente `mongodb` o `mysql2` — solo l'interfaccia
  `Outbox` neutra rispetto al motore esposta dalla libreria.
- La CI può imporre che ogni servizio che installa la libreria di event-sourcing abbia
  anche una corrispondente chiamata `createMongoOutbox` o `createMysqlOutbox` nel proprio
  cablaggio dell'infrastruttura, non un costruttore di outbox diretto.
- Checklist di code review: il nome della collection/tabella outbox deve corrispondere alla
  stringa di connessione del DB del servizio stesso, non a un host separato.

## Vedi anche

Il flusso completo end-to-end, comprese il relay e il consumer idempotente, è in
[Outbox transazionale + consumer idempotente](/principles/backend-events/transactional-outbox-idempotent-consumer).
Per capire perché una saga non sostituisce questo pattern, vedi
[Una saga non è un outbox](/principles/backend-events/saga-is-not-an-outbox).
