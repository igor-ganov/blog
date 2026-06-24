---
title: 'Держите сервис обобщённым — без эндпоинтов под каждый домен'
category: backend-events
summary: 'Стройте инфраструктуру вне домена: обобщённый журнал событий с денормализованными ссылками на родителей, чтобы любой запрос был одним индексированным find; продюсеры шлют POST на обобщённый эндпоинт /events.'
principle: 'Стройте инфраструктуру вне домена: обобщённый журнал событий с денормализованными ссылками на родителей, чтобы любой запрос был одним индексированным find; новый продюсер владеет своими данными и outbox, гоняет relay и шлёт POST на обобщённый /events — никаких отдельных эндпоинтов под каждый домен.'
severity: preferred
tags: [backend-events, generic, event-log, denormalisation, architecture]
sources:
  - project: 'сервис event sourcing'
    date: 2026-05-12
    note: 'обобщённый журнал событий; денормализованные ссылки; один индексированный find; продюсеры шлют POST /events'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - typescript/validate-at-the-boundary
order: 5
updated: 2026-05-12
---

Инфраструктурный сервис, который обрастает отдельным эндпоинтом под каждый домен,
перестаёт быть инфраструктурой и превращается в хранилище фич. Каждый новый домен добавляет
эндпоинт, каждое изменение домена бьёт по сервису, а команда, владеющая сервисом, в итоге
становится узким горлышком для всех остальных команд, которым нужно эмитить события. Сервис
event sourcing пошёл по другому пути: единственный обобщённый эндпоинт `/events`, куда может
слать POST любой продюсер, поверх модели хранения, которая держит любой запрос потребителя
эффективным без агрегации.

## Почему это важно

Дизайн от 2026-05-12 формулирует замысел прямо:

> Журнал событий вне домена. Каждое событие несёт денормализованную цепочку родителей (refs),
> поэтому любой «вид» — это один индексированный find по тегу ref: ни агрегации, ни проекций.

Рассмотрим альтернативу: сервис с эндпоинтами вроде `/order-events`, `/payment-events` и
`/shipment-events`. Тогда каждому новому источнику событий нужна миграция схемы, новый
обработчик и деплой. Хуже того, такой стиль тянет специфичную для домена логику запросов
внутрь сервиса, связывая инфраструктуру всё плотнее с моделью домена.

Обобщённая модель переворачивает это. Инфраструктурный сервис остаётся стабильным и закрытым
к изменениям, продюсеры владеют собственными схемами и валидацией, а сервис событий вообще не
обязан знать, что такое «заказ» или «платёж».

Денормализованное поле `refs` — это то, что заставляет всё работать. Вместо того чтобы
заставлять потребителя джойнить или агрегировать по коллекциям ради ответа на «все события,
связанные с заказом `ord_123`», продюсер встраивает всю цепочку родителей в каждое событие на
момент записи, а потребитель считывает её одним индексированным find.

## Как применять

### Схема события — обобщённая, с денормализованными refs

```ts
// event-service/src/events/types.ts

export type RefTag = {
  readonly k: string;   // key, e.g. 'orderId', 'customerId', 'tenantId'
  readonly v: string;   // value, e.g. 'ord_abc123'
};

// The stored ChangeEvent is structurally generic.
// The service does not know what 'payload' contains.
export type ChangeEvent = {
  readonly _id: string;              // eventId — the deduplication key
  readonly topic: string;            // e.g. 'order.created', 'payment.captured'
  readonly payload: Record<string, unknown>; // validated at boundary, opaque inside
  readonly refs: readonly RefTag[];  // denormalised parent chain
  readonly occurredAt: Date;
  readonly receivedAt: Date;
};
```

### Стратегия индекса — attribute pattern, переносимая на DocumentDB

Массив `refs` использует attribute pattern для индексирования, поэтому любая пара `{k, v}`
достижима через один составной индекс. Это остаётся переносимым на DocumentDB, который
поддерживает не все типы индексов MongoDB.

```ts
// event-service/src/db/indexes.ts

import type { Db } from 'mongodb';

export const ensureIndexes = async (db: Db): Promise<void> => {
  const col = db.collection('change_events');

  // Compound index on the attribute-pattern refs array.
  // Supports: find({ 'refs.k': 'orderId', 'refs.v': 'ord_abc123' })
  await col.createIndex({ 'refs.k': 1, 'refs.v': 1 });

  // Topic + time for event-stream queries.
  await col.createIndex({ topic: 1, occurredAt: -1 });

  // _id is the deduplication key — MongoDB indexes this automatically.
};
```

Любой вид для потребителя — это один индексированный find:

```ts
// Find all events related to a specific order — no aggregation, no join.
const findEventsByOrder = (db: Db) => (orderId: string) =>
  db
    .collection<ChangeEvent>('change_events')
    .find({ 'refs.k': 'orderId', 'refs.v': orderId })
    .sort({ occurredAt: -1 })
    .toArray();
```

### Обобщённый эндпоинт /events — валидируйте на границе

Сервис принимает событие любой формы на HTTP-границе, но проверяет структуру конверта перед
постановкой в очередь. Содержимое payload остаётся непрозрачным: сервис записывает его, не
заглядывая внутрь. См. [валидацию на границе](/principles/typescript/validate-at-the-boundary).

```ts
// event-service/src/api/ingest-event.ts

import { z } from 'zod';

const RefTagSchema = z.object({
  k: z.string().min(1),
  v: z.string().min(1),
});

// The envelope is fully typed and validated.
// The payload is validated only as a non-null object — its shape is the producer's concern.
const InboundEventSchema = z.object({
  eventId: z.string().uuid(),
  topic: z.string().min(1),
  payload: z.record(z.unknown()),
  refs: z.array(RefTagSchema).min(1),
  occurredAt: z.string().datetime(),
});

export type InboundEvent = z.infer<typeof InboundEventSchema>;

export const parseInboundEvent = (raw: unknown): InboundEvent | undefined => {
  const result = InboundEventSchema.safeParse(raw);
  return result.success ? result.data : undefined;
};

// Route handler — generic for every domain
const handleIngestEvent = async (req: Request): Promise<Response> => {
  const body: unknown = await req.json();
  const event = parseInboundEvent(body);

  if (!event) {
    return new Response('Invalid event envelope', { status: 400 });
  }

  await sqsClient.sendMessage({
    QueueUrl: env.QUEUE_URL,
    MessageBody: JSON.stringify(event),
    MessageGroupId: event.topic,
    MessageDeduplicationId: event.eventId,
  });

  return new Response(null, { status: 202 });
};
```

Эндпоинт не меняется никогда. Новый продюсер может слать на него POST с первого дня, вообще
не трогая сервис.

### Сторона продюсера — собирайте refs на момент записи

Продюсер встраивает в событие всю цепочку родителей. Сервис событий никогда не выводит и не
обогащает refs; что записал продюсер — ровно то и сохраняется.

```ts
// orders-service/src/orders/create-order.ts

const buildOrderCreatedEvent = (order: Order, customer: Customer): OutboxMessage => ({
  eventId: crypto.randomUUID(),
  topic: 'order.created',
  payload: {
    orderId: order._id,
    items: order.items,
    totalAmount: order.totalAmount,
  },
  refs: [
    { k: 'orderId', v: order._id },
    { k: 'customerId', v: customer._id },
    { k: 'tenantId', v: customer.tenantId },
  ],
  createdAt: new Date(),
  publishedAt: undefined,
});
```

Потребитель, которому нужны все события для `tenantId: 'tenant_xyz'`, получает их одним
запросом независимо от типа события, а потребитель, которого интересует только жизненный цикл
заказа, запрашивает `topic: 'order.*'` и `refs.k: 'orderId'` — и это по-прежнему один find.

### Деплой по ролям — api / worker / all

Один и тот же Docker-образ запускается в трёх режимах через переменную окружения
`SERVICE_ROLE`:

```ts
// event-service/src/bootstrap.ts

type Role = 'api' | 'worker' | 'all';

const startForRole = (role: Role): void => {
  if (role === 'api' || role === 'all') {
    startHttpServer(); // serves generic /events
  }
  if (role === 'worker' || role === 'all') {
    startSqsConsumer(); // drains queue, inserts to change_events
  }
};

const role = (process.env['SERVICE_ROLE'] ?? 'all') as Role;
startForRole(role);
```

Можно масштабировать worker горизонтально, не добавляя инстансов api, или гонять оба в одном
процессе во время разработки. Дублирования кода между двумя путями нет.

## Антипаттерны

```ts
// Bad: per-domain endpoints. Each new event source requires a service change.
app.post('/order-events', handleOrderEvent);
app.post('/payment-events', handlePaymentEvent);
app.post('/shipment-events', handleShipmentEvent); // new producer = new endpoint = deploy

// Bad: domain logic in the infrastructure service.
// The event service now knows what a "cancelled order" means — it has become a domain service.
const handleOrderEvent = async (event: OrderEvent): Promise<void> => {
  if (event.type === 'order.cancelled' && event.payload.refundRequired) {
    await triggerRefundWorkflow(event.payload.orderId); // wrong layer
  }
  await storeEvent(event);
};

// Bad: normalised storage requiring aggregation for every consumer.
// Storing only the immediate parent means "all events for tenant X" requires
// joining across multiple collections or a multi-step aggregation.
type ChangeEvent = {
  _id: string;
  topic: string;
  parentId: string;       // only the direct parent — no chain
  parentType: string;
};
// Consumer: find orders by tenant → find events by orderId → two queries, no index coverage
```

Каждый из этих случаев затаскивает доменное знание в инфраструктуру, которая должна была
остаться вне домена, а нормализованное хранение вдобавок выбрасывает гарантию одного запроса.

## Смотрите также

Паттерн outbox и relay, которым продюсеры пользуются, чтобы надёжно слать POST на `/events`,
описан в [Транзакционный outbox + идемпотентный потребитель](/principles/backend-events/transactional-outbox-idempotent-consumer).
Валидация конверта события на HTTP-границе без заглядывания внутрь payload разобрана в
[валидации на границе](/principles/typescript/validate-at-the-boundary).
