---
title: 'Niente if, niente ternario — esprimi la scelta in modo esaustivo'
category: functional-architecture
summary: 'Sostituisci gli if e le espressioni ternarie con switch esaustivi, mappe di strategie o Effect/Match, così il compilatore dimostra che ogni ramo è gestito.'
principle: 'Niente istruzioni if, niente ternario ?:, niente &&/|| per il controllo di flusso. Esprimi la scelta con switch esaustivi, effect/Match, mappe di strategie (Record<Key,Fn>) o match su Option/Either.'
severity: strong
tags: [functional-architecture, exhaustiveness, strategy-pattern, switch, effect]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-07
    note: 'Vieta IfStatement + ConditionalExpression; richiede switch/Match/mappe di strategie; switch-exhaustiveness-check.'
  - project: 'una SPA di content-admin'
    date: 2026-03-24
    note: 'Un obiettivo importante del refactoring: zero istruzioni if, zero cicli imperativi in tutto il codice.'
related:
  - functional-architecture/currying-closures-higher-order
  - functional-architecture/lint-enforces-architecture
order: 2
updated: 2026-06-10
---

Un'istruzione `if` non dice nulla su quanti casi esistono. Un ternario dichiara al
compilatore che ce ne sono esattamente due, ma non se quei due siano gli unici possibili.
Nessuno dei due costrutti impone l'esaustività. Aggiungi un terzo caso a una union e il
compilatore resta zitto: il caso non gestito arriva al runtime, e l'errore salta fuori
lontano da dove il ramo avrebbe dovuto esserci.

**`??` per il valore di default va bene.** Sceglie un valore di ripiego quando un risultato
manca, e questo non è controllo di flusso. Il divieto riguarda la diramazione sulla logica
applicativa: `if (status === 'pending')`, `type === 'admin' ? adminView : userView`,
`isLoading && <Spinner />`.

## Perché conta

Un grosso refactoring di una SPA di content-admin (2026-03-24) si è dato un obiettivo
esplicito: **zero istruzioni `if`, zero cicli imperativi** in tutto il codice. Quel
requisito è nato dalla sofferenza. La diramazione era sparsa tra i gestori di messaggi del
service worker, i componenti UI e le pipeline di trasformazione dati, quindi ogni nuovo
tipo di messaggio o stato costringeva gli sviluppatori a cercare con grep ogni punto di
diramazione e ad aggiungere un caso a mano. Le dimenticanze restavano silenziose fino alla
produzione.

Lo standard di ingegneria (2026-06-07) ha formalizzato la regola: ogni diramazione
multipla deve essere **esaustiva su una union chiusa**, così il compilatore dimostra la
totalità. Il meccanismo conta meno di quella garanzia, che sia uno `switch` con un default
`never`, `Effect/Match` o una mappa di strategie `Record<Key, Fn>`.

A imporlo è il lint, non la review:

- `no-restricted-syntax` che vieta `IfStatement` e `ConditionalExpression` in `src/`.
- `@typescript-eslint/switch-exhaustiveness-check` che obbliga ogni `switch` a gestire
  l'intera union.

## Come applicarlo

**Sostituisci una catena di if con una mappa di strategie Record.**

La mappa di strategie è un semplice oggetto che associa ogni membro di una union chiusa a
una funzione. Aggiungi un nuovo membro alla union e devi aggiungere una nuova chiave alla
mappa; il compilatore segnala la mappa come incompleta prima che la build passi.

```ts
// Bad: if-chain over status — silent when a new status is added
const describeStatus = (status: TicketStatus): string => {
  if (status === 'open') return 'Awaiting triage';
  if (status === 'in-progress') return 'Being worked on';
  if (status === 'closed') return 'Resolved';
  return 'Unknown'; // ← silent fallthrough; compiler never flags this
};

// Good: strategy map — Record forces every key to be present
type TicketStatus = 'open' | 'in-progress' | 'closed';

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Awaiting triage',
  'in-progress': 'Being worked on',
  closed: 'Resolved',
  // compiler error if a union member is missing
};

const describeStatus = (status: TicketStatus): string => STATUS_LABEL[status];
```

Quando il gestore deve eseguire una funzione invece di restituire un valore, il valore
della mappa è una funzione:

```ts
type SyncMessage = { type: 'PUSH' } | { type: 'PULL' } | { type: 'FLUSH' };

type MessageHandler = (msg: SyncMessage) => void;

const SYNC_HANDLERS: Record<SyncMessage['type'], MessageHandler> = {
  PUSH:  handlePush,
  PULL:  handlePull,
  FLUSH: handleFlush,
};

const dispatchSyncMessage = (msg: SyncMessage): void =>
  SYNC_HANDLERS[msg.type](msg);
```

**Sostituisci un ternario con uno switch esaustivo.**

```ts
// Bad: ternary that silently mishandles a third role
const homeRoute = (role: UserRole): string =>
  role === 'admin' ? '/admin' : '/dashboard';

// Good: exhaustive switch — compiler errors when UserRole gains a new member
type UserRole = 'admin' | 'editor' | 'viewer';

const homeRoute = (role: UserRole): string => {
  switch (role) {
    case 'admin':  return '/admin';
    case 'editor': return '/editor';
    case 'viewer': return '/dashboard';
    default: {
      const _exhaustive: never = role;
      return _exhaustive; // unreachable; compiler proves it
    }
  }
};
```

**Usa Effect/Match per il pattern matching sugli ADT.**

Quando la scelta riguarda una union discriminata con payload, `Match` del pacchetto
`effect` offre un matching esaustivo senza istruzione switch:

```ts
import { Match } from 'effect';

type ApiResult =
  | { _tag: 'Success'; data: User }
  | { _tag: 'NotFound' }
  | { _tag: 'Unauthorized'; reason: string };

const toDisplayMessage = Match.type<ApiResult>().pipe(
  Match.tag('Success',      ({ data }) => `Welcome, ${data.name}`),
  Match.tag('NotFound',     ()         => 'Resource not found'),
  Match.tag('Unauthorized', ({ reason }) => `Access denied: ${reason}`),
  Match.exhaustive,   // ← compile error if a tag is unhandled
);
```

`Match.exhaustive` è la prova del compilatore. Rimuovi un caso `Match.tag` e ottieni un
errore di tipo nel punto della dichiarazione, invece di un crash a runtime nel punto della
chiamata.

**`??` non è vietato.**

Il valore di default non è controllo di flusso e non ricade sotto questa regola:

```ts
// Acceptable: ?? selects a fallback when a value is absent
const label = config.label ?? 'Untitled';
```

La regola colpisce la diramazione sulla logica applicativa. `??` dice soltanto «usa il lato
destro se il sinistro è null o undefined», quindi non c'è nessuna decisione specifica
dell'applicazione.

## Anti-pattern

```ts
// ❌ if-else chain — not exhaustive; new cases are silently unhandled
if (event.type === 'click') handleClick(event);
else if (event.type === 'keydown') handleKey(event);
// missing 'focus', 'blur', ... — no compiler warning

// ❌ Ternary standing in for a business rule — hides the case set
const icon = isError ? <ErrorIcon /> : <InfoIcon />;
// when a 'warning' state is added, this silently renders InfoIcon

// ❌ Short-circuit && for conditional render in JSX/Angular templates
// (use @if control-flow blocks or strategy maps instead)
{isVisible && <Component />}

// ❌ Nested ternaries — unreadable and still not exhaustive
const label = a ? 'A' : b ? 'B' : c ? 'C' : 'other';

// ❌ switch without a never default — the compiler cannot prove exhaustiveness
switch (status) {
  case 'active': return render();
  case 'inactive': return null;
  // 'pending' was added to the union; this switch silently falls through
}
```

Ogni pattern qui sopra condivide un sintomo: una union cresce, il compilatore resta zitto e
il nuovo caso arriva in produzione non gestito.

## Imposizione

```js
// eslint.config.js (excerpt)
{
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'IfStatement',
        message: 'No if statements. Use switch, strategy maps, or Effect/Match.',
      },
      {
        selector: 'ConditionalExpression',
        message: 'No ternary. Use switch, strategy maps, or Effect/Match.',
      },
      {
        // ban logical && / || when used as control flow (short-circuit rendering)
        selector: 'LogicalExpression[operator="&&"]',
        message: 'No && for control flow. Use strategy maps or @if blocks.',
      },
    ],
    '@typescript-eslint/switch-exhaustiveness-check': 'error',
  },
}
```

Queste regole girano in CI e i commenti `eslint-disable` non sono ammessi. Quando la regola
di lint scatta, la correzione è introdurre una mappa di strategie o uno `switch` come si
deve, mai sopprimere l'avviso.
