---
title: 'Niente cast — non ricorrere mai a `as`'
category: typescript
summary: 'Le asserzioni di tipo sono una bugia al compilatore; la sicurezza si ottiene con inferenza e progettazione, non con i cast.'
principle: 'Non usare mai `as` né il non-null `!`. Se i tipi non combaciano, correggi il design o valida al confine — mai fare un cast.'
severity: non-negotiable
tags: [typescript, type-safety, inference, validation]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-03-25
    note: 'Grande Refactoring fase 3 — zero cast `as` in tutta la codebase, nessun override del linter.'
  - project: 'una SPA di amministrazione contenuti (piano di refactoring)'
    date: 2026-03-24
    note: 'Principio richiesto: niente `any`, niente `as`, niente `!`; validare ai confini, calcolare internamente.'
  - project: 'un bot edge (Cloudflare Workers)'
    date: 2026-05-23
    note: 'Il bot dei digest Telegram ha rispettato il no-any/no-as con guardie a runtime in src/util/json.ts.'
related:
  - typescript/no-null-use-undefined
  - typescript/validate-at-the-boundary
  - functional-architecture/parse-dont-validate
order: 1
updated: 2026-05-23
---

Un'asserzione di tipo (`value as Thing`) non converte nulla. Spegne il compilatore per
una singola espressione e dichiara, sulla tua parola anziché su quella del sistema dei
tipi, che tu ne sai di più. Ogni `as` è un punto in cui un refactoring successivo può
cambiare la forma reale dei dati mentre i tipi continuano a sostenere la vecchia forma.
L'asserzione non-null `!` fa lo stesso gioco: dice al compilatore «fidati, non è
undefined» esattamente nel punto in cui il compilatore stava cercando di proteggerti.

La regola è assoluta. Niente `as`, niente `!`. Non «ridurre al minimo», non «solo nei
test», nessuna eccezione.

## Perché è importante

In una SPA di amministrazione contenuti, il Grande Refactoring (concluso il 2026-03-24)
si è dato un obiettivo esplicito: **zero cast `as` in tutta la codebase** con **nessun
override del linter**, e lo ha centrato. La motivazione non era estetica. Lo stato prima
del refactoring portava con sé 148 violazioni di lint soppresse e un'intera classe di bug
che esistevano solo perché cast e asserzioni non-null lasciavano passare dati malformati
oltre il type checker, facendoli poi esplodere a runtime lontano dal cast che li aveva
fatti entrare.

La ragione più profonda è che un cast è **non locale**. Quando scrivi `data as Ticket`,
il bug che abiliti non emerge su quella riga. Emerge tre moduli più in là, quando
qualcosa legge `ticket.assignee.login` e `assignee` in realtà era `null`. Tutto il valore
di un sistema di tipi sta nella località: ti indica il problema vero. Un cast lo baratta
per un attimo di comodità e lo ripaga più tardi come incidente in produzione.

## Come applicarlo

Quando i tipi non combaciano, la soluzione è una di tre cose, mai un cast.

**1. Progetta i tipi in modo che l'inferenza funzioni.** La maggior parte dei cast è il
sintomo di un tipo descritto in modo troppo lasco, o dichiarato nel posto sbagliato.

```ts
// Bad: the function returns `unknown`, so callers cast.
const parse = (raw: string): unknown => JSON.parse(raw);
const ticket = parse(body) as Ticket; // a lie

// Good: validate once, return the real type, callers never cast.
const parseTicket = (raw: string): Ticket | undefined => {
  const value: unknown = JSON.parse(raw);
  return isTicket(value) ? value : undefined;
};
```

**2. Usa un type guard, non un'asserzione.** Un type guard definito dall'utente
(`x is T`) viene verificato dal compilatore rispetto a un test reale a runtime. Restringe
il tipo senza mentire.

```ts
const isTicket = (value: unknown): value is Ticket =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'number';
```

**3. Valida al confine.** L'unico punto in cui un cast sembra allettante è dove i dati
non tipizzati entrano nel sistema: una risposta di rete, `JSON.parse`, `localStorage`.
Lì esegui un vero validatore a runtime (una guardia scritta a mano, oppure
`effect/Schema` / `zod`) e restituisci un valore tipizzato o un errore. Dentro il confine
tutto è già tipizzato, quindi non resta nulla da castare. Questo è
[validare al confine](/kb/typescript/validate-at-the-boundary).

Per i valori assenti, ricorri a `undefined` e modella l'assenza nel tipo invece di usare
un non-null `!`. Vedi [niente null, usa undefined](/kb/typescript/no-null-use-undefined).

## Anti-pattern

```ts
// ❌ Asserting the shape of parsed JSON — the classic source of "cannot read
//    properties of null" three layers down.
const user = JSON.parse(res) as User;

// ❌ Non-null assertion to silence the checker. If it can be undefined, handle it.
const first = items.find((x) => x.active)!;

// ❌ Casting through `unknown` to force an incompatible assignment. This is the
//    same lie wearing a disguise.
const handler = genericHandler as unknown as SpecificHandler;

// ❌ `as const` is fine (it narrows, it does not assert a different type) — do not
//    confuse it with the above. The ban is on type *assertions*, not const assertions.
```

Ciascuno dei primi tre compila senza errori e spedisce un bug. Il sintomo è sempre un
errore a runtime il cui stack trace non punta da nessuna parte vicino al cast che lo ha
provocato.

## Applicazione automatica

Rendilo una regola di lint anziché una convenzione di review, perché le review non colgono
ciò che il lint coglie. In Biome, `noExplicitAny` e `noNonNullAssertion` sono impostate su
`error` (vedi il `biome.json` del repository). Nello stack typescript-eslint,
`@typescript-eslint/no-explicit-any`, `consistent-type-assertions`
(`assertionStyle: 'never'`) e `no-non-null-assertion` fanno lo stesso. La CI lancia il
linter e fa fallire la build su una violazione. Nessun override, nessun `biome-ignore`,
nessun `eslint-disable`. Quando una regola ti combatte, è il design a essere sbagliato:
correggi il design.

## Vedi anche

Il refactoring che ha dimostrato tutto questo su larga scala ha anche rimosso, nello
stesso passaggio, ogni `<div>` e ogni ciclo imperativo. Sicurezza dei tipi,
decomposizione funzionale e componenti dichiarativi nascono da un'unica postura coerente,
non da tre preferenze separate.
