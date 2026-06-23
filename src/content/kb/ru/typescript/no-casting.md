---
title: 'Никаких приведений — не тянитесь за `as`'
category: typescript
summary: 'Приведение типов — это ложь компилятору; безопасность достигается через вывод типов и проектирование, а не через него.'
principle: 'Никогда не используйте `as` или non-null `!`. Если типы не сходятся — исправьте дизайн или провалидируйте данные на границе, но не приводите.'
severity: non-negotiable
tags: [typescript, type-safety, inference, validation]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-03-25
    note: 'Большой рефакторинг, фаза 3 — ноль приведений `as` во всём коде, без обходов линтера.'
  - project: 'SPA для администрирования контента (план рефакторинга)'
    date: 2026-03-24
    note: 'Обязательный принцип: никаких `any`, `as`, `!`; валидируем на границах, вычисляем внутри.'
  - project: 'edge-бот (Cloudflare Workers)'
    date: 2026-05-23
    note: 'Бот-дайджест для Telegram соблюдал no-any/no-as через рантайм-гарды в src/util/json.ts.'
related:
  - typescript/no-null-use-undefined
  - typescript/validate-at-the-boundary
  - functional-architecture/parse-dont-validate
order: 1
updated: 2026-05-23
---

Приведение типа (`value as Thing`) ничего не преобразует. Оно выключает компилятор на
одном выражении и заявляет — вашим авторитетом, а не авторитетом системы типов, — что
вам виднее. Каждый `as` — это место, где будущий рефакторинг изменит реальную форму
данных, а типы продолжат утверждать старую. Non-null-приведение `!` проделывает тот же
фокус: говорит компилятору «верь мне, это не undefined» ровно там, где он пытался вас
защитить.

Правило безусловное. Никаких `as`, никаких `!`. Не «минимизировать», не «только в
тестах», а вообще никаких.

## Почему это важно

В SPA для администрирования контента Большой рефакторинг (завершён 2026-03-24) поставил
явную цель — **ноль приведений `as` во всём коде** при **полном отсутствии обходов
линтера** — и достиг её. Мотив был не эстетический. До рефакторинга в коде висело 148
заглушённых нарушений линтера и целый класс багов, существовавших лишь потому, что
приведения и non-null-утверждения протаскивали кривые данные мимо проверки типов, а потом
ломали всё в рантайме — далеко от того места, где данные просочились.

Более глубокая причина в том, что приведение **нелокально**. Когда вы пишете
`data as Ticket`, баг, который оно открывает, всплывает не на этой строке. Он всплывает
тремя модулями дальше, когда что-то читает `ticket.assignee.login`, а `assignee` на самом
деле был `null`. Вся ценность системы типов — в локальности: она указывает на настоящую
проблему. Приведение разменивает это на секундное удобство и расплачивается потом
инцидентом на проде.

## Как применять

Когда типы не сходятся, есть три способа исправить это — и ни один из них не приведение.

**1. Спроектируйте типы так, чтобы вывод работал.** Большинство приведений — симптом типа,
описанного слишком вольно или объявленного не в том месте.

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

**2. Используйте type guard, а не утверждение.** Пользовательский type guard (`x is T`)
компилятор проверяет против реального рантайм-теста. Он сужает тип, не обманывая.

```ts
const isTicket = (value: unknown): value is Ticket =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'number';
```

**3. Валидируйте на границе.** Единственное место, где приведение выглядит соблазнительно,
— там, где в систему входят нетипизированные данные: ответ из сети, `JSON.parse`,
`localStorage`. Запустите там настоящий рантайм-валидатор (рукописный гард или
`effect/Schema` / `zod`) и верните типизированное значение либо ошибку. Внутри границы всё
уже типизировано, так что приводить попросту нечего. Это
[валидация на границе](/principles/typescript/validate-at-the-boundary).

Для отсутствующих значений берите `undefined` и моделируйте отсутствие в типе, а не через
non-null `!`. См. [никаких null, используйте undefined](/principles/typescript/no-null-use-undefined).

## Анти-паттерны

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

Каждый из первых трёх компилируется без ошибок и уезжает в прод с багом. Симптом всегда
один — рантайм-ошибка, чей стек-трейс указывает куда угодно, только не на вызвавшее её
приведение.

## Как заставить соблюдать

Сделайте это правилом линтера, а не договорённостью на ревью: ревью не ловит того, что
ловит линтер. В Biome `noExplicitAny` и `noNonNullAssertion` выставлены в `error` (см.
`biome.json` в репозитории). В связке typescript-eslint то же делают
`@typescript-eslint/no-explicit-any`, `consistent-type-assertions`
(`assertionStyle: 'never'`) и `no-non-null-assertion`. CI прогоняет линтер и валит сборку
на любом нарушении. Никаких обходов, никаких `biome-ignore`, никаких `eslint-disable`.
Если правило с вами борется — значит, дизайн неверный, и чинить надо дизайн.

## См. также

Тот же рефакторинг, что доказал это на масштабе, заодно убрал каждый `<div>` и каждый
императивный цикл за один проход. Типобезопасность, функциональная декомпозиция и
декларативные компоненты вырастают из одной цельной позиции, а не из трёх отдельных
предпочтений.
