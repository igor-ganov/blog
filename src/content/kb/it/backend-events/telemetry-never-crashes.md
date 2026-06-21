---
title: 'La telemetria non deve mai mandare in crash l''app'
category: backend-events
summary: 'I guasti della strumentazione sono sempre no-op, mai crash; progetta gli span con criterio e tieni il viewer sostituibile via OTLP.'
principle: 'I guasti della strumentazione sono sempre no-op, mai crash; progetta gli span con criterio (le code sono una coppia di span PRODUCER/CONSUMER, i broker non emettono span, /health non viene tracciato); tieni il viewer sostituibile via OTLP.'
severity: strong
tags: [backend-events, telemetry, opentelemetry, tracing, observability]
sources:
  - project: 'un servizio di event sourcing'
    date: 2026-05-12
    note: 'il guasto della telemetria è un no-op; progettazione deliberata degli span; viewer OTLP sostituibile'
related:
  - backend-events/transactional-outbox-idempotent-consumer
  - error-handling/never-swallow-errors
order: 6
updated: 2026-05-12
---

Gli strumenti di osservabilità servono a farti diagnosticare i problemi in produzione. Se
quegli strumenti possono mandare in crash l'applicazione, hanno ribaltato il loro scopo:
provocano proprio i guasti che dovevano rivelare. La regola quindi è assoluta: il codice
di strumentazione non deve mai propagare eccezioni all'applicazione. Ogni chiamata all'SDK
di telemetria è incapsulata in modo che un errore diventi, al massimo, un warning loggato.

Il servizio di event sourcing ha implementato il tracing OpenTelemetry completo e i log
su OTLP/HTTP, e ha messo nero su bianco questo vincolo il 2026-05-12.

## Perché è importante

Lo scenario di guasto è facile da immaginare. Il collector OTLP non è raggiungibile
(riavviato, mal configurato, partizione di rete) e un metodo del servizio chiama
`span.end()` o `tracer.startSpan()`. Se quelle chiamate lanciano un'eccezione perché il
trasporto interno dell'SDK è in uno stato instabile, e l'eccezione si propaga, un'interruzione
del tracing diventa un'interruzione del servizio. Il servizio era sano e processava gli
eventi correttamente, e lo strato di osservabilità lo ha buttato giù.

Il secondo rischio è più sottile. La progettazione degli span non è libera. Apri span con
leggerezza (per ogni chiamata di funzione, per gli health check, per le operazioni interne
del broker) e il volume di trace esplode, il viewer diventa illeggibile e il costo per
evento sale. Progettare gli span con criterio significa sapere cosa merita uno span e cosa
no.

Le decisioni di design su questo punto:

- Il guasto della telemetria è **sempre un no-op**, mai un crash.
- **I broker non emettono span.** Il confine della coda è modellato come una coppia di
  span PRODUCER/CONSUMER: il producer chiude il proprio span prima di accodare, il consumer
  apre un nuovo span alla ricezione, e i due sono collegati tramite `traceparent` negli
  attributi del messaggio. Il broker stesso (SQS, RabbitMQ) non partecipa alla trace.
- **/health non viene tracciato.** Gli endpoint di health vengono interrogati ad alta
  frequenza dai load balancer e producono rumore con segnale zero.
- Il viewer è sostituibile tramite `OTEL_EXPORTER_OTLP_ENDPOINT`: OpenObserve, Aspire,
  LGTM, Uptrace o qualsiasi backend compatibile con OTLP. Nessuna modifica all'SDK, nessun
  redeploy.

La strumentazione manuale di OTel funziona su Bun al momento di questa decisione, il che
ha risolto un dubbio iniziale sulla compatibilità del runtime.

## Come applicarlo

### Incapsula ogni chiamata di telemetria — no-op in caso di guasto

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

La funzione incapsulata viene sempre eseguita, e restituisce sempre il suo risultato o
rilancia il suo errore. Lo strato di telemetria può fallire in qualsiasi punto senza
incidere sull'esito.

### Coppia di span PRODUCER/CONSUMER attraverso il confine di una coda

Il broker non emette span. Il producer chiude il proprio span prima di scrivere il
messaggio nella coda. Il consumer apre un nuovo span alla ricezione e lo collega allo span
del producer usando l'attributo `traceparent` trasportato nel messaggio.

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

Ottieni una sola trace con due span collegati, PRODUCER nel servizio di relay e CONSUMER
nel servizio worker. Il salto via SQS è invisibile, ma la causalità viene preservata.

### Non tracciare /health

Gli endpoint di health vengono chiamati ogni pochi secondi dai load balancer. Tracciarli
produce rumore senza alcun valore diagnostico e gonfia il costo di archiviazione delle
trace.

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

### Viewer sostituibile tramite variabile d'ambiente

Non serve alcuna modifica al codice per passare da un viewer OTLP all'altro. L'SDK legge
l'endpoint dall'ambiente.

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

Passare da OpenObserve all'Aspire Dashboard in locale è una modifica di una riga nel
`.env`:

```
# .env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:18889   # openobserve
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  # aspire dashboard
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317  # lgtm / grafana
```

## Anti-pattern

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

Il primo manda in crash l'app per un guasto transitorio della telemetria. Il secondo
gonfia il costo e il rumore delle trace. Il terzo produce trace scollegate che non riesci
a seguire attraverso il confine di una coda. Il quarto inghiotte l'errore applicativo
dentro il codice di telemetria, il che viola direttamente
[non inghiottire mai gli errori](/kb/error-handling/never-swallow-errors).

## Come imporlo

- Code review: ogni chiamata `tracer.startSpan` deve stare dentro un `try/catch` o essere
  incapsulata nell'utility `withSpan`. Le chiamate nude all'SDK negli handler sono un
  motivo di rifiuto in review.
- `/health` è escluso esplicitamente dal wrapper `withSpan` per convenzione — documentalo
  nel README del modulo router.
- La variabile `OTEL_EXPORTER_OTLP_ENDPOINT` deve essere impostata a un valore non vuoto
  nella config di ogni ambiente, senza alcun default hardcoded nel setup dell'SDK: questo
  costringe chi fa il deploy a scegliere il viewer in modo deliberato e rende impossibile
  emettere in silenzio verso un endpoint di default.

## Vedi anche

La trace end-to-end che segue un evento attraverso i servizi producer, relay e worker si
appoggia sul pattern di outbox e delivery descritto in
[Transactional outbox + idempotent consumer](/kb/backend-events/transactional-outbox-idempotent-consumer).
Il lato dell'errore applicativo della regola del no-swallow è in
[non inghiottire mai gli errori](/kb/error-handling/never-swallow-errors).
