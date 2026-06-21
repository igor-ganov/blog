---
title: 'Сага — это не outbox'
category: backend-events
summary: 'Сага — это многошаговая транзакция уровня бизнес-процесса с компенсациями; outbox — механизм надёжности на уровне транспорта. Это разные слои.'
principle: "Сага — это многошаговая транзакция уровня бизнес-процесса с компенсациями; outbox — механизм надёжности на уровне транспорта. Это разные слои, и предлагать сагу как замену outbox не нужно."
severity: strong
tags: [backend-events, saga, outbox, architecture, distributed-systems]
sources:
  - project: 'сервис на event sourcing'
    date: 2026-05-14
    note: 'сагу отклонили для одношаговой загрузки данных; сага — слой бизнес-процесса, outbox — транспорт'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - backend-events/storage-in-service-db-per-engine-adapters
order: 3
updated: 2026-05-14
---

«А почему не сага?» — этот вопрос всплывает в каждом обсуждении дизайна, где речь
заходит про распределённые транзакции. Саги действительно решают задачу согласованности
между сервисами, так что вопрос звучит разумно, но он смешивает две проблемы, которые
живут на разных слоях. Путаница стоит реального времени. Команда спорит про паттерн,
прототипирует логику компенсаций, а потом всё равно возвращается к outbox — потому что
проблема надёжности никогда не была про управление бизнес-процессом.

Сервис на event sourcing ответил на это прямо 2026-05-14, так что есть конкретное
решение, на которое можно сослаться, а не рассуждать в вакууме.

## Почему это важно

Когда проектировали сервис на event sourcing, вопрос «сага или outbox» возник потому,
что и там, и там задействовано несколько сервисов и итоговая согласованность. Запись из
решения:

> Сагу для сервиса на event sourcing намеренно отклонили. Загрузка данных — это один шаг:
> продюсер пишет ChangeEvent, а сервис его фиксирует. Никакого многошагового бизнес-процесса
> координировать не нужно. Нет процесса — нет саги.

Это минимальная формулировка. Чтобы развернуть аргумент, нужно понимать, что на самом
деле делает каждый из паттернов.

**Сага — конструкция уровня бизнес-процесса.** Она моделирует долгоживущий бизнес-процесс,
который растянут на несколько сервисов, как последовательность локальных транзакций, и
каждая из них публикует событие или команду, чтобы запустить следующий шаг. Когда шаг
падает, сага запускает компенсирующие транзакции, которые откатывают предыдущие шаги.
Классический пример — заказ в интернет-магазине: резервируем товар, списываем деньги с
карты, потом ставим доставку в очередь. Три отдельных сервиса, три локальных коммита и
заранее заданный набор компенсаций на случай, когда шаг падает уже после того, как
остальные закоммитились.

**Outbox — конструкция уровня транспорта.** Она решает одну задачу. Она гарантирует, что
сообщение будет опубликовано в брокер ровно один раз относительно локального коммита в
базу, даже если процесс упадёт между записью и публикацией. У неё нет понятия шагов
процесса, компенсаций или координации между сервисами. Она только следит за тем, чтобы
сообщение надёжно ушло из сервиса.

Эти двое работают на разных слоях:

```
Workflow layer:  [ Saga — coordinates steps, triggers compensations ]
                        │                        │
                        │  publishes events       │  receives commands
                        ▼                        ▼
Transport layer: [ Outbox + relay ]       [ Inbox + idempotent consumer ]
```

Саге _нужен_ outbox под капотом. Если шаг саги публикует в брокер без outbox, эта
публикация может потеряться при падении процесса. Сага без надёжного транспорта молча
пропускает шаги, а это, пожалуй, хуже, чем вообще не иметь саги.

### Откуда берётся путаница

Путаница возникает из-за того, что у саг и outbox есть общие черты на поверхности: и там,
и там фигурируют события, и то и другое пересекает границы сервисов, и то и другое
реагирует на частичные сбои. Различает их то, что в каждом случае означает «сбой».

- Сбой саги: падает **бизнес-шаг** (платёж отклонён, товара не хватает). Ответ —
  компенсация: откатить предыдущие шаги, чтобы восстановить согласованность на уровне
  бизнеса.
- Сбой outbox: падает **доставка сообщения** (брокер недоступен, процесс упал). Ответ —
  ретрай: повторять ту же доставку, пока она не пройдёт.

Логика компенсации и логика ретрая не взаимозаменяемы. Нельзя «повторить» платёж, который
отклонили; вместо этого отменяешь резерв. И нельзя «компенсировать» лежащий брокер —
кладёшь сообщение в очередь и пробуешь снова.

## Как применять

### Когда тянуться за сагой

Бери сагу, когда все три условия верны:

1. Операция охватывает **несколько сервисов**, у каждого своя локальная транзакция.
2. На одном или нескольких шагах есть **бизнес-значимый сбой**, который нельзя просто
   повторить (платёж отклонён, товар закончился, внешний API вернул бизнес-ошибку).
3. Уже закоммиченные шаги нужно **явно откатить**, когда падает более поздний шаг.

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

Каждый шаг всё равно публикует события через outbox. Сага координирует процесс; outbox
гарантирует, что каждая публикация дойдёт до брокера.

### Когда достаточно одного outbox

Используй только outbox, когда:

- Операция — это **одна локальная транзакция**, которой нужно уведомить другие сервисы.
- Сбой означает «сообщение не доставлено» — правильный ответ это ретрай.
- Нет предыдущих шагов, которые нужно компенсировать.

Этот паттерн загрузки данных — как раз такой случай. Продюсер пишет один ChangeEvent в
своей собственной транзакции, а сервис на event sourcing его фиксирует. Если запись
падает, сообщение доставляется заново. Компенсировать нечего: либо событие записано,
либо нет.

```ts
// Not a saga. One step. Retry on failure. Outbox handles reliability.
export const handleInboundEvent = async (event: InboundEvent): Promise<void> => {
  await changeEventsCollection.insertOne({
    _id: event.eventId,   // idempotent insert — see transactional-outbox-idempotent-consumer
    ...mapToRecord(event),
  });
};
```

## Антипаттерны

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

Первый антипаттерн тратит силы на дизайн логики компенсации, которая семантически
бессмысленна для реального режима сбоя. Второй строит сагу на транспорте, который молча
теряет сообщения, так что процесс, который она должна гарантировать, никогда не
выдерживается.

## Смотрите также

Полная реализация outbox, на которой и должны строиться шаги саги, описана в статье
[Транзакционный outbox + идемпотентный консьюмер](/kb/backend-events/transactional-outbox-idempotent-consumer).
Дизайн адаптеров под конкретный движок, который делает outbox переносимым между парком
из разных движков, описан в статье
[Outbox в собственной БД сервиса; адаптеры под движок, никакого 2PC](/kb/backend-events/storage-in-service-db-per-engine-adapters).
