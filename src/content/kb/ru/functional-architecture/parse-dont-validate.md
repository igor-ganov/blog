---
title: 'Парсите, а не валидируйте'
category: functional-architecture
summary: 'На каждой границе системы один раз разберите сырой ввод в точный тип; дальше код работает с разобранным типом и больше ничего не перепроверяет и не приводит.'
principle: 'На границе один раз разберите нетипизированный ввод в точный тип; дальше код получает разобранный тип и больше ничего не перепроверяет и не приводит.'
severity: strong
tags: [functional-architecture, parsing, validation, effect-schema, type-safety, boundaries]
sources:
  - project: 'админка контента (SPA)'
    date: 2026-03-24
    note: 'Декодеры Effect.Schema в src/validation/ использовались по всему крупному рефакторингу.'
  - project: 'edge-бот (Cloudflare Workers)'
    date: 2026-05-23
    note: 'Типизированный клиент producer с рантайм-проверками, разбирающими JSON на границе в src/util/json.ts.'
related:
  - typescript/validate-at-the-boundary
  - typescript/no-casting
  - functional-architecture/errors-as-values-with-effect
order: 6
updated: 2026-06-10
---

Функция, которая валидирует, возвращает `boolean`. Она вычисляет, подходит ли ввод под
нужную форму, а потом выбрасывает этот ответ. У вызывающего кода на руках остаётся всё то же
нетипизированное значение, с которого он начал, и чтобы использовать его как ожидаемый тип,
приходится приводить. Приведение никем не проверено. Оно утверждает ту самую форму, которую
валидатор только что проверил, но в компиляторе эти два факта ничем не связаны. Вам верят на
слово.

Функция, которая парсит, возвращает типизированное значение или ошибку. Проверка
соответствия и присвоение типа — это одна и та же операция, поэтому приведения нет. Дальше код
получает значение, у которого уже есть точный тип. Он ничего не перепроверяет и не может
забыть проверить.

Фраза идёт из эссе Алексис Кинг 2019 года «Parse, don't validate». В этой кодовой базе практика
держится на Effect.Schema и на рантайм-проверках, написанных в явных точках-границах.

## Почему это важно

Крупный рефакторинг админки контента (SPA, 2026-03-24) поместил декодеры Effect.Schema в
`src/validation/`. Каждое значение, входящее в слой service-worker или клиента — будь то
сетевой ответ, `postMessage` или `IndexedDB` — декодировалось через Schema. Декодер возвращал
полностью типизированное значение либо рушил Effect-пайплайн структурированной
`ParseError`. Внутри границы вы не найдёте ни `as`, ни голого `JSON.parse`, ни оборонительных
проверок `typeof`.

В проекте edge-бота (2026-05-23) та же дисциплина применялась в `src/util/json.ts`. Клиент
producer вытягивал сырой JSON из внешней очереди, и весь разбор происходил в `json.ts` до того,
как что-либо попадало в бизнес-логику. Типизированный интерфейс клиента дальше по цепочке
никогда не видел `unknown`.

Файл-граница в обоих случаях работает как физическая отметка. Код над ним нетипизирован, код
под ним типизирован, а парсер — это то, что переносит вас через черту.

## Как применять

**Сравнение: валидация (информация теряется) против парсинга (информация сохраняется).**

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

`processUser` никогда не видит `unknown` и не может запуститься, пока парсинг уже не прошёл
успешно. Нет приведения, которое надо писать, нет которое надо проверять при аудите, и нет
такого, которое устареет, когда `User` поменяет форму.

**Файл-граница как точка перехода.**

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

**Пошаговое сужение через Schema.**

Когда полный тип становится известен только после проверки дискриминанта, берите
`Schema.Union` вместе с `Schema.Literal` и дайте ему сузить тип за вас:

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

**Type guard как запасной вариант (когда Effect недоступен).**

Там, где стоимость бандла Effect слишком велика, чтобы её оправдать (когда применимо это
исключение, смотрите
[errors-as-values-with-effect](/kb/functional-architecture/errors-as-values-with-effect)),
напишите нормальный guard с предикатом типа вместо булева валидатора:

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

Но и здесь приведение остаётся внутри той единственной функции, что выполнила проверку.
Никакой другой файл не приводит.

## Анти-паттерны

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

У всех этих случаев один и тот же изъян. Нетипизированный ввод доходит до кода, который
считает его типизированным, а компилятор это допущение не проверял. Когда ввод не совпадает,
ошибка всплывает далеко от того места, где нетипизированное значение впервые вошло.

## Контроль соблюдения

- `@typescript-eslint/no-explicit-any` и `biome/noExplicitAny` не дают `any` маскировать
  нетипизированный ввод.
- `biome/noNonNullAssertion` и `@typescript-eslint/no-non-null-assertion` не дают применять
  non-null-утверждения к значениям, которые не были разобраны.
- Архитектурное соглашение: любой файл, импортирующий что-либо из модуля слоя-границы
  (`src/util/json.ts`, `src/validation/`), получает типизированное значение; ему нельзя
  напрямую вызывать `JSON.parse` или обращаться к `.json()` у `Response`.

Файлы-границы — единственное место, где `unknown` разрешён, а остальное закрывают правила
линтера. Единственное допустимое приведение `as` живёт внутри функции-парсера, которая
выполнила исчерпывающую проверку.
