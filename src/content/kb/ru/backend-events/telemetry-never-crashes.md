---
title: 'Телеметрия не должна ронять приложение'
category: backend-events
summary: 'Сбой инструментирования — всегда no-op, никогда не падение; проектируйте спаны осознанно и держите вьюер сменным через OTLP.'
principle: 'Сбой инструментирования — всегда no-op, никогда не падение; проектируйте спаны осознанно (очередь — это пара спанов PRODUCER/CONSUMER, брокеры спанов не порождают, /health не трассируется); держите вьюер сменным через OTLP.'
severity: strong
tags: [backend-events, telemetry, opentelemetry, tracing, observability]
sources:
  - project: 'сервис на event sourcing'
    date: 2026-05-12
    note: 'сбой телеметрии — no-op; осознанное проектирование спанов; сменный вьюер OTLP'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - error-handling/never-swallow-errors
order: 6
updated: 2026-05-12
---

Инструменты наблюдаемости нужны, чтобы помогать отлаживать проблемы на проде. Если такой
инструмент способен сам уронить приложение, он работает против своей цели и сам порождает
те сбои, которые должен был показывать. Поэтому правило жёсткое: код инструментирования
никогда не пробрасывает исключения в приложение. Каждый вызов в SDK телеметрии обёрнут так,
что сбой превращается максимум в записанное в лог предупреждение.

Сервис на event sourcing реализовал полную трассировку OpenTelemetry и логи поверх
OTLP/HTTP и явно зафиксировал это ограничение 2026-05-12.

## Почему это важно

Сценарий отказа легко представить. Коллектор OTLP недоступен (перезапуск, кривая
конфигурация, сетевое разбиение), и метод сервиса вызывает `span.end()` или
`tracer.startSpan()`. Если эти вызовы бросят исключение из-за того, что внутренний
транспорт SDK в плохом состоянии, и исключение пробросится наверх, простой трассировки
превратится в простой сервиса. Сервис был исправен и корректно обрабатывал события — а
слой наблюдаемости его положил.

Второй риск тоньше. Проектирование спанов — не свободная импровизация. Заводи спаны
бездумно (на каждый вызов функции, на health-check, на внутренние операции брокера) — и
объём трасс взрывается, вьюер становится нечитаемым, а стоимость на событие растёт.
Осознанное проектирование спанов означает понимание того, что заслуживает спана, а что нет.

Принятые по этому поводу решения:

- Сбой телеметрии — **всегда no-op**, никогда не падение.
- **Брокеры не порождают спанов.** Граница очереди моделируется парой спанов
  PRODUCER/CONSUMER: продюсер закрывает свой спан перед постановкой в очередь, консьюмер
  при получении открывает новый спан, и эти двое связываются через `traceparent` в
  атрибутах сообщения. Сам брокер (SQS, RabbitMQ) в трассе не участвует.
- **/health не трассируется.** Эндпоинты здоровья балансировщики опрашивают с высокой
  частотой, и они дают шум при нулевом сигнале.
- Вьюер сменный через `OTEL_EXPORTER_OTLP_ENDPOINT`: OpenObserve, Aspire,
  LGTM, Uptrace или любой OTLP-совместимый бэкенд. Без правок в SDK, без передеплоя.

Ручное инструментирование OTel работает на Bun на момент этого решения, что сняло
прежнее опасение насчёт совместимости с рантаймом.

## Как применять

### Оборачивайте каждый вызов телеметрии — no-op при сбое

```ts
// event-service/src/telemetry/safe-span.ts

import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import type { Span, SpanOptions } from '@opentelemetry/api';

type SpanFn<T> = (span: Span) => Promise<T>;

const noOpSpan: Span = {
  setAttribute: () => noOpSpan,
  setStatus: () => noOpSpan,
  recordException: () => undefined,
  end: () => undefined,
  isRecording: () => false,
  addEvent: () => noOpSpan,
  updateName: () => noOpSpan,
  setAttributes: () => noOpSpan,
  spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
  addLink: () => noOpSpan,
  addLinks: () => noOpSpan,
};

export const withSpan =
  (tracerName: string) =>
  (name: string, options?: SpanOptions) =>
  async <T>(fn: SpanFn<T>): Promise<T> => {
    let span: Span = noOpSpan;

    try {
      span = trace.getTracer(tracerName).startSpan(name, options);
    } catch {
      // tracer unavailable — continue with no-op span, do not crash
    }

    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        () => fn(span),
      );
      try {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      } catch {
        // span.end failure — no-op
      }
      return result;
    } catch (err) {
      try {
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
      } catch {
        // telemetry failure on error path — no-op; the real error still propagates
      }
      throw err; // the application error is never swallowed
    }
  };
```

Обёрнутая функция выполняется всегда и всегда либо возвращает свой результат, либо
перебрасывает свою ошибку. Слой телеметрии может упасть в любой точке, не влияя на исход.

### Пара спанов PRODUCER/CONSUMER через границу очереди

Брокер не порождает спанов. Продюсер закрывает свой спан перед записью сообщения в
очередь. Консьюмер при получении открывает новый спан и связывает его со спаном продюсера
через атрибут `traceparent`, который несёт сообщение.

```ts
// Producer side — in the relay, before publishing to SQS
const publishWithTrace = async (msg: OutboxMessage): Promise<void> => {
  await withSpan('event-source')('relay.publish', { kind: SpanKind.PRODUCER })(
    async (span) => {
      // Inject traceparent into the message attributes for the consumer to pick up.
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);

      await sqsClient.sendMessage({
        QueueUrl: env.QUEUE_URL,
        MessageBody: JSON.stringify(msg),
        MessageAttributes: {
          traceparent: {
            DataType: 'String',
            StringValue: carrier['traceparent'] ?? '',
          },
        },
      });

      span.setAttribute('messaging.destination', env.QUEUE_URL);
      span.setAttribute('messaging.message_id', msg.eventId);
    },
  );
  // Producer span ends here. The broker is opaque to the trace.
};

// Consumer side — on message receive
const receiveWithTrace = async (sqsMsg: SqsMessage): Promise<void> => {
  // Extract traceparent from message attributes to link spans across the queue boundary.
  const carrier: Record<string, string> = {
    traceparent: sqsMsg.messageAttributes?.['traceparent']?.stringValue ?? '',
  };
  const parentContext = propagation.extract(context.active(), carrier);

  await context.with(parentContext, () =>
    withSpan('event-source')('worker.receive', { kind: SpanKind.CONSUMER })(
      async (span) => {
        span.setAttribute('messaging.message_id', sqsMsg.messageId ?? '');
        await handleEvent(parseInboundEvent(sqsMsg.body));
      },
    ),
  );
};
```

Получаешь одну трассу с двумя связанными спанами: PRODUCER в сервисе relay и CONSUMER в
сервисе worker. Прыжок через SQS не виден, но причинно-следственная связь сохранена.

### Не трассируйте /health

Эндпоинты здоровья балансировщики дёргают каждые несколько секунд. Их трассировка даёт
шум без диагностической ценности и раздувает стоимость хранения трасс.

```ts
// event-service/src/api/router.ts

import { withSpan } from '../telemetry/safe-span';

// Health endpoint — no span, no trace
const handleHealth = (_req: Request): Response =>
  new Response(JSON.stringify({ status: 'ok' }), {
    headers: { 'Content-Type': 'application/json' },
  });

// Business endpoint — traced
const handleIngestEvent = async (req: Request): Promise<Response> =>
  withSpan('event-service-api')('api.ingest_event')(async (span) => {
    const body: unknown = await req.json();
    span.setAttribute('event.topic', (body as Record<string, unknown>)['topic'] as string ?? '');
    // ... handler body
    return new Response(null, { status: 202 });
  });
```

### Сменный вьюер через переменную окружения

Чтобы переключаться между вьюерами OTLP, правок в коде не нужно. SDK читает эндпоинт из
окружения.

```ts
// event-service/src/telemetry/setup.ts

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

const initTelemetry = (): void => {
  try {
    const sdk = new NodeSDK({
      // Reads OTEL_EXPORTER_OTLP_ENDPOINT from env automatically.
      // Switch viewers by setting: openobserve, aspire, lgtm, uptrace — same code.
      traceExporter: new OTLPTraceExporter(),
      logRecordProcessor: new SimpleLogRecordProcessor(new OTLPLogExporter()),
    });
    sdk.start();
  } catch (err) {
    // SDK init failure — app continues without telemetry, does not crash
    console.warn('Telemetry init failed — running without instrumentation', err);
  }
};

initTelemetry();
```

Переключение с OpenObserve на Aspire Dashboard локально — это правка одной строки в `.env`:

```
# .env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:18889   # openobserve
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  # aspire dashboard
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317  # lgtm / grafana
```

## Антипаттерны

```ts
// Bad: telemetry call outside a try/catch — SDK failure crashes the handler.
const handleRequest = async (req: Request): Promise<Response> => {
  const span = tracer.startSpan('handle_request'); // throws if collector is down
  const result = await processRequest(req);
  span.end();
  return result;
};


// Bad: tracing /health — produces noise, no signal.
const handleHealth = async (_req: Request): Promise<Response> =>
  withSpan('api')('health.check')(async () =>           // wasted trace budget
    new Response(JSON.stringify({ status: 'ok' }))
  );


// Bad: expecting the broker to propagate trace context automatically.
// SQS does not inject or extract traceparent. Manual propagation via message
// attributes is the only way to link producer and consumer spans.
await sqsClient.sendMessage({ MessageBody: JSON.stringify(msg) });
// Consumer starts a new root trace — no link to the producer. Two disconnected traces.


// Bad: swallowing the application error in the span error handler.
try {
  await processEvent(event);
} catch (err) {
  span.recordException(err);
  // forgot to rethrow — event silently not processed, message acked
}
```

Первый роняет приложение на временном сбое телеметрии. Второй раздувает стоимость и шум в
трассах. Третий даёт несвязанные трассы, которые не получится проследить через границу
очереди. Четвёртый проглатывает прикладную ошибку внутри кода телеметрии, что напрямую
нарушает [правило не глотать ошибки](/principles/error-handling/never-swallow-errors).

## Контроль соблюдения

- Код-ревью: каждый вызов `tracer.startSpan` должен быть внутри `try/catch` либо обёрнут в
  утилиту `withSpan`. Голые вызовы SDK в обработчиках — повод завернуть на ревью.
- `/health` по соглашению явно исключён из обёртки `withSpan` — задокументируй это
  в README модуля роутера.
- Переменная `OTEL_EXPORTER_OTLP_ENDPOINT` должна быть задана непустым значением в конфиге
  каждого окружения, без захардкоженного дефолта в настройке SDK — это заставляет
  деплоящего осознанно выбрать вьюер и делает невозможной тихую отправку в дефолтный
  эндпоинт.

## Смотрите также

Сквозная трасса, которая ведёт событие через сервисы producer, relay и worker, опирается
на паттерн outbox и доставки, описанный в
[Transactional outbox + idempotent consumer](/principles/backend-events/transactional-outbox-idempotent-consumer).
Сторона прикладной ошибки в правиле «не глотать» разобрана в
[never swallow errors](/principles/error-handling/never-swallow-errors).
