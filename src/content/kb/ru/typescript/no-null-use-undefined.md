---
title: 'Никакого null — отсутствие моделируем через undefined'
category: typescript
summary: 'Используйте undefined как единственный маркер отсутствия; внешний null превращайте в него на границе, а более сложное отсутствие моделируйте размеченным объединением.'
principle: 'Никогда не используйте null. Для отсутствия применяйте undefined; если нужно дополнительное смысловое значение — заведите для него тип.'
severity: strong
tags: [typescript, type-safety, null-safety]
sources:
  - project: 'клиент для Jira'
    date: 2026-06-08
    note: 'Jira присылает assignee:null; mapUser обрабатывал только undefined и падал'
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'Никакого null — используйте undefined'
related:
  - typescript/no-casting
  - typescript/validate-at-the-boundary
order: 2
updated: 2026-06-10
---

## Зачем это нужно

TypeScript унаследовал от JavaScript оба маркера отсутствия — `null` и `undefined`, и это наследство оказалось ловушкой. Каждое nullable-значение требует двойной проверки: `if (x !== null && x !== undefined)` или короткой записи `x != null`. Сама проверка — это шум, но хуже другое: несогласованность. Одна функция возвращает `null`, другая — `undefined`, и теперь вызывающему коду приходится помнить, где что. Такое знание не масштабируется на весь проект.

Поэтому правило здесь такое: в доменном коде `null` не существует. Отсутствие значения означает только `undefined`, так что проверять остаётся единственный маркер.

Случай, после которого это правило стало неоспоримым, произошёл в клиенте для Jira 2026-06-08. REST API Jira возвращает неназначенные задачи как `"assignee": null` в JSON, и это именно намеренный JSON-`null`, а не пропущенное поле. Внутренний хелпер `mapUser` защищался от `undefined` (отсутствующего значения в TypeScript), но ветки для `null` у него не было. Когда приходила неназначенная задача, `mapUser(issue.assignee)` получал `null`, проскакивал мимо проверки и падал в рантайме при попытке прочитать у него `.displayName`. Починка заняла две строки: превратить `null` в `undefined` на границе десериализации, а затем выкинуть все упоминания `null` из домена. Граница проглотила внешнее соглашение, и домену больше не нужно было о нём знать.

Здесь есть и второй урок — про более сложное отсутствие. Иногда `T | undefined` недостаточно выразителен, и нужно различать «ещё не загружено», «загружено, но пусто» и «загружено с данными». Соблазнительный ход — взять `T | null | undefined` и навесить на каждый маркер по смыслу, но эти смыслы не видны нигде — ни системе типов, ни читателю. Используйте размеченное объединение.

## Как применять

### 1. Запретите null в доменных типах

Никогда не объявляйте тип свойства или параметра как `T | null`. Берите `T | undefined` или делайте свойство необязательным.

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

### 2. Превращайте null в undefined на границе

Внешние системы выдают `null`: REST API, базы данных, localStorage, сторонние SDK. Перехватите его в единственной точке, где нетипизированные данные попадают внутрь, превратите там в `undefined` — и пусть ничто дальше по коду не знает, что он вообще был.

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

После `mapIssue` каждый потребитель проверяет `if (issue.assignee !== undefined)` и ничего больше. Проверка на два маркера (`!= null`) остаётся запертой внутри этой единственной функции отображения.

### 3. Моделируйте более сложное отсутствие размеченным объединением

Когда разница между «данных ещё нет», «пустой результат» и «данные есть» действительно что-то значит, заложите её в тип, а не нагружайте смыслом два маркера.

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

Добавьте в `Loaded` новое состояние, не тронув `renderIssue`, — и компилятор выдаст ошибку. Комментарий такого за вас не обеспечит.

### 4. Включите строгую проверку на null

В `tsconfig.json` должно стоять `"strictNullChecks": true` (или `"strict": true`). Без этого система типов не может обеспечить ничего из перечисленного выше.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true // implies strictNullChecks
  }
}
```

## Антипаттерны

### Возврат null из доменных функций

```typescript
// Bad — callers must know to check for null AND handle undefined from other sources
const findUser = (id: string): User | null => {
  const user = store.get(id);
  return user ?? null; // deliberately creates null
};

// Good — one sentinel for all absence
const findUser = (id: string): User | undefined => store.get(id);
```

**Симптом**: на местах вызова громоздятся проверки `!== null` рядом с `!== undefined`, и одной из них вечно не хватает, потому что никто не помнит, какая функция возвращает какой маркер.

### Использование null и undefined как перегруженных сигналов

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

**Симптом**: единственное свидетельство того, что значит `null` против `undefined`, — это комментарий, а комментарии отрываются от кода, который описывают.

### Приведение null вместо его нормализации

```typescript
// Bad — the cast hides a real runtime risk
const assignee = (raw.assignee as User | undefined) ?? undefined;

// Good — normalize explicitly; if raw.assignee is unexpectedly shaped,
//         the boundary validator (see validate-at-the-boundary) catches it
const assignee = raw.assignee != null ? mapUser(raw.assignee) : undefined;
```

**Симптом**: приведение проходит на этапе компиляции, а в рантайме `raw.assignee` оказывается `null`, поэтому чтение `.displayName` у «типизированного» значения бросает исключение. Это и есть падение клиента для Jira 2026-06-08.

## Как обеспечить соблюдение

Добавьте ESLint-правило `no-null-keyword` из `@typescript-eslint`:

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

Для граничных файлов, которым приходится принимать внешний `null`, отключайте правило локально комментарием с объяснением причины:

```typescript
// eslint-disable-next-line @typescript-eslint/ban-types -- Jira API emits null for absent assignee
const mapIssue = (raw: JiraIssueRaw): Issue => ({ /* ... */ });
```

Этот подавляющий комментарий и есть та зафиксированная мотивировка, которую требует правило уровня `strong`.

## Смотрите также

- [Validate at the boundary, compute within](/principles/typescript/validate-at-the-boundary) — родственное правило о том, как разбирать и нормализовать внешние данные в одном месте.
- [No casting](/principles/typescript/no-casting) — приведение типов маскирует тот же класс ошибок, что и путаница null против undefined.
