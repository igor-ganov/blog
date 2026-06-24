---
title: 'Telemetry must never crash the app'
category: backend-events
summary: 'Instrumentation failures are always no-ops, never crashes; design spans deliberately and keep the viewer pluggable via OTLP.'
principle: 'Instrumentation failures are always no-ops, never crashes; design spans deliberately (queues are a PRODUCER/CONSUMER span pair, brokers do not emit spans, /health is not traced); keep the viewer pluggable via OTLP.'
severity: strong
tags: [backend-events, telemetry, opentelemetry, tracing, observability]
sources:
  - project: 'an event-sourcing service'
    date: 2026-05-12
    note: 'telemetry failure is a no-op; deliberate span design; pluggable OTLP viewer'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - error-handling/never-swallow-errors
order: 6
updated: 2026-05-12
---

Observability tooling exists to help you debug production problems. If that tooling can
itself crash the application, it has inverted its purpose, causing the failures it was
supposed to reveal. So the rule is absolute: instrumentation code must never propagate
exceptions to the application. Every call into the telemetry SDK is wrapped so that a
failure becomes, at most, a logged warning.

The event-sourcing service implemented full OpenTelemetry tracing and logs over
OTLP/HTTP and encoded this constraint explicitly on 2026-05-12.

## Why this matters

The failure scenario is easy to picture. The OTLP collector is unavailable (restarted,
misconfigured, network partition), and a service method calls `span.end()` or
`tracer.startSpan()`. If those calls throw because the SDK's internal transport is in a
bad state, and the exception propagates, a tracing outage becomes a service outage. The
service was healthy and processing events correctly, and the observability layer took it
down.

The second risk is subtler. Span design is not free-form. Start spans carelessly (for
every function call, for health checks, for broker internal operations) and the trace
volume explodes, the viewer becomes unreadable, and cost per event climbs. Deliberate
span design means knowing what deserves a span and what does not.

The design decisions on this:

- A telemetry failure is a no-op, never a crash.
- Brokers do not emit spans. The queue boundary is modelled as a PRODUCER/CONSUMER
  span pair: the producer closes its span before enqueuing, the consumer starts a new
  span on receive, and the two are linked via `traceparent` in the message attributes.
  The broker itself (SQS, RabbitMQ) does not participate in the trace.
- /health is not traced. Health endpoints are polled at high frequency by load
  balancers and produce noise with zero signal.
- The viewer is pluggable via `OTEL_EXPORTER_OTLP_ENDPOINT`: OpenObserve, Aspire,
  LGTM, Uptrace, or any OTLP-compatible backend. No SDK changes, no redeploy.

OTel manual instrumentation works on Bun as of the time of this decision, which resolved
an earlier concern about runtime compatibility.

## How to apply

### Wrap every telemetry call — no-op on failure

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

The wrapped function always runs, and it always returns its result or rethrows its error.
The telemetry layer can fail at any point without affecting the outcome.

### PRODUCER/CONSUMER span pair across a queue boundary

The broker does not emit spans. The producer closes its span before writing the message
to the queue. The consumer starts a new span on receive and links it to the producer span
using the `traceparent` attribute carried in the message.

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

You get one trace with two linked spans, PRODUCER in the relay service and CONSUMER in
the worker service. The SQS hop is invisible, but the causality is preserved.

### Do not trace /health

Health endpoints are called every few seconds by load balancers. Tracing them produces
noise with no diagnostic value and inflates trace storage cost.

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

### Pluggable viewer via environment variable

No code changes are needed to switch between OTLP viewers. The SDK reads the endpoint
from the environment.

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

Switching from OpenObserve to Aspire Dashboard locally is a one-line `.env` change:

```
# .env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:18889   # openobserve
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  # aspire dashboard
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317  # lgtm / grafana
```

## Anti-patterns

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

These let the observability layer hurt the thing it is meant to observe: crashing the app
on a transient failure, inflating cost and trace noise, breaking the trace across a queue
boundary, or swallowing the application error inside telemetry code, which directly
violates [never swallow errors](/principles/error-handling/never-swallow-errors).

## Enforcement

- Code review: every `tracer.startSpan` call must be inside a `try/catch` or wrapped in
  the `withSpan` utility. Bare SDK calls in handlers are a review failure.
- `/health` is explicitly excluded from the `withSpan` wrapper by convention — document
  this in the router module's README.
- The `OTEL_EXPORTER_OTLP_ENDPOINT` variable must be set to a non-empty value in every
  environment's config, with no default hardcoded in the SDK setup — this forces the
  deployer to make a deliberate viewer choice and makes it impossible to silently emit
  to a default endpoint.

## See also

The end-to-end trace that follows an event across producer, relay, and worker services
relies on the outbox and delivery pattern described in
[Transactional outbox + idempotent consumer](/principles/backend-events/transactional-outbox-idempotent-consumer).
The application-error side of the no-swallow rule is in
[never swallow errors](/principles/error-handling/never-swallow-errors).
