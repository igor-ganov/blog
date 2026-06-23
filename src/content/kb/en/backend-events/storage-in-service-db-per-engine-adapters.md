---
title: "Outbox in the service's own DB; per-engine adapters, never 2PC"
category: backend-events
summary: "Put the outbox in the service's own DB and write atomically; in a mixed-engine world use per-engine adapters behind engine-neutral interfaces — never 2PC."
principle: "Put the outbox in the service's own business DB (same engine/connection) and write atomically with a native transaction; in a mixed-engine world use per-engine storage adapters behind engine-neutral interfaces — never a shared outbox DB, cross-engine transaction, or 2PC."
severity: strong
tags: [backend-events, outbox, adapters, transactions, architecture]
sources:
  - project: 'an event-sourcing service'
    date: 2026-05-14
    note: 'per-engine adapters; outbox in service own DB; native tx; no 2PC/cross-engine'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - backend-events/saga-is-not-an-outbox
order: 2
updated: 2026-05-14
---

The outbox pattern only works if the outbox row is written in the same atomic operation
as the business row. So the outbox has to live in the same database as the business data.
When different services run on different database engines (some MongoDB, some MySQL),
there is no cross-engine ACID transaction to lean on. A single shared outbox database
would force you into 2PC or a distributed transaction coordinator. That coordinator
becomes a new single point of failure, it couples services at the transaction level, and
it tends to fall apart under partial network failures, which are exactly the conditions
where you needed the outbox to hold.

An event-sourcing service settled this question on 2026-05-14.

## Why this matters

The event-sourcing service topology includes services on MongoDB and services on MySQL.
The obvious-looking shortcut, one central outbox database that everyone writes to, breaks
atomicity at the DB boundary. For a MySQL service to write its business row and an outbox
row atomically, both writes have to sit in the same MySQL transaction on the same
connection. Point that outbox write at a remote MongoDB instead and you now need a
distributed transaction. If the network between the service and the outbox DB drops
mid-write, you land right back in the lost-event failure mode the outbox was meant to
prevent.

The solution adopted in the event-sourcing service:

- **Engine-neutral `Outbox` and `Inbox` interfaces.** The rest of the library (relay,
  transport, retry) is written against these interfaces and knows nothing about MongoDB
  or MySQL.
- **Concrete per-engine adapters.** `createMongoOutbox` / `createMongoInbox` for
  MongoDB (v1), `createMysqlOutbox` / `createMysqlInbox` planned for MySQL. Each adapter
  uses the engine's native transaction mechanism.
- **The outbox lives in the service's own business DB.** A MySQL service gets a MySQL
  outbox table; a MongoDB service gets a MongoDB outbox collection. Never the reverse.
- **No shared physical DB.** The word "shared" in the library context means a shared
  _interface_ and a shared _implementation convention_, not a shared server or schema.

## How to apply

### Define engine-neutral interfaces

The library exposes interfaces that callers depend on, not concrete drivers.

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

`TransactionHandle` is typed as `unknown` at the interface level. Each adapter narrows it
to its engine-specific type internally, so that type never leaks out to callers.

### MongoDB adapter — v1 (production)

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

### MySQL adapter — planned

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

### Atomic dual-write — engine-neutral caller code

Because the interface accepts a `TransactionHandle`, the business-layer code stays the
same whatever the underlying engine is. The engine-specific session or connection object
gets passed in from the outside.

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

### Transaction wrappers per engine

The outermost layer, the one that actually opens and commits the transaction, is
engine-specific, but it lives at the infrastructure boundary rather than in business
logic.

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

The same `createOrder` business function runs under either wrapper unchanged.

## Anti-patterns

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

The first two patterns break the atomicity guarantee. The third one violates the adapter
abstraction and pins the interface to a single engine, so you can no longer reuse it
across a mixed-engine fleet.

## Enforcement

- Architecture tests (e.g. with `dependency-cruiser`) can assert that nothing in
  `src/orders/` imports `mongodb` or `mysql2` directly — only the engine-neutral
  `Outbox` interface from the library.
- CI can enforce that every service that installs the event-sourcing library also has a
  corresponding `createMongoOutbox` or `createMysqlOutbox` call in its infrastructure
  wiring, not a direct outbox constructor.
- Code review checklist: outbox collection/table name must match the service's own DB
  connection string, not a separate host.

## See also

The full end-to-end flow, including the relay and the idempotent consumer, is in
[Transactional outbox + idempotent consumer](/principles/backend-events/transactional-outbox-idempotent-consumer).
For why a saga does not replace this pattern, see
[A saga is not an outbox](/principles/backend-events/saga-is-not-an-outbox).
