---
title: 'Niente null — rappresenta l''assenza con undefined'
category: typescript
summary: 'Usa undefined come unico sentinella di assenza; normalizza il null esterno al confine e modella le assenze più ricche con union discriminate.'
principle: 'Non usare mai null. Usa undefined per l''assenza; quando ti serve un valore semantico in più, creagli un tipo apposito.'
severity: strong
tags: [typescript, type-safety, null-safety]
sources:
  - project: 'un''app client per Jira'
    date: 2026-06-08
    note: 'Jira manda assignee:null; mapUser gestiva solo undefined ed è andato in crash'
  - project: 'uno standard ingegneristico'
    date: 2026-06-02
    note: 'Niente null — usa undefined'
related:
  - typescript/no-casting
  - typescript/validate-at-the-boundary
order: 2
updated: 2026-06-10
---

## Perché conta

TypeScript eredita entrambi i sentinella di assenza di JavaScript, `null` e `undefined`, e quell'eredità è una trappola. Ogni valore nullable obbliga a un doppio controllo: `if (x !== null && x !== undefined)`, oppure la forma abbreviata `x != null`. Il controllo è rumore, ma il costo peggiore è l'incoerenza. Una funzione restituisce `null`, un'altra restituisce `undefined`, e ora chi chiama deve ricordarsi qual è quale. Una conoscenza del genere non si compone in tutta una codebase.

Quindi la regola qui è che `null` non esiste nel codice di dominio. Solo `undefined` significa che un valore è assente, il che lascia un unico sentinella da controllare.

L'incidente che ha reso questa regola non negoziabile è stato un'app client per Jira l'8 giugno 2026. La REST API di Jira restituisce le issue non assegnate con `"assignee": null` nel payload JSON, ovvero un `null` JSON deliberato e non un campo omesso. L'helper interno `mapUser` proteggeva contro `undefined` (il valore assente di TypeScript) ma non aveva un ramo per `null`. Quando arrivava una issue non assegnata, `mapUser(issue.assignee)` riceveva `null`, passava oltre il controllo e crashava a runtime nel tentativo di leggere `.displayName` da esso. La correzione era di due righe: normalizzare `null` a `undefined` al confine di deserializzazione, poi togliere ogni riferimento a `null` dal dominio. Il confine ha assorbito la convenzione esterna in modo che il dominio non dovesse mai saperne nulla.

C'è una seconda lezione qui, sull'assenza più ricca. A volte `T | undefined` non è abbastanza espressivo e devi distinguere "non ancora caricato" da "caricato ma vuoto" e da "caricato con dati". La mossa allettante è ricorrere a `T | null | undefined` e dare a ciascun sentinella un significato, ma quei significati non vivono in nessun posto che il sistema di tipi o chi legge possa vedere. Usa invece una union discriminata.

## Come applicarla

### 1. Bandisci null dai tipi di dominio

Non dichiarare mai il tipo di una proprietà o di un parametro come `T | null`. Usa `T | undefined`, oppure rendi la proprietà opzionale.

```typescript
// Bad — null leaks into the domain
interface Issue {
  assignee: User | null;
}

// Good — undefined is the single absence sentinel
interface Issue {
  assignee: User | undefined;
}

// Also good — optional property implies undefined when absent
interface Issue {
  assignee?: User;
}
```

### 2. Normalizza null al confine

I sistemi esterni emettono `null`: REST API, database, localStorage, SDK di terze parti. Intercettalo nell'unico punto in cui i dati non tipizzati entrano, lì convertilo in `undefined`, e fa' in modo che nulla a valle sappia che è mai esistito.

```typescript
// boundary/jira-api.ts

// Raw shape coming off the wire — null is real here
interface JiraIssueRaw {
  id: string;
  assignee: JiraUserRaw | null; // Jira literally sends null
}

// Domain shape — null does not exist
interface Issue {
  id: string;
  assignee: User | undefined;
}

const mapUser = (raw: JiraUserRaw | undefined): User => ({
  id: raw.accountId,
  displayName: raw.displayName,
});

// The one place that knows about null
const mapIssue = (raw: JiraIssueRaw): Issue => ({
  id: raw.id,
  // null → undefined happens here; domain code never sees null
  assignee: raw.assignee != null ? mapUser(raw.assignee) : undefined,
});
```

Dopo `mapIssue`, ogni consumatore controlla `if (issue.assignee !== undefined)` e nient'altro. Il controllo a doppio sentinella (`!= null`) resta in quarantena dentro quell'unica funzione di mapping.

### 3. Modella l'assenza più ricca con una union discriminata

Quando la differenza tra "ancora nessun dato", "risultato vuoto" e "dato presente" porta davvero un significato, mettilo nel tipo invece di sovraccaricare due sentinella.

```typescript
// Bad — null and undefined carry hidden meanings that only comments explain
interface IssueState {
  issue: Issue | null | undefined; // null = loaded empty, undefined = not yet loaded?
}

// Good — each state is a named, exhaustive branch
type Loaded<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'empty' }
  | { state: 'ready'; value: T };

// Callers switch on state — the compiler enforces exhaustiveness
const renderIssue = (loaded: Loaded<Issue>): string => {
  switch (loaded.state) {
    case 'idle':    return 'Not started';
    case 'loading': return 'Loading…';
    case 'empty':   return 'No issue found';
    case 'ready':   return loaded.value.id;
  }
};
```

Aggiungi un nuovo stato a `Loaded` senza aggiornare `renderIssue` e il compilatore dà errore. Un commento non può imporlo al posto tuo.

### 4. Abilita gli strict null check

`tsconfig.json` deve avere `"strictNullChecks": true` (o `"strict": true`). Senza, il sistema di tipi non può imporre niente di quanto sopra.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true // implies strictNullChecks
  }
}
```

## Anti-pattern

### Restituire null dalle funzioni di dominio

```typescript
// Bad — callers must know to check for null AND handle undefined from other sources
const findUser = (id: string): User | null => {
  const user = store.get(id);
  return user ?? null; // deliberately creates null
};

// Good — one sentinel for all absence
const findUser = (id: string): User | undefined => store.get(id);
```

**Sintomo**: nei punti di chiamata si accumulano controlli `!== null` accanto a controlli `!== undefined`, e uno dei due manca sempre perché nessuno ricorda quali funzioni restituiscono quale sentinella.

### Usare null e undefined come segnali sovraccaricati

```typescript
// Bad — the difference between null and undefined here is documented nowhere permanent
const getConfig = (): Config | null | undefined => {
  if (!initialized) return undefined; // "not ready"
  if (!configExists) return null;     // "ready but absent"
  return config;
};

// Good — discriminated union carries the meaning in the type
type ConfigResult =
  | { status: 'pending' }
  | { status: 'absent' }
  | { status: 'loaded'; config: Config };

const getConfig = (): ConfigResult => { /* ... */ };
```

**Sintomo**: l'unica traccia di cosa significhi `null` rispetto a `undefined` è un commento, e i commenti marciscono lontano dal codice che descrivono.

### Castare via il null invece di normalizzarlo

```typescript
// Bad — the cast hides a real runtime risk
const assignee = (raw.assignee as User | undefined) ?? undefined;

// Good — normalize explicitly; if raw.assignee is unexpectedly shaped,
//         the boundary validator (see validate-at-the-boundary) catches it
const assignee = raw.assignee != null ? mapUser(raw.assignee) : undefined;
```

**Sintomo**: il cast passa in fase di compilazione, poi a runtime `raw.assignee` risulta essere `null`, quindi leggere `.displayName` dal valore "tipizzato" lancia un'eccezione. È il crash dell'app client per Jira dell'8 giugno 2026.

## Come imporla

Aggiungi la regola ESLint `no-null-keyword` da `@typescript-eslint`:

```jsonc
// eslint.config.ts (flat config)
{
  "rules": {
    "@typescript-eslint/no-null-assertion": "error",
    // ban the literal null keyword in type positions and expressions
    "@typescript-eslint/ban-types": ["error", {
      "types": { "null": "Use undefined or a discriminated union instead." }
    }]
  }
}
```

Per i file di confine che devono accettare il `null` esterno, disabilita la regola localmente con un commento che spiega perché:

```typescript
// eslint-disable-next-line @typescript-eslint/ban-types -- Jira API emits null for absent assignee
const mapIssue = (raw: JiraIssueRaw): Issue => ({ /* ... */ });
```

Quel commento di soppressione è la giustificazione registrata che la severità `strong` richiede.

## Vedi anche

- [Valida al confine, calcola all'interno](/principles/typescript/validate-at-the-boundary) — la regola compagna che spiega come fare parsing e normalizzazione dei dati esterni in un unico posto.
- [Niente casting](/principles/typescript/no-casting) — il casting maschera la stessa classe di bug che provoca la confusione tra null e undefined.
