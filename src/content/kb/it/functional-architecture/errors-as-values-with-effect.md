---
title: 'Gli errori come valori — Effect solo quando ne paghi il runtime'
category: functional-architecture
summary: 'Errori e assenza sono sempre valori nel tipo, mai throw. Prendi Effect quando il progetto già sfrutta il suo runtime (concorrenza, scope, DI); per i semplici errori-come-valore un Result fatto a mano pesa circa 200 volte meno nel bundle.'
principle: 'Modella errori e assenza come valori nel tipo, composti nelle pipeline, mai lanciati. Usa Effect quando già usi il suo runtime (concorrenza strutturata, interruzione, scope/resource-safety, Layer/DI); se ti serve solo l''errore-come-valore, un Result come unione discriminata fatto a mano è la scelta più leggera.'
severity: context
tags: [functional-architecture, effect, error-handling, async, pipeline, bundle-size]
sources:
  - project: 'una SPA di content-admin'
    date: 2026-03-24
    note: 'Un grosso refactoring ha adottato Effect su larga scala: Effect.gen, Effect.tryPromise, Effect.forEach, Match nel core del SW; useAuth/useSWBridge sul client. Il costo del bundle è stato accettato perché il runtime veniva usato.'
  - project: 'uno standard di ingegneria'
    date: 2026-06-07
    note: 'Errori come valori; pipe/gen; Schema al confine; runSync/runPromise al bordo.'
  - project: 'una app frontend'
    date: 2026-06-10
    note: 'Andata avanti senza Effect, su funzioni result custom, per via del peso del bundle quando serviva solo l''errore-come-valore.'
  - project: 'misurazione del bundle'
    date: 2026-06-11
    note: 'bun build --minify, gzip: Result custom 286 B; solo Either di Effect 4.2 KB; Effect completo (gen+runPromise) 62 KB. Il tree-shaking rimuove i moduli irraggiungibili ma non può potare il runtime dei fiber che è raggiungibile.'
related:
  - error-handling/never-swallow-errors
  - typescript/validate-at-the-boundary
order: 4
updated: 2026-06-11
---

Un `throw` esce dallo stack di chiamate corrente e passa il controllo al primo
`catch` più in alto, oppure all'error handler del processo quando nessuno lo intercetta. Il
type system non ne sa nulla. Una funzione che lancia ha la stessa firma di una che non lo
fa, quindi chi la chiama non può ragionare su cosa può andare storto senza leggere
l'implementazione. Le catene di `Promise` improvvisate peggiorano le cose: `.catch` è
opzionale, le reiezioni non sono tipizzate, e qualsiasi `await` può ingoiare un errore
senza lasciare traccia.

Effect modella la logica fallibile e asincrona come valori. Un `Effect<A, E, R>` descrive
una computazione che, quando eseguita, può avere successo con `A`, fallire con `E`, o
richiedere i servizi `R`. Il tipo dell'errore `E` sta nella firma dove non può essere
ignorato, e gli operatori di composizione (`pipe`, `Effect.gen`, `Effect.map`,
`Effect.flatMap`) ti costringono a gestire i percorsi d'errore prima che la pipeline
finisca.

## Perché conta

L'invariante che non è in discussione: errori e assenza sono *valori nel tipo*,
composti nelle pipeline, non lanciati. `throw` cancella l'errore dalla firma, e un
`Result`/`Either`/`Effect` lo rimette. Su questo non si torna indietro.

La scelta da fare è **il veicolo**, e a deciderla è il bundle. Effect è un runtime, non una
libreria di gestione errori: uno scheduler di fiber, un loop interprete, l'interruzione, lo
scope/resource-safety, e un grafo di dipendenze `Layer`. Quando esegui un `Effect`, paghi
quel runtime che tu lo usi oppure no.

**Misurato (`bun build --minify`, gzip):**

| Approccio | min+gzip | vs custom |
| --- | --- | --- |
| `Result` custom (unione discriminata + `map`/`flatMap`/`match`) | **286 B** | 1× |
| Solo il modulo `Either` di Effect (nessun runtime) | **4.2 KB** | ~15× |
| Effect completo (`Effect.gen` + `runPromise`) | **62 KB** | ~217× |

Ogni caso esegue lo *stesso* banale programma parse-double-validate. I 62 KB dell'ultima
riga sono un pavimento, non una funzione della dimensione del programma. Sono il runtime dei
fiber, tirato dentro nel momento in cui chiami `runPromise`.

**Perché il tree-shaking non salva il runtime.** Il tree-shaking è eliminazione del codice
morto basata sulla raggiungibilità: butta via gli export che nessuno referenzia. La riga di
mezzo lo dimostra: usando solo `Either` il runtime resta fuori e si ferma a 4.2 KB. Ma nel
caso Effect completo il runtime è *raggiungibile*. Effect è un interprete, e i valori Effect
sono dati e non un grafo di chiamate statico, quindi quali funzionalità dei fiber scattano lo
si decide a runtime in base ai tag dei nodi. Il bundler non può dimostrare che non
interromperai, farai fork o aprirai mai uno scope, quindi l'intero interprete resta. Puoi
fare tree-shaking sulle foglie (`Effect.map`, `Either.*`), ma non sul tronco.

**La decisione, con le date.** Il 2026-03-24 una SPA di content-admin ha adottato Effect su
larga scala: `Effect.gen`/`tryPromise`/`forEach`/`Match` in tutto il core del service worker,
`useAuth`/`useSWBridge` sul client. Lì il runtime *veniva usato*, quindi il costo del bundle
comprava qualcosa ed è stato accettato a ragione. Più tardi, il 2026-06-10, una app frontend
ha fatto la scelta opposta. Le serviva solo l'errore-come-valore, quindi ha spedito funzioni
result custom e ha risparmiato i 62 KB. Hanno ragione entrambe, perché la regola è
condizionale:

- Usi il runtime di Effect — concorrenza strutturata, interruzione, retry/scheduling,
  scope/resource-safety, `Layer`/DI? **Usa Effect.** Un equivalente fatto a mano sarebbe una
  re-implementazione peggiore e insicura dello stesso runtime. La dimensione del bundle è
  l'asse sbagliato.
- Ti serve solo "errori e assenza sono valori"? **Usa un `Result` custom.** Il runtime di
  Effect diventa peso morto che non puoi togliere col tree-shaking, e 286 B fanno il lavoro.

L'inquadramento precedente "usa sempre Effect" era troppo forte. Generalizzava un progetto
dove il runtime capitava di essere usato a un default universale. La regola corretta è la
condizionale qui sopra, ed è il motivo per cui questo articolo è `context` e non `strong`.

## Come applicarlo

**Il percorso leggero — un `Result` custom (usalo quando ti serve solo l'errore-come-valore).**

Un'unione discriminata più tre funzioni pure copre map/chain/fold. È completamente
tree-shakeable, non porta runtime, e costa qualche centinaio di byte:

```ts
// result.ts — the whole "errors as values" toolkit, ~30 lines, no dependency.
type Result<E, A> =
  | { readonly _tag: 'Err'; readonly error: E }
  | { readonly _tag: 'Ok'; readonly value: A };

const ok = <A>(value: A): Result<never, A> => ({ _tag: 'Ok', value });
const err = <E>(error: E): Result<E, never> => ({ _tag: 'Err', error });

const map =
  <A, B>(f: (a: A) => B) =>
  <E>(r: Result<E, A>): Result<E, B> =>
    r._tag === 'Ok' ? ok(f(r.value)) : r;

const flatMap =
  <A, F, B>(f: (a: A) => Result<F, B>) =>
  <E>(r: Result<E, A>): Result<E | F, B> =>
    r._tag === 'Ok' ? f(r.value) : r;

const match =
  <E, A, B>(onErr: (e: E) => B, onOk: (a: A) => B) =>
  (r: Result<E, A>): B =>
    r._tag === 'Ok' ? onOk(r.value) : onErr(r.error);
```

Il tipo dell'errore è ancora nella firma, chi chiama non può comunque ignorare il percorso
di fallimento, e `match` forza ancora entrambi i rami. Ottieni l'invariante, gli errori come
valori, senza i 62 KB di runtime. Questo è il default per la semplice logica fallibile. Passa
alla versione Effect qui sotto solo quando il progetto già usa il suo runtime.

**Pipeline Effect vs try/catch.**

```ts
// Bad: try/catch — errors are untyped, flow is non-local, missing paths silently pass
const fetchUserProfile = async (id: string): Promise<UserProfile> => {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    return raw as UserProfile; // cast — no runtime check
  } catch (err) {
    console.error(err);
    throw err; // rethrows; caller must also try/catch
  }
};

// Good: Effect pipeline — E type is explicit; caller cannot ignore the failure path
import { Effect, pipe } from 'effect';
import { Schema } from 'effect';

class HttpError {
  readonly _tag = 'HttpError';
  constructor(readonly status: number) {}
}

class ParseError {
  readonly _tag = 'ParseError';
  constructor(readonly cause: unknown) {}
}

const fetchUserProfile = (
  id: string,
): Effect.Effect<UserProfile, HttpError | ParseError> =>
  pipe(
    Effect.tryPromise({
      try:   () => fetch(`/api/users/${id}`),
      catch: (e) => new HttpError((e as Response).status ?? 0),
    }),
    Effect.flatMap((res) =>
      res.ok
        ? Effect.tryPromise({
            try:   () => res.json(),
            catch: (e) => new ParseError(e),
          })
        : Effect.fail(new HttpError(res.status)),
    ),
    Effect.flatMap(Schema.decode(UserProfileSchema)),
  );
```

La firma dice a chi chiama che `fetchUserProfile` può fallire con `HttpError` o `ParseError`.
Non c'è alcun percorso di throw implicito, e il type system impone di gestire entrambi i casi
prima che la pipeline parta.

**Effect.gen per la logica asincrona sequenziale.**

Quando una pipeline ha molti passi sequenziali, la sintassi a generatore si legge più vicina
al codice imperativo senza sacrificare gli errori tipizzati:

```ts
const syncUserData = (userId: string): Effect.Effect<void, HttpError | ParseError | DbError> =>
  Effect.gen(function* () {
    const profile  = yield* fetchUserProfile(userId);
    const existing = yield* findExistingRecord(userId);
    const merged   = mergeProfile(existing, profile); // pure, no yield needed
    yield* saveRecord(merged);
  });
```

Ogni `yield*` è un bind tipizzato. Se `fetchUserProfile` fallisce, l'esecuzione si ferma a
quella riga e l'errore si propaga con il suo tipo intatto, senza try/catch e senza callback
`.catch`.

**Validazione con Schema al confine.**

Il modulo `Schema` di Effect sostituisce i type guard scritti a mano e i cast `as` al confine
del sistema. Il decoder restituisce il valore parsato, oppure fa fallire l'`Effect` con un
`ParseError` strutturato:

```ts
import { Schema } from 'effect';

const UserProfileSchema = Schema.Struct({
  id:    Schema.String,
  name:  Schema.String,
  email: Schema.String,
});

type UserProfile = Schema.Schema.Type<typeof UserProfileSchema>;

// Schema.decode returns Effect<UserProfile, ParseError>
// — no cast, no manual type guard, error in the type
```

**Esegui solo al bordo.**

`Effect.runPromise` e `Effect.runSync` sono il guscio imperativo. Stanno negli event handler,
nei message listener del service worker, o nel bootstrap dell'applicazione, mai dentro un
passo puro della pipeline:

```ts
// Composition root / event handler (imperative shell)
self.addEventListener('message', (event) => {
  Effect.runPromise(handleMessage(event.data)).catch(reportUnhandled);
});
```

Tutto ciò che sta sopra questo confine sono valori `Effect` composti. Solo il guscio li
converte in Promise o li esegue in modo sincrono.

**L'assenza come Option, non null.**

Per i valori che possono esistere o no, `Option` da `effect` rende l'assenza esplicita nel
tipo, senza `null` né `undefined`:

```ts
import { Option } from 'effect';

const findFirst = <T>(
  items: ReadonlyArray<T>,
  predicate: (item: T) => boolean,
): Option.Option<T> =>
  Option.fromNullable(items.find(predicate));

// Caller must match both cases — no forgotten null check
const label = Option.match(findFirst(items, isActive), {
  onNone: () => 'None active',
  onSome: ({ name }) => name,
});
```

## Anti-pattern

```ts
// ❌ Untyped rejection — callers cannot know what errors to handle
const loadData = async (): Promise<Data> => {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error('failed'); // type erased; caller must guess
  return res.json() as Data;              // cast; no runtime check
};

// ❌ Swallowing in catch — the error disappears, the caller gets a lie
const safe = async (): Promise<Data | null> => {
  try { return await loadData(); }
  catch { return null; } // null is not a type; it is a missing error
};

// ❌ Effect.runPromise inside a pipeline step — runs eagerly in the wrong context
const processItem = (item: Item): Effect.Effect<void> =>
  Effect.sync(() => {
    Effect.runPromise(saveItem(item)); // breaks the lazy composition model
  });

// ❌ Mixing Effect and raw throws — a throw inside an Effect.gen body is untyped
const mixed = Effect.gen(function* () {
  const result = yield* fetchData();
  if (result.count === 0) throw new Error('empty'); // escapes Effect error channel
});
```

## Vedi anche

L'articolo `parse-dont-validate` estende questo discorso: `Schema.decode` è la forma
preferibile di validazione al confine perché restituisce un `Effect` con un `ParseError`
tipizzato, non un booleano né un'eccezione lanciata e non tipizzata.
