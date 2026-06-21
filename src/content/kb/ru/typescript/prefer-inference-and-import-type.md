---
title: 'Доверяйте выводу типов: import type, readonly, видимость'
category: typescript
summary: 'Выжимайте максимум из вывода типов и неизменяемости: import type для типовых импортов, readonly на каждой подходящей поверхности, явные модификаторы видимости, стрелочные функции, замыкания вместо классов и globalThis вместо window.'
principle: 'Выжимайте максимум из вывода типов и неизменяемости: import type для типов, readonly везде, где уместно, явные модификаторы видимости, стрелочные функции, замыкания вместо классов, globalThis вместо window.'
severity: preferred
tags: [typescript, type-safety, immutability, inference]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'import type, readonly, стрелочные функции, замыкания, видимость, globalThis'
  - project: 'SPA для админки контента'
    date: 2026-03-25
    note: 'Большой рефакторинг: строгие типы, ноль переопределений'
related:
  - typescript/no-casting
  - functional-architecture/currying-closures-higher-order
order: 4
updated: 2026-06-10
---

## Почему это важно

Большинство аннотаций типов — это шум. Компилятор уже знает тип, поэтому повторное его написание не добавляет никакой безопасности. Зато добавляет хрупкости: поменяете тип возвращаемого значения функции — и каждую ручную аннотацию в месте вызова придётся менять следом. Положитесь на вывод типов, и ваши рефакторинги остаются локальными.

Остальные правила здесь нужны, чтобы вывод типов оставался надёжным, а код — предсказуемым:

- `import type` сообщает бандлеру, что символ стирается при компиляции, — именно это позволяет `verbatimModuleSyntax` и tree-shaking работать корректно.
- `readonly` блокирует случайные мутации, которые вывод типов не ловит.
- Явные модификаторы видимости (`private`, `public`, `protected`) делают намерение находимым через поиск и не дают лишним членам просочиться в публичную поверхность классов и Angular-компонентов.
- Стрелочные функции лексически сохраняют `this` и компонуются чище, чем объявления методов.
- Замыкания вместо классов обходят иерархии наследования и делают зависимости явными.
- `globalThis` вместо `window` работает в любой JS-среде (воркеры, Node, Deno) без отдельной настройки.

Большой рефакторинг SPA для админки контента (2026-03-25) сделал всё это жёсткими правилами под девизом «строгие типы, ноль переопределений». Любое переопределение опции tsconfig или любой комментарий-подавление требуют письменного обоснования, зафиксированного в заметках о рефакторинге. По умолчанию — полная строгость и полное следование этим паттернам.

## Как применять

### import type для типовых импортов

Когда импорт используется только как аннотация типа, пишите `import type`. Тогда импорт стирается при компиляции, что снимает рантайм-ошибки циклических ссылок и удовлетворяет `verbatimModuleSyntax`.

```typescript
// Bad — value import used only as a type annotation
import { User } from './user';

const greet = (user: User): string => `Hello, ${user.displayName}`;

// Good — type-only import; erased at emit
import type { User } from './user';

const greet = (user: User): string => `Hello, ${user.displayName}`;
```

В `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "verbatimModuleSyntax": true // enforces import type for type-only imports
  }
}
```

С включённым `verbatimModuleSyntax` компилятор выдаёт ошибку, когда value-импорт используется только как тип, так что правило никому не нужно держать в голове.

### readonly везде, где уместно

Помечайте каждый массив, кортеж и свойство объекта, которые не должны меняться после создания. Для форм параметров, которые не модифицируются, предпочитайте `Readonly<T>`.

```typescript
// Bad — mutable by default; callers can push() or reassign
interface Config {
  featureFlags: string[];
  timeout: number;
}

const applyFlags = (flags: string[]): void => {
  flags.push('debug'); // accidental mutation; compiler silent
};

// Good — mutation is a compile error
interface Config {
  readonly featureFlags: readonly string[];
  readonly timeout: number;
}

const applyFlags = (flags: readonly string[]): void => {
  // flags.push('debug'); // Error: Property 'push' does not exist on type 'readonly string[]'
  const withDebug = [...flags, 'debug']; // return new array instead
};
```

Используйте `as const` для литеральных значений, которые никогда не должны расширяться:

```typescript
const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
// type is readonly ['north', 'south', 'east', 'west'], not string[]
```

### Стрелочные функции вместо объявлений методов

Стрелочные функции захватывают `this` лексически и подставляются в функции высшего порядка без `.bind()`. Применяйте их для самостоятельных функций и колбэков.

```typescript
// Bad — method declaration; this is dynamic; requires .bind() in callbacks
class IssueService {
  fetchIssue(id: string) {
    return fetch(`/api/issues/${id}`).then(r => r.json());
  }
}

// Good — arrow function; no class needed for a stateless operation
const fetchIssue = (id: string): Promise<unknown> =>
  fetch(`/api/issues/${id}`).then(r => r.json());
```

### Замыкания вместо классов

Замыкание захватывает свои зависимости явно и возвращает типизированный интерфейс. Нет класса, который нужно наследовать, а тесты передают зависимости как обычные аргументы.

```typescript
// Bad — class with implicit dependency through a property
class UserService {
  private readonly apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  fetchUser(id: string): Promise<unknown> {
    return fetch(`${this.apiUrl}/users/${id}`).then(r => r.json());
  }
}

// Good — closure; dependency is a parameter; return type is explicit
interface UserService {
  fetchUser: (id: string) => Promise<unknown>;
}

const createUserService = (apiUrl: string): UserService => ({
  fetchUser: (id) => fetch(`${apiUrl}/users/${id}`).then(r => r.json()),
});
```

Тип возвращаемого объекта (`UserService`) — это публичный контракт. Привязка `apiUrl` остаётся приватной за счёт лексической области видимости, никакого ключевого слова `private` не нужно. Тесты передают фейковый `apiUrl` аргументом.

### Явные модификаторы видимости

Когда без класса не обойтись (например, в Angular-компонентах), помечайте каждый член явно `private` или `public`. Никогда не полагайтесь на неявный public.

```typescript
// Bad — implicit visibility; it is not clear what is part of the public API
class FeatureComponent {
  label = 'Features';
  items: string[] = [];

  loadItems() { /* ... */ }
  private formatItem(item: string) { return item.trim(); }
}

// Good — explicit; public API is obvious at a glance
class FeatureComponent {
  public readonly label = 'Features';
  private items: readonly string[] = [];

  public loadItems(): void { /* ... */ }
  private formatItem(item: string): string { return item.trim(); }
}
```

### globalThis вместо window

`window` — это глобальная переменная только для браузера, поэтому любой код, который к ней обращается, ломается в Web Workers, Node-скриптах и при серверном рендеринге. `globalThis` — стандартный глобальный объект, который есть в любой JS-среде.

```typescript
// Bad — browser-only
const origin = window.location.origin;

// Good — works in any JS environment that has location
const origin = globalThis.location?.origin ?? 'http://localhost';
```

### Пусть вывод типов несёт тип возвращаемого значения

Аннотируйте типы возврата у функций публичного API (экспортируемые функции, сеттеры Angular `@Input`), чтобы контракт был задокументирован и зафиксирован. Опускайте аннотацию там, где функция внутренняя и вывод однозначен.

```typescript
// Verbose and redundant — inference already knows the return type
const double = (n: number): number => n * 2;

// Fine — inference works; annotation adds no information
const double = (n: number) => n * 2;

// Annotate when the function is an API contract
export const createUserService = (apiUrl: string): UserService => ({ /* ... */ });
//                                                  ^^^^^^^^^^^^ explicit: this is the contract
```

## Антипаттерны

### Смешивание value- и type-импортов

```typescript
// Bad — value import for a type-only use; bundler cannot tree-shake it
import { Config } from './config';
type LocalConfig = Pick<Config, 'timeout'>;
```

**Симптом**: бандл включает модуль `./config` в рантайме, хотя используется только тип.

### Изменяемые публичные массивы

```typescript
// Bad
class Store {
  items: Item[] = [];
}

// store.items.push(fakeItem); — test pollution; no compile error
```

**Симптом**: массив меняется снаружи класса в тестах или в неожиданных местах вызова; баги недетерминированы и зависят от порядка.

### Обращения к window в общем коде

```typescript
// Bad — shared utility that breaks in a Web Worker
const getTimezone = () => window.Intl.DateTimeFormat().resolvedOptions().timeZone;
```

**Симптом**: `ReferenceError: window is not defined` в любой небраузерной среде.

### Неявно публичные члены класса

```typescript
// Bad
class Component {
  internalState = 0;     // accidentally public
  public api = 'value';  // public, fine
}
```

**Симптом**: `internalState` начинают читать из шаблонов или тестов, и он становится несущим, мешая будущему рефакторингу.

## Как добиться соблюдения

- `verbatimModuleSyntax: true` в `tsconfig.json` обеспечивает `import type`.
- `@typescript-eslint/explicit-member-accessibility` с `option: 'explicit'` обеспечивает модификаторы видимости.
- `@typescript-eslint/prefer-readonly` помечает изменяемые свойства класса, которым после конструктора ничего не присваивают повторно.
- `@typescript-eslint/no-restricted-globals` умеет запрещать `window` и предлагать `globalThis`.
- `@typescript-eslint/explicit-module-boundary-types` обеспечивает аннотации типа возврата на экспортируемых функциях.

## Смотрите также

- [No casting](/kb/typescript/no-casting) — вывод типов устраняет большинство ситуаций, где приведение выглядит соблазнительно.
- [Currying, closures, and higher-order functions](/kb/functional-architecture/currying-closures-higher-order) — паттерн замыкания для композиции сервисов подробно.
