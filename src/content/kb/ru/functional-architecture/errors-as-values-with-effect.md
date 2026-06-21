---
title: 'Ошибки как значения — Effect только тогда, когда платишь за его рантайм'
category: functional-architecture
summary: 'Ошибки и отсутствие значения всегда живут в типе, а не в throw. Берите Effect, когда проект уже задействует его рантайм (конкурентность, scope, DI); для простых ошибок-значений самописный Result в ~200 раз меньше в бандле.'
principle: 'Моделируйте ошибки и отсутствие значения как значения в типе, собранные в пайплайны, и никогда не бросайте их. Используйте Effect, когда уже используете его рантайм (структурную конкурентность, прерывания, scope/безопасность ресурсов, Layer/DI); если нужна только ошибка-как-значение, самописный Result на размеченном объединении легче.'
severity: context
tags: [functional-architecture, effect, error-handling, async, pipeline, bundle-size]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-03-24
    note: 'Крупный рефакторинг внедрил Effect по-серьёзному: Effect.gen, Effect.tryPromise, Effect.forEach, Match в ядре SW; useAuth/useSWBridge на клиенте. Стоимость бандла приняли, потому что рантайм действительно использовался.'
  - project: 'инженерный стандарт'
    date: 2026-06-07
    note: 'Ошибки как значения; pipe/gen; Schema на границе; runSync/runPromise на краю.'
  - project: 'фронтенд-приложение'
    date: 2026-06-10
    note: 'Обошлись без Effect, на самописных result-функциях, из-за размера бандла — нужна была только ошибка-как-значение.'
  - project: 'замер бандла'
    date: 2026-06-11
    note: 'bun build --minify, gzip: самописный Result 286 B; только Effect Either 4.2 KB; полный Effect (gen+runPromise) 62 KB. Tree-shaking убирает недостижимые модули, но не может вырезать достижимый рантайм файберов.'
related:
  - error-handling/never-swallow-errors
  - typescript/validate-at-the-boundary
order: 4
updated: 2026-06-11
---

`throw` — это goto. Он выходит из текущего стека вызовов и передаёт управление любому
`catch`, который окажется выше, либо обработчику ошибок процесса, если не поймал никто.
Система типов о нём ничего не знает. Функция, которая бросает исключение, имеет ту же
сигнатуру, что и функция, которая не бросает, так что вызывающий код не может понять, что
пойдёт не так, не прочитав реализацию. Самодельные цепочки `Promise` только усугубляют:
`.catch` необязателен, реджекты не типизированы, и любой `await` может проглотить ошибку
без следа.

Effect моделирует логику с возможными ошибками и асинхронность как значения. `Effect<A, E, R>`
описывает вычисление, которое при запуске может завершиться успехом со значением `A`,
упасть с `E` или потребовать сервисы `R`. Тип ошибки `E` стоит в сигнатуре, где его нельзя
проигнорировать, а операторы композиции (`pipe`, `Effect.gen`, `Effect.map`,
`Effect.flatMap`) заставляют обработать пути ошибок до конца пайплайна.

## Почему это важно

Инвариант, который **никогда** не обсуждается: ошибки и отсутствие значения — это *значения
в типе*, собранные в пайплайны, а не брошенные. `throw` стирает ошибку из сигнатуры, а
`Result`/`Either`/`Effect` возвращают её обратно. Тут всё решено.

Вопрос на усмотрение — **чем именно это делать**, и решает его бандл. Effect — это рантайм,
а не библиотека обработки ошибок: планировщик файберов, цикл интерпретатора, прерывания,
scope/безопасность ресурсов и граф зависимостей `Layer`. Запуская `Effect`, вы платите за
этот рантайм независимо от того, пользуетесь им или нет.

**Замерено (`bun build --minify`, gzip):**

| Подход | min+gzip | к самописному |
| --- | --- | --- |
| Самописный `Result` (размеченное объединение + `map`/`flatMap`/`match`) | **286 B** | 1× |
| Только модуль `Either` из Effect (без рантайма) | **4.2 KB** | ~15× |
| Полный Effect (`Effect.gen` + `runPromise`) | **62 KB** | ~217× |

Каждый случай прогоняет *одну и ту же* тривиальную программу parse-double-validate. 62 KB в
последней строке — это нижняя граница, а не функция от размера программы. Это рантайм
файберов, который подтягивается в тот момент, когда вы вызываете `runPromise`.

**Почему tree-shaking не спасает от рантайма.** Tree-shaking — это удаление мёртвого кода по
достижимости: он выкидывает экспорты, на которые никто не ссылается. Средняя строка это и
доказывает: при использовании только `Either` рантайм не попадает в бандл и остаётся 4.2 KB.
Но в случае полного Effect рантайм *достижим*. Effect — это интерпретатор, а значения Effect
суть данные, а не статический граф вызовов, поэтому какие именно фичи файберов сработают,
решается во время выполнения по тегам узлов. Бандлер не может доказать, что вы никогда не
прервёте, не форкнете и не откроете scope, поэтому весь интерпретатор остаётся. Листья
(`Effect.map`, `Either.*`) вытряхнуть можно, а ствол — нет.

**Решение, с датами.** SPA для администрирования контента от 2026-03-24 внедрило Effect
по-серьёзному: `Effect.gen`/`tryPromise`/`forEach`/`Match` по всему ядру service worker,
`useAuth`/`useSWBridge` на клиенте. Там рантайм *использовался*, так что стоимость бандла
что-то покупала и была принята обоснованно. Фронтенд-приложение от 2026-06-10 пошло другим
путём. Ему нужна была только ошибка-как-значение, поэтому в него поехали самописные
result-функции, а 62 KB остались за бортом. **Оба решения верны, потому что правило
условное, а не абсолютное:**

- Используете рантайм Effect — структурную конкурентность, прерывания, повторы/планирование,
  scope/безопасность ресурсов, `Layer`/DI? **Берите Effect.** Самодельный аналог был бы
  худшей, небезопасной перереализацией того же рантайма. Размер бандла тут не та ось.
- Нужно только «ошибки и отсутствие значения — это значения»? **Берите самописный `Result`.**
  Рантайм Effect тогда мёртвый груз, который не вытрясти tree-shaking'ом, а 286 B делают своё
  дело.

Прежняя формулировка «всегда используй Effect» была слишком сильной. Она обобщала один
проект, где рантайм случайно пригодился, в универсальный дефолт. Исправленное правило —
условие выше, и поэтому у статьи `context`, а не `strong`.

## Как применять

**Лёгкий путь — самописный `Result` (берите его, когда нужна только ошибка-как-значение).**

Размеченное объединение плюс три чистые функции покрывают map/chain/fold. Оно полностью
поддаётся tree-shaking'у, не тащит рантайм и стоит несколько сотен байт:

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

Тип ошибки по-прежнему в сигнатуре, вызывающий по-прежнему не может проигнорировать путь
отказа, а `match` всё так же требует обе ветки. Вы получаете инвариант, ошибки как значения,
без рантайма на 62 KB. Это дефолт для обычной логики с возможными ошибками. К Effect-версии
ниже тянитесь, только когда проект уже использует его рантайм.

**Пайплайн на Effect против try/catch.**

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

Сигнатура сообщает вызывающему, что `fetchUserProfile` может упасть с `HttpError` или
`ParseError`. Неявного пути через throw нет, и система типов требует обработать оба случая
до запуска пайплайна.

**Effect.gen для последовательной асинхронной логики.**

Когда в пайплайне много последовательных шагов, синтаксис генераторов читается ближе к
императивному коду, не жертвуя типизированными ошибками:

```ts
const syncUserData = (userId: string): Effect.Effect<void, HttpError | ParseError | DbError> =>
  Effect.gen(function* () {
    const profile  = yield* fetchUserProfile(userId);
    const existing = yield* findExistingRecord(userId);
    const merged   = mergeProfile(existing, profile); // pure, no yield needed
    yield* saveRecord(merged);
  });
```

Каждый `yield*` — это типизированный bind. Если `fetchUserProfile` упадёт, выполнение
остановится на этой строке и ошибка распространится с сохранённым типом, без try/catch и без
коллбэка `.catch`.

**Валидация через Schema на границе.**

Модуль `Schema` из Effect заменяет рукописные type guard'ы и приведения `as` на границе
системы. Декодер возвращает разобранное значение либо роняет `Effect` со структурированной
`ParseError`:

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

**Запуск только на краю.**

`Effect.runPromise` и `Effect.runSync` — это императивная оболочка. Их место в обработчиках
событий, слушателях сообщений service worker или при старте приложения, но никогда не внутри
чистого шага пайплайна:

```ts
// Composition root / event handler (imperative shell)
self.addEventListener('message', (event) => {
  Effect.runPromise(handleMessage(event.data)).catch(reportUnhandled);
});
```

Всё выше этой границы — собранные значения `Effect`. Только оболочка превращает их в Promise
или запускает синхронно.

**Отсутствие как Option, а не null.**

Для значений, которых может не быть, `Option` из `effect` делает отсутствие явным в типе, без
`null` и `undefined`:

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

## Антипаттерны

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

## Смотри также

Статья `parse-dont-validate` продолжает эту мысль: `Schema.decode` — предпочтительная форма
валидации на границе, потому что возвращает `Effect` с типизированной `ParseError`, а не
булево значение и не нетипизированное брошенное исключение.
