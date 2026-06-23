---
title: 'Транзакционный outbox + идемпотентный потребитель'
category: backend-events
summary: 'Гарантируйте доставку at-least-once при масштабировании за счёт транзакционного outbox на стороне продюсера и идемпотентного потребителя на воркере.'
principle: 'Гарантируйте доставку at-least-once при масштабировании за счёт транзакционного outbox на стороне продюсера и идемпотентного потребителя на воркере; дедуплицируйте через вставку с _id = eventId.'
severity: strong
tags: [backend-events, outbox, idempotency, reliability, messaging]
sources:
  - project: 'сервис на event sourcing'
    date: 2026-05-12
    note: 'outbox на продюсере + идемпотентный потребитель; дедуп по _id=eventId; runRelay → POST /events → SQS'
related:
  - backend-events/storage-in-service-db-per-engine-adapters
  - backend-events/retry-and-dlq-first-class
  - ddd/small-aggregates-by-identity
order: 1
updated: 2026-05-12
---

Распределённые системы падают посреди записи. Продюсер коммитит бизнес-строку, а потом
процесс крашится, не успев опубликовать событие. Может, брокер на секунду недоступен,
может, под уходит на scale-down прямо в середине запроса. Наивный подход — записать
бизнес-состояние, а потом отдельной операцией опубликовать его в брокер — не выживает ни
в одном из этих случаев. Пара «транзакционный outbox + идемпотентный потребитель» — это
самое компактное надёжное решение, которое я знаю. Оно превращает проблему двойной записи
в задачу уровня базы данных и убирает работу с брокером с горячего пути.

## Зачем это нужно

Сервис на event sourcing (2026-05-12) пропускает весь приём событий через SQS вместо того,
чтобы принимать прямые HTTP-записи от продюсеров в момент бизнес-транзакции. В проектной
заметке это сказано прямо:

> Приём событий построен на очереди и гарантирован при масштабировании: транзакционный
> outbox на продюсере, идемпотентный потребитель на воркере (вставка с `_id = eventId` →
> повторные доставки становятся no-op).

Уберите outbox — и сбой проявится мгновенно. Продюсер, который пишет свою бизнес-строку, а
затем пытается сделать POST на `/events` в том же обработчике запроса, теряет событие
всякий раз, когда HTTP-вызов падает, процесс перезапускается или второй под вклинивается в
гонке. В итоге сервис получает пробелы: change-событий нет в логе, и указать не на что,
потому что с точки зрения вызывающей стороны пробел — это отсутствие события.

Идемпотентный потребитель на другом конце берёт на себя зеркальный сбой. SQS доставляет
сообщение хотя бы один раз, поэтому одно и то же событие может прийти дважды — обычно после
повторной отправки по сети или истечения visibility timeout. Вставка с `_id = eventId`
превращает дубликат доставки в no-op. Уникальный индекс MongoDB по `_id` отклоняет вторую
вставку, воркер ловит ошибку duplicate key и нормально подтверждает (ack) сообщение.

Сложите обе половины — и приложение получает семантику exactly-once из конца в конец, хотя
транспорт под капотом работает по at-least-once.

## Как применять

### Шаг 1 — атомарная двойная запись на продюсере

В той же транзакции БД, что коммитит бизнес-изменение, вставьте строку в таблицу outbox.
Либо обе строки коммитятся вместе, либо ни одна.

```ts
// producer-service/src/orders/create-order.ts

import { ClientSession } from 'mongodb';
import { ordersCollection, outboxCollection } from '../db';
import type { Order, OutboxMessage } from '../types';

const createOrder = async (
  payload: CreateOrderPayload,
  session: ClientSession,
): Promise<Order> =>
  session.withTransaction(async () => {
    const order: Order = {
      _id: crypto.randomUUID(),
      ...payload,
      createdAt: new Date(),
    };

    await ordersCollection.insertOne(order, { session });

    const outboxMessage: OutboxMessage = {
      _id: crypto.randomUUID(),           // outbox row id — internal
      eventId: crypto.randomUUID(),       // stable event identity carried downstream
      topic: 'order.created',
      payload: order,
      createdAt: new Date(),
      publishedAt: null,
    };

    await outboxCollection.insertOne(outboxMessage, { session });

    return order;
  });
```

Бизнес-обработчик вообще не трогает брокер. Всё, что он делает, — пишет строки.

### Шаг 2 — relay опустошает outbox

Фоновый процесс (`runRelay`) опрашивает outbox на предмет неопубликованных строк и делает
POST каждой из них на эндпоинт `/events` сервиса event sourcing. Строка помечается как
опубликованная только после успешного ответа (2xx).

```ts
// producer-service/src/relay/run-relay.ts

import type { OutboxMessage } from '../types';
import { outboxCollection } from '../db';

type RelayConfig = {
  readonly pollingIntervalMs: number;
  readonly eventServiceUrl: string;
};

const publishToEventService = async (
  msg: OutboxMessage,
  baseUrl: string,
): Promise<void> => {
  const res = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: msg.eventId,
      topic: msg.topic,
      payload: msg.payload,
      occurredAt: msg.createdAt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Event service rejected event ${msg.eventId}: ${res.status}`);
  }
};

const drainOnce = async (eventServiceUrl: string): Promise<void> => {
  const pending = await outboxCollection
    .find({ publishedAt: null })
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray();

  for (const msg of pending) {
    await publishToEventService(msg, eventServiceUrl);
    await outboxCollection.updateOne(
      { _id: msg._id },
      { $set: { publishedAt: new Date() } },
    );
  }
};

export const runRelay = (config: RelayConfig): NodeJS.Timeout =>
  setInterval(
    () => void drainOnce(config.eventServiceUrl).catch(console.error),
    config.pollingIntervalMs,
  );
```

Держать relay отдельно от бизнес-пути — осознанное решение. Его можно перезапускать,
масштабировать независимо и давать ему ретраить, и ничего из этого не влияет на задержку
записи у продюсера.

### Шаг 3 — идемпотентная вставка на потребителе

Воркер сервиса event sourcing получает события из SQS и вставляет их с `_id = eventId`.
Уникальный индекс по `_id` делает вторую доставку того же события тихим no-op.

```ts
// event-service/src/worker/handle-event.ts

import { MongoServerError } from 'mongodb';
import { changeEventsCollection } from '../db';
import type { InboundEvent, ChangeEvent } from '../types';

const DUPLICATE_KEY_CODE = 11000;

const isDuplicateKey = (err: unknown): boolean =>
  err instanceof MongoServerError && err.code === DUPLICATE_KEY_CODE;

export const handleEvent = async (event: InboundEvent): Promise<void> => {
  const record: ChangeEvent = {
    _id: event.eventId,      // _id = eventId — the deduplication key
    topic: event.topic,
    payload: event.payload,
    occurredAt: new Date(event.occurredAt),
    receivedAt: new Date(),
  };

  try {
    await changeEventsCollection.insertOne(record);
  } catch (err) {
    if (isDuplicateKey(err)) {
      // Second delivery of the same event — already recorded. Ack and move on.
      return;
    }
    throw err;
  }
};
```

Когда вставка бросает ошибку duplicate key, обработчик возвращается нормально, сообщение
SQS подтверждается, а дубликат отбрасывается. Любая другая ошибка пробрасывается дальше и
оставляет сообщение в очереди для повторной доставки.

### Сквозная трассировка через три сервиса

```
Producer service          Event service /events     Event service worker
─────────────────         ─────────────────────     ────────────────────
BEGIN tx
  INSERT orders
  INSERT outbox
COMMIT
          │
          │  (relay polls, finds unpublished)
          │
          └──► POST /events {eventId, topic, ...}
                         │
                         ├── enqueue to SQS ──────►  receive message
                         └── 202 Accepted            INSERT change_events
                                                        _id = eventId
                                                      (dup-key → no-op)
                                                      ack message
```

Один трейс OpenTelemetry проносит заголовок `traceparent` через POST и дальше — в атрибуты
сообщения SQS, так что три спана попадают в один трейс в просмотрщике OTLP. См.
[телеметрия не должна ронять приложение](/principles/backend-events/telemetry-never-crashes).

## Антипаттерны

```ts
// Bad: write business data and publish in the same handler, no outbox.
// A crash between the two steps loses the event silently.
const createOrder = async (payload: CreateOrderPayload): Promise<Order> => {
  const order = await ordersCollection.insertOne(mapToOrder(payload));
  await broker.publish('order.created', order); // can fail; event lost
  return order;
};

// Bad: use a separate DB transaction for the outbox row.
// If the business transaction commits and the outbox transaction rolls back,
// the event is lost just as surely as the example above.
const createOrder = async (payload: CreateOrderPayload): Promise<Order> => {
  const order = await ordersCollection.insertOne(mapToOrder(payload));
  await outboxDb.insertOne(buildOutboxRow(order)); // different connection
  return order;
};

// Bad: ignore duplicate-key errors unconditionally.
// Swallowing all insert errors hides schema violations and data bugs.
try {
  await changeEventsCollection.insertOne(record);
} catch {
  // silently swallowed — see error-handling/never-swallow-errors
}
```

Первые два ломают гарантии доставки. Третий ломает контракт обработки ошибок: законный
no-op — только `code === 11000`, а всё остальное обязано пробрасываться дальше.

## Как закрепить

- Проверяйте наличие outbox на код-ревью архитектурным тестом, который утверждает, что ни
  один модуль сервиса не импортирует клиент брокера напрямую из обработчика бизнес-команды.
- Запрос `publishedAt: null` в relay заодно работает как операционный сигнал здоровья.
  Растущий бэклог там означает, что relay застрял или эндпоинт сервиса event sourcing лежит.
- Добавьте алерт на `outbox.pending_count > threshold`, чтобы ловить отказы relay до того,
  как они превратятся в потерю данных.

## Смотрите также

Стратегия адаптеров под каждый движок, благодаря которой outbox ложится на любую базу,
разобрана в
[Outbox в собственной БД сервиса; адаптеры под каждый движок, никакого 2PC](/principles/backend-events/storage-in-service-db-per-engine-adapters).
Ретраи и обработка dead-letter для relay описаны в
[Ретраи и dead-letter — это полноценная забота библиотеки](/principles/backend-events/retry-and-dlq-first-class).
