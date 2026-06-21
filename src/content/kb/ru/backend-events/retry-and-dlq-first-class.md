---
title: 'Повторы и dead-letter — забота библиотеки, а не приложения'
category: backend-events
summary: 'Встройте повторы и dead-letter-очереди в библиотеку доставки с обеих сторон — в relay отправителя и в обработчик получателя — вместо того чтобы перекладывать их на каждый подключающий сервис.'
principle: 'Встройте повторы (maxAttempts, экспоненциальный/фиксированный backoff) и dead-letter-очереди в библиотеку доставки с обеих сторон: relay отправителя повторяет публикацию, затем перекладывает сообщение в dlq_outbox; получатель повторяет через visibility timeout брокера, затем подтверждает приём и пишет в dlq_inbox.'
severity: strong
tags: [backend-events, retry, dlq, dead-letter, reliability, outbox]
sources:
  - project: 'сервис на event sourcing'
    date: 2026-05-14
    note: 'конфигурация повторов + DLQ с обеих сторон; фасады createSender/createReceiver'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - error-handling/never-swallow-errors
order: 4
updated: 2026-05-14
---

Повторы и обработка dead-letter — не дело приложения. Они нужны каждому сервису, который
публикует или потребляет события, форма у них всегда одна и та же, а сценарии отказа
повторяются от сервиса к сервису. Спустишь эту логику в каждый подключающий сервис — и она
поплывёт: один ограничивает повторы тремя попытками, другой десятью, кто-то берёт
фиксированный backoff, кто-то экспоненциальный, и почти все забывают про dead-letter. А
потом сообщение отказывает окончательно и исчезает, не оставив следа.

Сервис на event sourcing закрыл этот вопрос 2026-05-14, сделав повторы и DLQ заботой самой
библиотеки: их настраивают один раз на пару отправитель/получатель, а не в каждом
подключающем сервисе.

## Зачем это нужно

У сообщения, которое не удалось обработать, должна быть определённая судьба. На каждой
границе повтора есть два исхода:

1. Операция в итоге проходит в пределах `maxAttempts` — нормальный путь.
2. Операция исчерпывает `maxAttempts` — сообщение нужно сохранить в dead-letter-хранилище,
   а не молча выбросить.

Без контроля этого контракта на уровне библиотеки исход 2 обычно вырождается в тихий сброс.
`console.error` с последующим return — это не dead-letter-очередь. Потерянное сообщение —
это невидимая потеря данных: нет записи о том, что сообщение вообще было, нет способа его
переиграть, нет сигнала, что что-то пошло не так. См.
[никогда не глотайте ошибки](/kb/error-handling/never-swallow-errors) о том, почему это
важно и за пределами обмена сообщениями.

Две стороны пути доставки используют разные механизмы повтора, поэтому библиотеке
приходится поддерживать обе:

- **Сторона отправителя** — повторами управляет relay. Он напрямую повторяет вызов
  публикации в HTTP/брокер и при исчерпании попыток перекладывает строку outbox в
  `dlq_outbox_<svc>`.
- **Сторона получателя** — повторами управляет брокер через visibility timeout. Потребитель
  даёт сообщению вернуться в очередь до `maxAttempts` раз. При исчерпании попыток он
  подтверждает приём сообщения (убирая его из очереди) и пишет в `dlq_inbox_<svc>`.

## Как применять

### Форма конфигурации повторов

```ts
// event-source/src/config/retry.ts

export type BackoffStrategy = 'exponential' | 'fixed';

export type RetryConfig = {
  readonly maxAttempts: number;
  readonly backoff: BackoffStrategy;
  readonly initialDelayMs: number;
  readonly deadLetter: DeadLetterConfig;
};

export type DeadLetterConfig = {
  readonly enabled: boolean;
  readonly collectionOrTable: string; // e.g. 'dlq_outbox_orders', 'dlq_inbox_payments'
};

const computeDelay = (attempt: number, config: RetryConfig): number =>
  config.backoff === 'exponential'
    ? config.initialDelayMs * 2 ** attempt
    : config.initialDelayMs;
```

### Сторона отправителя — relay с повторами и dlq_outbox

```ts
// event-source/src/relay/run-relay.ts

import type { Outbox, OutboxMessage } from '../outbox/types';
import type { RetryConfig } from '../config/retry';

type RelayDeps = {
  readonly outbox: Outbox;
  readonly dlqOutbox: DlqStore;
  readonly publish: (msg: OutboxMessage) => Promise<void>;
  readonly retry: RetryConfig;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const publishWithRetry = async (
  msg: OutboxMessage,
  deps: RelayDeps,
): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < deps.retry.maxAttempts; attempt++) {
    try {
      await deps.publish(msg);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < deps.retry.maxAttempts - 1) {
        await sleep(computeDelay(attempt, deps.retry));
      }
    }
  }

  // Exhausted all attempts — move to DLQ, do not silently drop.
  if (deps.retry.deadLetter.enabled) {
    await deps.dlqOutbox.insert({
      originalEventId: msg.eventId,
      message: msg,
      failedAt: new Date(),
      reason: String(lastError),
    });
    await deps.outbox.markPublished(msg.eventId); // remove from pending to stop relay looping
  } else {
    throw lastError; // if DLQ is disabled, propagate — never swallow
  }
};

export const runRelay = (deps: RelayDeps): NodeJS.Timeout => {
  const drainOnce = async (): Promise<void> => {
    const pending = await deps.outbox.listPending(100);
    for (const msg of pending) {
      await publishWithRetry(msg, deps);
      await deps.outbox.markPublished(msg.eventId);
    }
  };

  return setInterval(
    () => void drainOnce().catch(console.error),
    5_000,
  );
};
```

Relay никогда не выбрасывает сообщение по-тихому. Либо публикация проходит, либо сообщение
оказывается в `dlq_outbox_<svc>` с причиной отказа и временной меткой.

### Сторона получателя — visibility timeout + dlq_inbox

SQS, как и большинство брокеров, делает повтор на стороне сервера через visibility timeout:
если потребитель не подтвердил приём в пределах таймаута, сообщение снова становится видимым
и доставляется повторно. Библиотека оборачивает это, читая счётчик получений из атрибута
сообщения, а затем подтверждая приём и записывая в DLQ, когда достигнут лимит.

```ts
// event-source/src/receiver/handle-message.ts

import type { SqsMessage } from '../transport/sqs';
import type { Inbox } from '../inbox/types';
import type { RetryConfig } from '../config/retry';

type HandlerDeps = {
  readonly inbox: Inbox;
  readonly dlqInbox: DlqStore;
  readonly retry: RetryConfig;
  readonly processEvent: (event: InboundEvent) => Promise<void>;
};

const getAttemptCount = (msg: SqsMessage): number =>
  Number(msg.attributes?.ApproximateReceiveCount ?? 1);

export const handleMessage =
  (deps: HandlerDeps) =>
  async (msg: SqsMessage): Promise<'ack' | 'nack'> => {
    const event = parseInboundEvent(msg.body);
    const attempt = getAttemptCount(msg);

    if (await deps.inbox.isDuplicate(event.eventId)) {
      return 'ack'; // idempotent — already processed
    }

    try {
      await deps.processEvent(event);
      await deps.inbox.markProcessed(event.eventId, undefined);
      return 'ack';
    } catch (err) {
      if (attempt >= deps.retry.maxAttempts) {
        // Exhausted retries — ack to remove from queue, write to DLQ.
        if (deps.retry.deadLetter.enabled) {
          await deps.dlqInbox.insert({
            originalEventId: event.eventId,
            message: msg,
            failedAt: new Date(),
            reason: String(err),
          });
        }
        return 'ack'; // must ack — message has been durably stored in DLQ
      }

      // Still within retry budget — nack so the broker redelivers after visibility timeout.
      return 'nack';
    }
  };
```

Получатель никогда не глотает ошибки по-тихому. Пока `maxAttempts` не достигнут, `nack`
говорит брокеру доставить сообщение повторно. Когда попытки кончились, сообщение уходит в
`dlq_inbox_<svc>` и подтверждается.

### Высокоуровневые фасады

Библиотека экспортирует две фабричные функции, которые связывают всё вместе. Подключающие
сервисы работают через фасады, а не через отдельные компоненты.

```ts
// event-source/src/index.ts

export type SenderConfig = {
  readonly outbox: Outbox;
  readonly transport: Transport;
  readonly retry: RetryConfig;
};

export type ReceiverConfig = {
  readonly inbox: Inbox;
  readonly transport: Transport;
  readonly retry: RetryConfig;
  readonly processEvent: (event: InboundEvent) => Promise<void>;
};

export const createSender = (config: SenderConfig): Sender => ({
  start: () =>
    runRelay({
      outbox: config.outbox,
      dlqOutbox: createDlqStore(config.retry.deadLetter),
      publish: config.transport.publish,
      retry: config.retry,
    }),
});

export const createReceiver = (config: ReceiverConfig): Receiver => ({
  start: () =>
    config.transport.subscribe(
      handleMessage({
        inbox: config.inbox,
        dlqInbox: createDlqStore(config.retry.deadLetter),
        retry: config.retry,
        processEvent: config.processEvent,
      }),
    ),
});
```

Сервис, подключающий библиотеку, связывает её один раз при старте:

```ts
// orders-service/src/bootstrap.ts

const sender = createSender({
  outbox: createMongoOutbox({ db: ordersDb }),
  transport: createSqsTransport({ queueUrl: env.EVENT_QUEUE_URL }),
  retry: {
    maxAttempts: 5,
    backoff: 'exponential',
    initialDelayMs: 200,
    deadLetter: {
      enabled: true,
      collectionOrTable: 'dlq_outbox_orders',
    },
  },
});

sender.start();
```

Низкоуровневые части (`createMongoOutbox`, `runRelay`, `createSqsTransport`) остаются
экспортированными для сервисов, которым нужен прямой доступ. Фасады существуют для удобства
и никого не отрезают от деталей.

## Антипаттерны

```ts
// Bad: swallowing errors after exhausting retries on the sender side.
// The message disappears. No DLQ, no log that it existed.
const publishWithRetry = async (msg: OutboxMessage): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    try {
      await broker.publish(msg);
      return;
    } catch {
      // swallowed — third failure = silent discard
    }
  }
};


// Bad: fixed retry count hardcoded in each service.
// Services diverge; some retry 3 times, some 10, with no consistency.
// When you need to change the policy, you touch every service.
const MAX_RETRIES = 3; // in orders-service
const MAX_RETRIES = 10; // in payments-service — different, undocumented reason


// Bad: not writing to DLQ, just logging.
// A log entry is not replay-able. You cannot reprocess a log line.
} catch (err) {
  console.error('Message processing failed permanently', err);
  return 'ack'; // message is gone, no record in a durable store
}
```

Каждый из этих случаев приводит к невидимой и безвозвратной потере сообщений. Без DLQ ты не
скажешь, сколько сообщений потеряно, что в них было и когда их переигрывать, когда
первопричина исправлена.

## Контроль соблюдения

- Фасады `createSender` и `createReceiver` требуют `RetryConfig`, в котором есть
  `deadLetter`. Это поле не опционально, и тип TypeScript обеспечивает его наличие на этапе
  компиляции.
- Алерты на рост `dlq_outbox_<svc>` и `dlq_inbox_<svc>` — операционный рубеж. Появление
  сообщений в любой из DLQ означает системный отказ, который стоит расследовать, а не
  временную повторную попытку.
- Код-ревью: ни один блок `catch` в обработчике сообщений не вправе вернуть `'ack'` или
  `undefined`, не записав в DLQ и не пробросив ошибку дальше.

## Смотрите также

Outbox и идемпотентный потребитель, против которых работает relay отправителя, разобраны в
[Transactional outbox + идемпотентный потребитель](/kb/backend-events/transactional-outbox-idempotent-consumer).
Правило о том, что ошибки нельзя глотать, действует и здесь:
[никогда не глотайте ошибки](/kb/error-handling/never-swallow-errors).
