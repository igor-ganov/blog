---
title: 'Каррирование, замыкания и функции высшего порядка вместо классов'
category: functional-architecture
summary: 'Захватывайте конфигурацию и зависимости через каррирование и замыкания, а не через конструкторы классов; переиспользование стройте на функциях высшего порядка и картах стратегий.'
principle: 'Используйте каррирование для схемы «сначала конфиг, потом данные», замыкания для захвата контекста вместо полей класса, а функции высшего порядка и карты стратегий для устранения дублирования.'
severity: preferred
tags: [functional-architecture, currying, closures, higher-order-functions, composition]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-07
    note: 'Каррирование (config)=>(data)=>result; замыкания вместо классов; ФВП; карты стратегий вместо ветвлений.'
  - project: 'SPA для администрирования контента'
    date: 2026-03-24
    note: 'Главная цель крупного рефакторинга: переиспользование через каррирование; проект как единая система; композиция/pipe.'
related:
  - functional-architecture/no-branching-switch-and-strategies
  - typescript/prefer-inference-and-import-type
order: 3
updated: 2026-06-10
---

Классы связывают состояние и поведение, чтобы кто-то мог управлять их временем жизни. В
функциональном коде нет времени жизни, которым надо управлять. Чистые функции не держат
состояния, а зависимости либо передаются аргументами, либо захватываются один раз в корне
композиции. Каррирование и замыкания покрывают ту же территорию, что и конструктор, но с
меньшим количеством механики и куда лучшей композируемостью.

Форма такая: `(config) => (data) => result`. Первый вызов один раз привязывает
конфигурацию, второй вызов — чистое преобразование. На выходе получается частично
применённая функция, которую можно передавать дальше, складывать через `pipe` или класть в
карту стратегий — без класса, без `this` и без `new`.

## Почему это важно

Крупный рефакторинг SPA для администрирования контента (2026-03-24) ставил две цели,
которым каррирование служит напрямую: **«переиспользование через каррирование»** и
**«проект как единая система»** с опорой на **«каррирование/композицию/pipe»**. До
рефакторинга переиспользование строилось на наследовании и абстрактных базовых классах,
каждый из которых тащил за собой собственную цепочку конструкторов, инициализацию полей и
жизненный цикл. Новый вариант означал новый подкласс, а добавление одного общего поведения
требовало правки каждого класса в иерархии.

После рефакторинга общее поведение жило в каррированной функции, возвращаемой из корня
композиции, а новые варианты стали просто новыми записями в карте стратегий. Ни подкласса,
ни конструктора, ни `this`.

Инженерный стандарт (2026-06-07) зафиксировал паттерн:

- Каррирование отделяет *конфигурацию* от *данных*: `(config) => (data) => result`.
- Замыкания заменяют поля класса: зависимости захватываются во внешней области видимости, а
  не хранятся как `this.dep`.
- Функции высшего порядка принимают или возвращают функции, чтобы убрать структурное
  дублирование.
- Карты стратегий (`Record<Key, Fn>`) заменяют ветвление по вариантам.

## Как применять

**Каррированная сконфигурированная функция, переиспользуемая в разных местах вызова.**

Внешний вызов происходит один раз в корне композиции. Каждое место вызова ниже получает
заранее настроенную функцию и не обязано знать, откуда взялась конфигурация.

```ts
// Bad: class with constructor injection — callers must instantiate, carry a reference
class DateFormatter {
  constructor(private readonly locale: string) {}
  format(d: Date): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'short' }).format(d);
  }
}
const formatter = new DateFormatter('en-GB');
const label = formatter.format(new Date());

// Good: curried function — configuration bound once, data flows through
const makeDateFormatter =
  (locale: string) =>
  (d: Date): string =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(d);

// Composition root (once)
const formatDate = makeDateFormatter('en-GB');

// Call sites (data-only, no config concern)
const label = formatDate(new Date());
const labels = dates.map(formatDate);          // composes directly with map
```

Каррированная форма ложится прямо в `map`, `pipe` и карты стратегий. Форме с классом каждый
раз нужен `.format.bind(formatter)` или обёртывающая лямбда.

**Замыкание захватывает зависимости вместо полей класса.**

Замыкание — это функция, возвращённая из другой функции и захватившая переменные из внешней
области видимости. Оно делает работу `this.dep` без `this`.

```ts
// Bad: class capturing an HTTP client as a field
class UserRepository {
  constructor(private readonly http: HttpClient) {}
  getUser(id: string): Promise<User> {
    return this.http.get(`/users/${id}`).then(parseUser);
  }
}

// Good: closure — http is captured, not stored; the returned function is pure in shape
const makeUserRepository =
  (http: HttpClient) =>
  (id: string): Promise<User> =>
    http.get(`/users/${id}`).then(parseUser);

// Composition root
const getUser = makeUserRepository(httpClient);

// Call site
const user = await getUser('u-42');
```

Чтобы протестировать форму с замыканием, во внешний вызов подставляется фейковый `http` — и
всё. Ни `TestBed`, ни `providers`, ни `spyOn(this.http)`.

**Функции высшего порядка убирают структурное дублирование.**

Когда две функции отличаются лишь одним внутренним шагом, вынесите этот шаг в параметр.

```ts
// Bad: two functions with identical structure, one step differs
const fetchAndParseUser = async (id: string): Promise<User> => {
  const res = await fetch(`/users/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseUser(await res.json());
};

const fetchAndParseTicket = async (id: string): Promise<Ticket> => {
  const res = await fetch(`/tickets/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseTicket(await res.json());
};

// Good: HOF — the fetch-and-parse structure is expressed once
const makeFetcher =
  <T>(path: (id: string) => string, parse: (raw: unknown) => T) =>
  async (id: string): Promise<T> => {
    const res = await fetch(path(id));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parse(await res.json());
  };

const fetchUser   = makeFetcher((id) => `/users/${id}`,   parseUser);
const fetchTicket = makeFetcher((id) => `/tickets/${id}`, parseTicket);
```

Контракт fetch-check-parse записан один раз. Новые ресурсы становятся однострочниками, а
смена формата ошибки означает правку в единственном месте.

**Карты стратегий как поиск высшего порядка.**

Когда набор функций варьируется по ключу, известному в рантайме, карта `Record<Key, Fn>`
сама по себе является структурой высшего порядка — функцией из ключей в функции. Соедините
её с каррированием, и она расширяется без трения.

```ts
type ExportFormat = 'csv' | 'json' | 'xlsx';
type Exporter = (rows: Row[]) => Blob;

const EXPORTERS: Record<ExportFormat, Exporter> = {
  csv:  exportToCsv,
  json: exportToJson,
  xlsx: exportToXlsx,
};

const exportData =
  (format: ExportFormat) =>
  (rows: Row[]): Blob =>
    EXPORTERS[format](rows);
```

Добавить `'parquet'` в `ExportFormat` и в карту `EXPORTERS` — это и есть всё изменение. Ни
`if`, ни `switch`, ни подкласса.

## Антипаттерны

```ts
// ❌ Class used purely for grouping — no lifecycle, no polymorphism; should be
//    curried functions
class StringHelpers {
  static truncate(s: string, n: number): string { ... }
  static capitalise(s: string): string { ... }
}

// ❌ Partially-configured class repeated at every call site — callers carry
//    instantiation boilerplate instead of using a curried function
const format = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short' });

// ❌ this inside a HOF — the function is not pure; it closes over mutable state
//    via the prototype chain
class EventBus {
  emit(type: string) { this.handlers[type]?.(); }
}

// ❌ Abstract base class for variation — variation belongs in a strategy map,
//    not in a hierarchy
abstract class Renderer {
  abstract render(data: unknown): string;
}
```

В каждом из этих случаев изменение общего поведения затрагивает сразу несколько классов или
файлов, а тестирование означает сборку (и обычно мокирование) графа объектов вместо передачи
обычной функции аргументом.

## Контроль соблюдения

Никакое правило линтера не запрещает классы в этом коде целиком. У `eslint-plugin-functional`
есть правило `no-class`, но команда применяет его на своё усмотрение, потому что некоторым
точкам интеграции с фреймворками (Angular-сервисы, базовые классы веб-компонентов) классы
действительно нужны. Это предпочтение держится на код-ревью и записях архитектурных решений,
а не на линтере.

Что линтер действительно требует — это отсутствие `this` в чистых модулях и отсутствие `let`
или мутирующего присваивания. `eslint-plugin-functional` с правилами `no-let` и
`immutable-data` отлавливает ровно те паттерны, из-за которых класс кажется необходимым.
Уберите мутабельное состояние — и класс схлопывается обратно в функцию.
