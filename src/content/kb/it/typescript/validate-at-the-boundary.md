---
title: 'Valida al confine, calcola all''interno'
category: typescript
summary: 'Analizza e valida i dati esterni non tipizzati una sola volta, al punto d''ingresso; ovunque dentro il sistema i dati sono già tipizzati e nessun cast serve.'
principle: 'I dati non tipizzati vengono validati una volta sola, al confine, con un vero controllo a runtime; dentro il sistema è già tutto tipizzato, quindi non si fa nessun cast.'
severity: strong
tags: [typescript, type-safety, validation, parsing]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-03-24
    note: 'decoder Effect.Schema in src/validation; valida al confine, calcola internamente; trasformazioni di tipo deterministiche'
  - project: 'un bot edge (Cloudflare Workers)'
    date: 2026-05-23
    note: 'guard a runtime in src/util/json.ts hanno tenuto fede a no-any/no-as'
related:
  - typescript/no-casting
  - functional-architecture/parse-dont-validate
  - functional-architecture/errors-as-values-with-effect
order: 3
updated: 2026-06-10
---

## Perché conta

Il sistema di tipi di TypeScript copre ogni riga di codice che riesce a vedere. Quello che non vede è tutto ciò che arriva dalla rete, esce da `localStorage`, viene passato come argomento da CLI o atterra in un webhook di terze parti. In quei punti d'ingresso il valore a runtime è `unknown`, e il riflesso è scacciarlo con un cast: `const config = JSON.parse(raw) as Config`. Lo squiggle rosso sparisce, ma ora l'annotazione promette `Config` mentre il valore reale potrebbe essere qualunque cosa.

Quella falsa promessa tende a viaggiare. Sopravvive finché non raggiunge una funzione che dipende da una forma precisa, e a quel punto il fallimento è lontano dal cast sbagliato. Lo stack trace punta al posto sbagliato e la causa vera resta nascosta.

Quindi valida una volta, al bordo. Analizza il valore sconosciuto trasformandolo in uno tipizzato, oppure fallisci rumorosamente con un errore esplicito. Superato quell'unico checkpoint, ogni funzione interna riceve un tipo di cui può davvero fidarsi, senza cast, senza `typeof` difensivi sparsi qua e là, e senza quelle catene di `as unknown as T`.

Due progetti hanno cucito questa regola dentro infrastruttura reale.

**Una SPA di amministrazione contenuti (2026-03-24/25)**: un grosso refactoring ha introdotto `src/validation/` con decoder Effect.Schema per ogni forma di dato esterno, coprendo risposte API, invio di form e stato persistito. La nota di design dice: "validate at boundaries / compute internally; deterministic type transformations." Ogni layer API passa la propria risposta attraverso un decoder prima di consegnarla al codice di dominio. Saltare quel passaggio era la causa profonda di un'intera classe di bug di corruzione silenziosa dei dati che il refactoring è poi andato a sistemare.

**Un bot edge (Cloudflare Workers) (2026-05-23)**: uno strumento CLI leggero senza dipendenze da framework. Invece di tirare dentro Effect, il team ha scritto guard a runtime manuali in `src/util/json.ts`. Il vincolo era identico: niente `any`, niente `as`. Le guard restituivano risultati tipizzati o lanciavano errori descrittivi, e il codice interno non portava alcuna asserzione di tipo.

## Come applicarlo

### 1. Tratta ogni input esterno come unknown

Assegna `unknown` al valore grezzo e imponi un passaggio di parsing prima dell'uso.

```typescript
// src/boundary/api.ts

// Bad — cast silences the compiler, but the value is still unknown at runtime
const fetchConfig = async (): Promise<Config> => {
  const res = await fetch('/api/config');
  return res.json() as Config; // lie
};

// Good — parse and validate; return a typed result or fail explicitly
import { Schema } from 'effect';

const ConfigSchema = Schema.Struct({
  apiUrl: Schema.String,
  timeout: Schema.Number,
  featureFlags: Schema.Array(Schema.String),
});

type Config = Schema.Schema.Type<typeof ConfigSchema>;

const fetchConfig = async (): Promise<Config> => {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw: unknown = await res.json();
  return Schema.decodeUnknownSync(ConfigSchema)(raw);
  // Throws a descriptive ParseError if the shape is wrong.
  // Domain code receives a Config it can trust.
};
```

### 2. Scrivi funzioni guard a runtime per i contesti leggeri

Quando Effect non è in gioco, basta un type guard ristretto. Valida comunque, restituisce comunque un valore tipizzato ed evita comunque l'`as`.

```typescript
// src/util/json.ts  (edge bot pattern, 2026-05-23)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasStringField = (obj: Record<string, unknown>, key: string): boolean =>
  key in obj && typeof obj[key] === 'string';

interface StoredSession {
  token: string;
  expiresAt: number;
}

const parseStoredSession = (raw: unknown): StoredSession => {
  if (!isRecord(raw)) throw new Error('session: expected object');
  if (!hasStringField(raw, 'token')) throw new Error('session: missing token');
  if (typeof raw['expiresAt'] !== 'number') throw new Error('session: expiresAt must be a number');
  return { token: raw['token'] as string, expiresAt: raw['expiresAt'] };
  //                            ^^^^^^^^ only cast after the runtime check proves the type
};

// Caller
const session = parseStoredSession(JSON.parse(localStorage.getItem('session') ?? '{}'));
// session is StoredSession — no assertion needed downstream
```

L'unico `as string` dopo il controllo esplicito con `typeof` va bene. La guard ha già dimostrato il tipo, quindi il cast registra un fatto che hai verificato invece di un'ipotesi che speri regga. È una cosa diversa dal castare l'intero oggetto analizzato in un colpo solo.

### 3. Centralizza i decoder in un solo layer

Metti tutti i decoder di confine in un modulo dedicato (`src/validation/`, `src/boundary/` o `src/decoders/`). Il codice di dominio importa valori tipizzati da quel layer e non tocca mai direttamente `Schema` o le utility di guard.

```
src/
  boundary/
    api.ts          ← fetchConfig, fetchIssues — all decoders live here
    local-storage.ts ← parseStoredSession, parseUserPrefs
  domain/
    config.ts       ← uses Config type; no decoding logic
    issue.ts        ← uses Issue type; no decoding logic
```

L'audit diventa economico: quando uno schema cambia, c'è esattamente un file da toccare.

### 4. Restituisci errori tipizzati invece di lanciare, dove ha senso

Se stai già usando Effect o tipi Result, decodifica in un `Either` invece di lanciare. Così i fallimenti di validazione finiscono nel tipo di ritorno esplicito, e chi chiama deve per forza gestirli.

```typescript
import { Schema, Either } from 'effect';

const decodeConfig = (raw: unknown): Either.Either<Config, string> =>
  Either.mapLeft(
    Schema.decodeUnknownEither(ConfigSchema)(raw),
    (err) => `Config parse error: ${err.message}`,
  );

// Caller
const result = decodeConfig(raw);
if (Either.isLeft(result)) {
  logger.error(result.left);
  return;
}
const config = result.right; // Config — fully typed
```

Vedi [errors-as-values-with-effect](/principles/functional-architecture/errors-as-values-with-effect) per il pattern completo.

## Anti-pattern

### Castare il valore analizzato

```typescript
// Bad
const config = JSON.parse(raw) as Config;

// Symptom: config.featureFlags.map(...) throws "featureFlags is not a function"
// because featureFlags was actually a string in the stored JSON.
// The error appears in domain code, not at the parse site.
```

Il cast è solo un'eccezione a runtime che hai rimandato, e atterra in un punto che non riconduce alla causa.

### Validare in profondità dentro la logica di dominio

```typescript
// Bad — domain function does its own ad-hoc shape check
const applyConfig = (config: Config): void => {
  if (typeof config.timeout !== 'number') {
    console.warn('bad config, using default');
    config = defaultConfig; // mutation + hidden fallback
  }
  // ...
};
```

**Sintomo**: la logica di validazione è sparpagliata per il dominio, i default nascondono in silenzio dati corrotti, e il tipo "validato" non è mai garantito davvero.

### Usare any come tipo di transito

```typescript
// Bad
const raw: any = await res.json();
const config: Config = raw; // no error, no check

// Symptom: identical to the cast case — silent lie, remote failure.
```

`any` spegne il type checker. Una volta che un valore è `any` non si torna indietro, e la bugia si propaga a ogni funzione che il valore raggiunge.

### Validazione parziale

```typescript
// Bad — validates one field, ignores the rest
const parseConfig = (raw: unknown): Config => {
  if (!isRecord(raw)) throw new Error('not an object');
  return raw as Config; // cast after minimal check
};
```

**Sintomo**: i campi non controllati esplodono nel codice di dominio. La validazione parziale è peggio di nessuna validazione, perché ti dà un falso senso di sicurezza sopra lo stesso identico fallimento.

## Come imporlo

- Abilita `@typescript-eslint/no-explicit-any` e `@typescript-eslint/no-unsafe-assignment` — entrambi segnalano i pattern qui sopra a tempo di lint.
- In CI, esegui `tsc --noEmit` con `strict: true`. Un valore analizzato come si deve non ha mai bisogno di `as`, quindi un cast che spunta è il segno che qualcuno ha aggirato il confine.
- Checklist di code review: ogni funzione che chiama `JSON.parse`, `res.json()`, `localStorage.getItem`, `process.env` o `process.argv` deve far passare il proprio risultato attraverso un decoder nello stesso file prima di restituirlo.

## Vedi anche

- [No casting](/principles/typescript/no-casting) — spiega perché `as` non sostituisce un vero controllo a runtime.
- [No null — modella l'assenza con undefined](/principles/typescript/no-null-use-undefined) — la normalizzazione di null fa parte della validazione al confine.
- [Parse, don't validate](/principles/functional-architecture/parse-dont-validate) — l'inquadramento dello stesso principio nell'architettura funzionale.
