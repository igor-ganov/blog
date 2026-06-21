---
title: 'Без if и тернарных операторов — выражайте выбор исчерпывающе'
category: functional-architecture
summary: 'Замените операторы if и тернарные выражения исчерпывающим switch, таблицами стратегий или Effect/Match, чтобы компилятор доказывал, что обработана каждая ветка.'
principle: 'Никаких операторов if, никакого тернарного ?:, никаких &&/|| для управления потоком. Выражайте выбор через исчерпывающий switch, effect/Match, таблицы стратегий (Record<Key,Fn>) или сопоставление Option/Either.'
severity: strong
tags: [functional-architecture, exhaustiveness, strategy-pattern, switch, effect]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-07
    note: 'Запрет IfStatement + ConditionalExpression; обязательны switch/Match/таблицы стратегий; switch-exhaustiveness-check.'
  - project: 'SPA для администрирования контента'
    date: 2026-03-24
    note: 'Крупная цель рефакторинга: ноль операторов if, ноль императивных циклов по всей кодовой базе.'
related:
  - functional-architecture/currying-closures-higher-order
  - functional-architecture/lint-enforces-architecture
order: 2
updated: 2026-06-10
---

Оператор `if` ничего не говорит о том, сколько случаев существует. Тернарный оператор
сообщает компилятору, что их ровно два, но не то, что эти два — единственно возможные.
Ни одна из конструкций не требует исчерпываемости. Добавьте третий случай в объединение —
и компилятор промолчит: необработанный случай дойдёт до рантайма, а ошибка всплывёт
далеко от того места, где должна была быть ветка.

**`??` для подстановки значения по умолчанию допустим.** Он выбирает запасное значение,
когда результат отсутствует, а это не управление потоком. Запрет касается ветвления по
логике приложения: `if (status === 'pending')`,
`type === 'admin' ? adminView : userView`, `isLoading && <Spinner />`.

## Почему это важно

Крупный рефакторинг SPA для администрирования контента (2026-03-24) поставил явную цель:
**ноль операторов `if`, ноль императивных циклов** по всей кодовой базе. Это требование
выросло из боли. Ветвление было разбросано по обработчикам сообщений сервис-воркера,
UI-компонентам и конвейерам преобразования данных, так что каждый новый тип сообщения или
статус заставлял разработчиков искать через grep все точки ветвления и руками добавлять
очередной случай. Пропуски молчали до самого продакшена.

Инженерный стандарт (2026-06-07) закрепил правило: каждое многоветочное решение должно
быть **исчерпывающим над закрытым объединением**, чтобы компилятор доказывал тотальность.
Механизм важен меньше самой гарантии — будь то `switch` с веткой `never` по умолчанию,
`Effect/Match` или таблица стратегий `Record<Key, Fn>`.

Проверка лежит на линтере, а не на ревью:

- `no-restricted-syntax`, запрещающий `IfStatement` и `ConditionalExpression` в `src/`.
- `@typescript-eslint/switch-exhaustiveness-check`, требующий, чтобы каждый `switch`
  обрабатывал всё объединение целиком.

## Как применять

**Замените цепочку if таблицей стратегий Record.**

Таблица стратегий — это обычный объект, который сопоставляет каждому члену закрытого
объединения функцию. Добавьте новый член объединения — и вам придётся добавить новый ключ
в таблицу; компилятор отметит таблицу как неполную ещё до того, как сборка пройдёт.

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

Когда обработчику нужно выполнить функцию, а не вернуть значение, значением в таблице
становится функция:

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

**Замените тернарный оператор исчерпывающим switch.**

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

**Используйте Effect/Match для сопоставления с образцом над ADT.**

Когда выбор идёт по размеченному объединению с полезной нагрузкой, `Match` из пакета
`effect` даёт исчерпывающее сопоставление без оператора switch:

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

`Match.exhaustive` — это доказательство для компилятора. Уберите случай `Match.tag` — и
получите ошибку типа в месте объявления, а не падение в рантайме в месте вызова.

**`??` под запрет не попадает.**

Подстановка значения по умолчанию — не управление потоком и под это правило не подпадает:

```ts
// Acceptable: ?? selects a fallback when a value is absent
const label = config.label ?? 'Untitled';
```

Правило нацелено на ветвление по логике приложения. `??` всего лишь говорит «возьми
правую часть, если левая равна null или undefined», поэтому никакого решения, специфичного
для приложения, тут не принимается.

## Антипаттерны

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

У каждого паттерна выше один и тот же симптом: объединение разрастается, компилятор
молчит, и новый случай доходит до продакшена необработанным.

## Контроль

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

Эти правила работают в CI, а комментарии `eslint-disable` не разрешены. Когда правило
линтера срабатывает, исправление состоит в том, чтобы ввести таблицу стратегий или
нормальный `switch`, а не в подавлении предупреждения.
