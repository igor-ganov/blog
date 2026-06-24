---
title: "Outbox в собственной БД сервиса; адаптеры под каждый движок, никакого 2PC"
category: backend-events
summary: "Держите outbox в собственной БД сервиса и пишите атомарно; в мире с разными движками используйте адаптеры под каждый движок за нейтральными к движку интерфейсами — никакого 2PC."
principle: "Держите outbox в собственной бизнес-БД сервиса (тот же движок и соединение) и пишите атомарно нативной транзакцией; в мире с разными движками используйте адаптеры хранилища под каждый движок за нейтральными к движку интерфейсами — никакой общей БД для outbox, межмашинной транзакции или 2PC."
severity: strong
tags: [backend-events, outbox, adapters, transactions, architecture]
sources:
  - project: 'сервис на event sourcing'
    date: 2026-05-14
    note: 'адаптеры под каждый движок; outbox в собственной БД сервиса; нативная транзакция; без 2PC и межмашинных транзакций'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - backend-events/saga-is-not-an-outbox
order: 2
updated: 2026-05-14
---

Паттерн outbox работает только тогда, когда строка outbox пишется в той же атомарной
операции, что и бизнес-строка. Значит, outbox обязан жить в той же базе данных, что и
бизнес-данные. Когда разные сервисы крутятся на разных движках БД (часть на MongoDB,
часть на MySQL), межмашинной ACID-транзакции, на которую можно было бы опереться, просто
нет. Одна общая база для outbox загонит вас в 2PC или к распределённому координатору
транзакций. Такой координатор становится новой единой точкой отказа, связывает сервисы на
уровне транзакций и обычно разваливается при частичных сетевых сбоях — а это ровно те
условия, ради которых outbox и нужен.

Сервис на event sourcing закрыл этот вопрос 14 мая 2026 года.

## Почему это важно

В топологии сервиса на event sourcing есть сервисы на MongoDB и сервисы на MySQL.
Напрашивающийся срез углов — одна центральная база для outbox, куда пишут все, — ломает
атомарность на границе БД. Чтобы MySQL-сервис записал свою бизнес-строку и строку outbox
атомарно, обе записи должны лежать в одной транзакции MySQL на одном соединении. Направьте
эту запись outbox в удалённый MongoDB — и вам уже нужна распределённая транзакция. Если
сеть между сервисом и базой outbox оборвётся посреди записи, вы снова окажетесь в том самом
сценарии потери события, который outbox должен был предотвратить.

Решение, принятое в сервисе на event sourcing:

- **Нейтральные к движку интерфейсы `Outbox` и `Inbox`.** Остальная библиотека (релей,
  транспорт, ретраи) написана против этих интерфейсов и ничего не знает про MongoDB или
  MySQL.
- **Конкретные адаптеры под каждый движок.** `createMongoOutbox` / `createMongoInbox` для
  MongoDB (v1), `createMysqlOutbox` / `createMysqlInbox` запланированы для MySQL. Каждый
  адаптер использует нативный механизм транзакций своего движка.
- **Outbox живёт в собственной бизнес-БД сервиса.** Сервис на MySQL получает таблицу
  outbox в MySQL; сервис на MongoDB получает коллекцию outbox в MongoDB. Никогда наоборот.
- **Нет общей физической БД.** Слово «общий» в контексте библиотеки означает общий
  _интерфейс_ и общее _соглашение по реализации_, а не общий сервер или схему.

## Как применять

### Опишите нейтральные к движку интерфейсы

Библиотека отдаёт интерфейсы, от которых зависят вызывающие, а не конкретные драйверы.

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

`TransactionHandle` на уровне интерфейса типизирован как `unknown`. Каждый адаптер сужает
его до своего движка-специфичного типа внутри себя, так что этот тип не утекает наружу к
вызывающим.

### Адаптер MongoDB — v1 (в продакшене)

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

### Адаптер MySQL — запланирован

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

### Атомарная двойная запись — нейтральный к движку код вызывающего

Поскольку интерфейс принимает `TransactionHandle`, код бизнес-слоя остаётся одним и тем же,
какой бы движок ни был под ним. Движок-специфичный объект сессии или соединения передаётся
снаружи.

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

### Обёртки транзакций под каждый движок

Самый внешний слой — тот, что фактически открывает и коммитит транзакцию, —
движок-специфичен, но живёт на границе инфраструктуры, а не в бизнес-логике.

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

Одна и та же бизнес-функция `createOrder` запускается под любой из обёрток без изменений.

## Антипаттерны

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

Варианты с общей БД и с 2PC ломают гарантию атомарности. Утечка сессии прибивает интерфейс
к одному движку, так что переиспользовать его в парке с разными движками уже не получится.

## Контроль

- Архитектурные тесты (например, через `dependency-cruiser`) могут проверять, что ничто в
  `src/orders/` не импортирует `mongodb` или `mysql2` напрямую — только нейтральный к
  движку интерфейс `Outbox` из библиотеки.
- CI может требовать, чтобы каждый сервис, ставящий библиотеку event sourcing, имел и
  соответствующий вызов `createMongoOutbox` или `createMysqlOutbox` в своей инфраструктурной
  обвязке, а не прямой конструктор outbox.
- Чек-лист код-ревью: имя коллекции или таблицы outbox должно совпадать с собственной
  строкой подключения БД сервиса, а не указывать на отдельный хост.

## Смотрите также

Полный сквозной поток, включая релей и идемпотентного консьюмера, описан в статье
[Транзакционный outbox + идемпотентный консьюмер](/principles/backend-events/transactional-outbox-idempotent-consumer).
Почему сага не заменяет этот паттерн — см.
[Сага — это не outbox](/principles/backend-events/saga-is-not-an-outbox).
