---
title: 'Проверяй на границе, вычисляй внутри'
category: typescript
summary: 'Разбирай и проверяй нетипизированные внешние данные один раз, на входе; внутри системы данные уже типизированы, и приведение типов не нужно.'
principle: 'Нетипизированные данные проверяются один раз, на границе, настоящей проверкой во время выполнения; внутри системы всё уже типизировано, поэтому ничего не приводится.'
severity: strong
tags: [typescript, type-safety, validation, parsing]
sources:
  - project: 'админский SPA для контента'
    date: 2026-03-24
    note: 'Декодеры Effect.Schema в src/validation; проверка на границе, вычисления внутри; детерминированные преобразования типов'
  - project: 'edge-бот (Cloudflare Workers)'
    date: 2026-05-23
    note: 'рантайм-гарды в src/util/json.ts держали no-any/no-as'
related:
  - typescript/no-casting
  - functional-architecture/parse-dont-validate
  - functional-architecture/errors-as-values-with-effect
order: 3
updated: 2026-06-10
---

## Почему это важно

Система типов TypeScript покрывает каждую строку кода, которую видит. Чего она не видит — это всё, что приходит по сети, достаётся из `localStorage`, передаётся аргументом CLI или прилетает в сторонний вебхук. В этих точках входа значение во время выполнения — это `unknown`, и рефлекс — отмахнуться приведением: `const config = JSON.parse(raw) as Config`. Красная волнистая линия исчезает, но теперь аннотация обещает `Config`, тогда как реальное значение может быть вообще чем угодно.

Это ложное обещание имеет свойство расходиться дальше. Оно доживёт до какой-нибудь функции, которой нужна конкретная форма данных, и к тому моменту сбой окажется далеко от плохого приведения. Стек-трейс укажет не туда, а настоящая причина останется скрытой.

Поэтому проверяй один раз, на границе. Разбери неизвестное значение в типизированное — или упади громко, с явной ошибкой. За этим единственным контрольным пунктом каждая внутренняя функция получает тип, которому действительно можно доверять: без приведений, без разбросанных тут и там оборонительных `typeof` и без цепочек `as unknown as T`.

Два проекта вшили это правило в реальную инфраструктуру.

**Админский SPA для контента (2026-03-24/25)**: крупный рефакторинг ввёл `src/validation/` с декодерами Effect.Schema под каждую форму внешних данных — ответы API, отправки форм, сохранённое состояние. В проектной заметке сказано: «validate at boundaries / compute internally; deterministic type transformations». Каждый слой API прогоняет свой ответ через декодер, прежде чем передать его в доменный код. Пропуск этого шага был корневой причиной целого класса багов с тихой порчей данных, которые рефакторинг затем и устранил.

**Edge-бот (Cloudflare Workers) (2026-05-23)**: лёгкий CLI-инструмент без зависимости от фреймворка. Вместо того чтобы тащить Effect, команда написала ручные рантайм-гарды в `src/util/json.ts`. Ограничение было таким же: никакого `any`, никакого `as`. Гарды возвращали типизированные результаты или бросали понятные ошибки, а внутренний код не содержал ни одного утверждения о типе.

## Как применять

### 1. Считай любой внешний вход неизвестным

Присвой сырому значению `unknown` и заставь себя разобрать его перед использованием.

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

### 2. Пиши функции-гарды для лёгких контекстов

Когда Effect под рукой нет, достаточно узкого type guard. Он всё так же проверяет, всё так же возвращает типизированное значение и всё так же обходится без `as`.

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

Единственный `as string` после явной проверки `typeof` — это нормально. Гард уже доказал тип, так что приведение фиксирует проверенный тобой факт, а не предположение, на которое ты надеешься. Это совсем не то же самое, что привести весь разобранный объект одним махом.

### 3. Собери декодеры в один слой

Положи все граничные декодеры в отдельный модуль (`src/validation/`, `src/boundary/` или `src/decoders/`). Доменный код импортирует типизированные значения из этого слоя и никогда не тянется к `Schema` или к утилитам-гардам напрямую.

```
src/
  boundary/
    api.ts          ← fetchConfig, fetchIssues — all decoders live here
    local-storage.ts ← parseStoredSession, parseUserPrefs
  domain/
    config.ts       ← uses Config type; no decoding logic
    issue.ts        ← uses Issue type; no decoding logic
```

Аудит становится дешёвым: когда меняется схема, трогать нужно ровно один файл.

### 4. Где уместно — возвращай типизированные ошибки вместо бросков

Если ты уже используешь Effect или типы Result, декодируй в `Either`, а не бросай исключение. Так сбои проверки попадают в явный возвращаемый тип, и вызывающий код обязан с ними разобраться.

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

Полный паттерн см. в [errors-as-values-with-effect](/principles/functional-architecture/errors-as-values-with-effect).

## Антипаттерны

### Приведение разобранного значения

```typescript
// Bad
const config = JSON.parse(raw) as Config;

// Symptom: config.featureFlags.map(...) throws "featureFlags is not a function"
// because featureFlags was actually a string in the stored JSON.
// The error appears in domain code, not at the parse site.
```

Приведение — это просто отложенное исключение времени выполнения, и падает оно там, где ничто не указывает на причину.

### Проверка в глубине доменной логики

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

**Симптом**: логика проверки размазана по домену, дефолты молча прячут испорченные данные, а «проверенный» тип на деле никогда не гарантирован.

### Использование any как транзитного типа

```typescript
// Bad
const raw: any = await res.json();
const config: Config = raw; // no error, no check

// Symptom: identical to the cast case — silent lie, remote failure.
```

`any` выключает проверку типов. Как только значение стало `any`, назад уже не отыграть, и ложь расползается на каждую функцию, до которой дойдёт это значение.

### Частичная проверка

```typescript
// Bad — validates one field, ignores the rest
const parseConfig = (raw: unknown): Config => {
  if (!isRecord(raw)) throw new Error('not an object');
  return raw as Config; // cast after minimal check
};
```

**Симптом**: непроверенные поля взрываются в доменном коде. Частичная проверка хуже, чем никакой, потому что поверх того же сбоя она даёт ложное чувство безопасности.

## Как обеспечить соблюдение

- Включи `@typescript-eslint/no-explicit-any` и `@typescript-eslint/no-unsafe-assignment` — оба ловят приведённые выше паттерны на этапе линтинга.
- В CI запускай `tsc --noEmit` с `strict: true`. Корректно разобранному значению `as` никогда не нужен, так что появившееся приведение — признак того, что кто-то обошёл границу.
- Чек-лист код-ревью: любая функция, которая вызывает `JSON.parse`, `res.json()`, `localStorage.getItem`, `process.env` или `process.argv`, обязана пропустить результат через декодер в том же файле перед возвратом.

## Смотри также

- [No casting](/principles/typescript/no-casting) — объясняет, почему `as` не заменяет настоящую проверку во время выполнения.
- [No null — model absence with undefined](/principles/typescript/no-null-use-undefined) — нормализация null — часть граничной проверки.
- [Parse, don't validate](/principles/functional-architecture/parse-dont-validate) — та же мысль в формулировке функциональной архитектуры.
