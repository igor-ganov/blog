---
title: 'Fai il parsing, non la validazione'
category: functional-architecture
summary: 'A ogni confine del sistema fai il parsing dell''input grezzo in un tipo preciso una sola volta; il codice a valle lavora sul tipo già ottenuto e non ricontrolla né esegue cast.'
principle: 'Al confine, trasforma l''input non tipizzato in un tipo preciso una sola volta; il codice a valle riceve il tipo già ottenuto e non ricontrolla né esegue cast.'
severity: strong
tags: [functional-architecture, parsing, validation, effect-schema, type-safety, boundaries]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-03-24
    note: 'Decoder Effect.Schema in src/validation/ usati in tutto un refactoring importante.'
  - project: 'un bot edge (Cloudflare Workers)'
    date: 2026-05-23
    note: 'Client producer tipizzato con guard a runtime che fanno il parsing del JSON al confine in src/util/json.ts.'
related:
  - typescript/validate-at-the-boundary
  - typescript/no-casting
  - functional-architecture/errors-as-values-with-effect
order: 6
updated: 2026-06-10
---

Una funzione che valida restituisce un `boolean`. Calcola se l'input rispetta una certa
forma, poi butta via la risposta. Chi la chiama resta in mano lo stesso valore non
tipizzato di partenza, quindi per usarlo come il tipo atteso deve fare un cast. Il cast non
è verificato. Afferma la forma esatta che il validatore ha appena controllato, ma niente nel
compilatore lega tra loro questi due fatti. Ti si crede sulla parola.

Una funzione che fa il parsing restituisce il valore tipizzato o un errore. Il controllo di
conformità e l'assegnazione del tipo sono la stessa operazione, quindi non c'è alcun cast.
Il codice a valle riceve un valore che ha già il tipo preciso. Non ricontrolla mai, e non
può dimenticarsi di controllare.

L'espressione viene dal saggio del 2019 di Alexis King "Parse, don't validate". In questo
codebase la pratica poggia su Effect.Schema e su guard a runtime scritte in punti di
confine espliciti.

## Perché conta

Un refactoring importante di una SPA di amministrazione contenuti (2026-03-24) ha messo i
decoder Effect.Schema in `src/validation/`. Ogni valore che entrava nel layer service-worker
o client, che venisse da una risposta di rete, da un `postMessage` o da `IndexedDB`, veniva
decodificato attraverso uno Schema. Il decoder restituiva un valore completamente tipizzato
oppure faceva fallire la pipeline Effect con un `ParseError` strutturato. Dentro il confine
non trovi `as`, una `JSON.parse` nuda, né controlli difensivi con `typeof`.

Un progetto di bot edge (2026-05-23) ha usato la stessa disciplina in `src/util/json.ts`. Il
client producer tirava giù JSON grezzo da una coda esterna, e tutto il parsing avveniva in
`json.ts` prima che qualcosa raggiungesse la logica di business. L'interfaccia tipizzata del
client a valle non vedeva mai `unknown`.

In entrambi i casi il file di confine funziona da marcatore fisico. Il codice sopra è non
tipizzato, quello sotto è tipizzato, e il parser è ciò che ti porta dall'altra parte.

## Come applicarlo

**Confronto: validare (informazione persa) contro fare parsing (informazione conservata).**

```ts
// Bad: validator — returns boolean; caller must cast; type system is bypassed
const isUser = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof (value as { id: unknown }).id === 'string'; // already forced to cast here

const handleResponse = async (res: Response): Promise<void> => {
  const raw = await res.json();
  if (!isUser(raw)) throw new Error('Invalid user');
  const user = raw as User;   // ← cast; compiler trusts you, not the check
  processUser(user);
};

// Good: parser — returns User or fails; no cast anywhere
import { Schema, Effect } from 'effect';

const UserSchema = Schema.Struct({
  id:    Schema.String,
  name:  Schema.String,
  email: Schema.String,
});

type User = Schema.Schema.Type<typeof UserSchema>;

const parseUser = Schema.decode(UserSchema);
// Type: (u: unknown) => Effect.Effect<User, ParseError>

const handleResponse = (res: Response): Effect.Effect<void, ParseError | HttpError> =>
  pipe(
    Effect.tryPromise({ try: () => res.json(), catch: (e) => new HttpError(e) }),
    Effect.flatMap(parseUser),
    Effect.flatMap(processUser), // processUser receives User, not unknown
  );
```

`processUser` non vede mai `unknown`, e non può girare finché il parsing non è già andato a
buon fine. Non c'è alcun cast da scrivere, nessuno da revisionare, e nessuno che resti
obsoleto quando `User` cambia forma.

**Il file di confine come punto di transizione.**

```ts
// src/util/json.ts — the boundary; only file that touches `unknown`
import { Schema, Effect, pipe } from 'effect';

export const decodeJson =
  <A, I>(schema: Schema.Schema<A, I>) =>
  (raw: unknown): Effect.Effect<A, ParseError> =>
    Schema.decode(schema)(raw);

// All other files import typed values, never raw JSON
```

```ts
// src/sync/process-sync-message.ts — downstream; no unknown, no cast
import { decodeJson } from '../util/json';
import { SyncMessageSchema, type SyncMessage } from './sync-message-schema';

const parseSyncMessage = decodeJson(SyncMessageSchema);

export const processSyncMessage = (
  raw: unknown,
): Effect.Effect<void, ParseError | SyncError> =>
  pipe(
    parseSyncMessage(raw),
    Effect.flatMap(dispatchSyncMessage),
  );
```

**Restringimento incrementale con Schema.**

Quando il tipo completo lo conosci solo dopo aver controllato un discriminante, usa
`Schema.Union` con `Schema.Literal` e lascia che sia lui a restringere per te:

```ts
const ApiResponseSchema = Schema.Union(
  Schema.Struct({ _tag: Schema.Literal('ok'),    data: UserSchema }),
  Schema.Struct({ _tag: Schema.Literal('error'), message: Schema.String }),
);

type ApiResponse = Schema.Schema.Type<typeof ApiResponseSchema>;

// After decode, _tag narrows the union — no manual type guard needed
const render = (response: ApiResponse): string => {
  switch (response._tag) {
    case 'ok':    return response.data.name;   // data: User — fully typed
    case 'error': return response.message;
    default: {
      const _: never = response;
      return _;
    }
  }
};
```

**Type guard come ripiego (quando Effect non è disponibile).**

Dove il costo del bundle di Effect è troppo alto per giustificarlo (vedi
[errors-as-values-with-effect](/principles/functional-architecture/errors-as-values-with-effect)
per i casi in cui vale questa eccezione), scrivi una vera guard con type-predicate invece di
un validatore booleano:

```ts
// Acceptable fallback: predicate guard — the check and the type are connected
const parseUser = (value: unknown): User | undefined => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value && typeof (value as Record<string, unknown>).id === 'string' &&
    'name' in value && typeof (value as Record<string, unknown>).name === 'string' &&
    'email' in value && typeof (value as Record<string, unknown>).email === 'string'
  ) {
    return value as User; // the only acceptable cast: immediately after exhaustive check
  }
  return undefined;
};
```

Anche qui il cast resta dentro l'unica funzione che ha eseguito il controllo. Nessun altro
file fa cast.

## Anti-pattern

```ts
// ❌ Boolean validator — caller must cast; two separate operations, easy to skip one
const validate = (v: unknown): boolean => typeof v === 'object' && v !== null && 'id' in v;
const data = raw as Entity; // ← cast without running the validator

// ❌ Parsing deep inside business logic — the boundary is invisible; unknown leaks in
const applyDiscount = (raw: unknown): number => {
  const order = raw as Order; // trust, no check
  return order.total * 0.9;
};

// ❌ Re-parsing at multiple call sites — parsing is not centralised; schema drift
//    between sites is invisible
// component-a.ts: Schema.decode(OrderSchemaV1)(raw)
// component-b.ts: Schema.decode(OrderSchemaV2)(raw)  // different schema, no error

// ❌ JSON.parse without decoding — raw object flows into business logic as unknown
const order: Order = JSON.parse(localStorage.getItem('order')!); // cast + no check
```

Ognuno di questi ha lo stesso difetto. Input non tipizzato raggiunge codice che lo dà per
tipizzato, e il compilatore non ha mai controllato quell'assunzione. Quando l'input non
corrisponde, l'errore salta fuori lontano dal punto in cui il valore non tipizzato è entrato
la prima volta.

## Applicazione automatica

- `@typescript-eslint/no-explicit-any` e `biome/noExplicitAny` impediscono che `any`
  mascheri input non tipizzato.
- `biome/noNonNullAssertion` e `@typescript-eslint/no-non-null-assertion` impediscono le
  asserzioni non-null su valori che non sono stati sottoposti a parsing.
- Convenzione architetturale: qualunque file che importa da un modulo del layer di confine
  (`src/util/json.ts`, `src/validation/`) riceve un valore tipizzato; non deve chiamare
  `JSON.parse` né accedere a `.json()` su una `Response` direttamente.

I file di confine sono l'unico posto dove `unknown` è ammesso, e le regole di lint coprono il
resto. L'unico cast con `as` permesso vive dentro la funzione di parsing che ha eseguito il
controllo esaustivo.
