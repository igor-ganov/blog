---
title: 'Одна чистая функция на файл, раскладка по использованию'
category: functional-architecture
summary: 'Разбейте логику на файлы с единственным экспортом, названные по своей функции, разложите их по дереву папок на основе использования и держите каждый файл в пределах 50 строк без учёта импортов.'
principle: 'Разложите логику на маленькие чистые функции — один экспортируемый файл на функцию (имя файла = kebab-имя функции), ≤50 строк без учёта импортов, в папках, сгруппированных по использованию, а не по слою.'
severity: strong
tags: [functional-architecture, file-organisation, pure-functions, decomposition]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-07
    note: '≤50 строк без импортов; один экспорт на файл; раскладка по использованию; глубина важнее ширины.'
  - project: 'SPA для администрирования контента'
    date: 2026-03-24
    note: 'При крупном рефакторинге 70+ файлов SW перестроены в семиуровневое дерево зависимостей.'
related:
  - functional-architecture/lint-enforces-architecture
  - functional-architecture/no-branching-switch-and-strategies
order: 1
updated: 2026-06-10
---

Файл, который экспортирует одну чистую функцию и назван по ней, — это наименьшая
единица функциональной архитектуры, которая чего-то стоит. Придайте каждому файлу
такую форму, и кодовая база превратится в дерево, по которому удобно перемещаться.
Нужное находишь, идя по пути использования, а не выискивая что-то в barrel-экспортах
или просматривая плоскую папку `utils/`.

Размер — вторая половина правила: 50 строк или меньше, без учёта строк импорта. Функция,
которой нужно больше 50 строк реализации, обычно делает две вещи — тогда её разбивают;
либо в ней лежит логика, которую надо опустить вниз, в хелпер, вызываемый из подкаталога
ниже.

## Почему это важно

Крупный рефакторинг SPA для администрирования контента (2026-03-24) перестроил больше
70 файлов сервис-воркера в **семиуровневое дерево зависимостей**. Ведущий принцип был
сформулирован прямо: «древовидная структура — глубина важнее ширины; зависимые файлы
в подкаталогах». До рефакторинга у кодовой базы были широкие и плоские папки, где
связанная логика сваливалась в один каталог независимо от того, насколько узкой она
была. Чтобы найти функцию за каким-нибудь частным случаем, приходилось читать несколько
файлов, в каждом из которых по нескольку экспортов.

После рефакторинга у каждого файла был один экспорт, имя файла совпадало с именем
функции, а специализированная логика жила в подкаталогах того, что от неё зависело.
Насколько глубоко лежит файл, говорило о том, насколько он специфичен, так что
перемещение по дереву было перемещением по графу зависимостей.

Инженерный стандарт (2026-06-07) закрепил это явно:

- Одна экспортируемая функция на файл.
- Имя файла в kebab-case равно имени функции в camelCase.
- Файлы разложены по папкам и подпапкам по **логике использования**: дерево
  углубляется по мере того, как логика специализируется.
- Побочные эффекты только в тонкой императивной оболочке наверху дерева.
- Каждый файл ≤ 50 строк **без учёта строк импорта** — встроенное правило ESLint
  `max-lines` считает импорты; чтобы обеспечить реальное ограничение, нужно
  собственное правило `max-lines-no-imports`.

## Как применять

**Папки по использованию, а не по слою.**

Раскладка по слоям группирует по технической роли (`services/`, `utils/`, `helpers/`),
поэтому каждый новый случай попадает в одни и те же плоские каталоги. Раскладка по
использованию группирует по тому, для чего нужен код: логика, существующая ради более
узкого куска логики, живёт под ним в дереве.

```
// Bad: layer-based, flat
src/
  services/
    auth.ts          // 3 exports, 200 lines
    sync.ts          // 5 exports, 300 lines
  utils/
    format.ts        // 10 exports
    validate.ts      // 8 exports

// Good: usage-based, deep
src/
  sync/
    sync-queue.ts                         // export syncQueue
    process-sync-queue/
      process-sync-queue.ts               // export processSyncQueue
      build-sync-batch/
        build-sync-batch.ts               // export buildSyncBatch
        select-pending-items.ts           // export selectPendingItems
        compute-sync-priority.ts          // export computeSyncPriority
      apply-sync-result/
        apply-sync-result.ts              // export applySyncResult
        merge-remote-patch.ts             // export mergeRemotePatch
```

Самые глубокие файлы — самые специализированные, а их вызывающие лежат ровно на уровень
выше. Ничто не тянется вбок в общий бак `utils/`, замазывая направление зависимостей.

**Один экспорт, имя файла равно имени функции.**

```ts
// Bad: format-helpers.ts — multiple exports, caller must know which one to pick
export const formatDate = (d: Date): string => ...
export const formatCurrency = (n: number): string => ...
export const formatPercent = (n: number): string => ...

// Good: format-date.ts — one export, discoverable by filename
export const formatDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'short' }).format(d);
```

Имя файла и есть API. Автодополнение и `go-to-definition` приведут тебя к нужному коду,
ни разу не открывая barrel-файл.

**Правило 50 строк и собственное правило линтера.**

Встроенное правило ESLint `max-lines` считает каждую строку, включая импорты. Файл
с 10 импортами и 50 строками реализации показывает 60 строк и не проходит проверку,
хотя сама реализация в порядке. Правило, которое нужно на самом деле, исключает импорты:

```js
// eslint.config.js (excerpt)
{
  rules: {
    // Built-in — not sufficient alone; counts imports
    'max-lines': 'off',

    // Custom plugin or inline rule — counts only non-import lines
    'local/max-lines-no-imports': ['error', { max: 50 }],
  }
}
```

Минимальный `max-lines-no-imports` считает строки, где `node.type !== 'ImportDeclaration'`,
прежде чем сравнить с лимитом. Один раз поставь его в
`eslint-rules/max-lines-no-imports.js`, и он работает во всех воркспейсах.

**Побочным эффектам место наверху дерева.**

Чистые функции компонуются без ограничений. Функция, которая читает из `localStorage`
или шлёт сетевой запрос, безопасно не компонуется, потому что её вызов в тесте даёт
побочный эффект. Держи такие эффекты в файлах у корня дерева — в файлах, которые
импортируют чистые хелперы, вызывают их и затем выполняют эффект. Чистые хелперы каждый
тестируется в изоляции, а интеграционные тесты нужны только тонкой императивной оболочке.

```ts
// pure-core/compute-retry-delay.ts — pure, testable in isolation
export const computeRetryDelay = (attempt: number, baseMs: number): number =>
  baseMs * 2 ** attempt;

// sync-item.ts — imperative shell; imports pure helpers, performs the effect
import { computeRetryDelay } from './pure-core/compute-retry-delay';

export const syncItem = async (item: SyncItem): Promise<void> => {
  const delay = computeRetryDelay(item.attempt, 500);
  await new Promise((resolve) => setTimeout(resolve, delay));
  await fetch('/api/sync', { method: 'POST', body: JSON.stringify(item) });
};
```

## Антипаттерны

```ts
// ❌ Barrel file with many exports — the filename communicates nothing about
//    the function inside; callers import from a bag of tricks.
// auth-utils.ts
export const buildAuthHeader = ...
export const parseJwt = ...
export const isTokenExpired = ...
export const refreshToken = ...

// ❌ File longer than 50 implementation lines — the function is doing too much
//    or contains logic that belongs in a named helper one level down.
// process-event.ts  (120 lines of implementation)
export const processEvent = (event: AppEvent): State => { ... }

// ❌ Folder grouped by technical layer — hides the dependency direction;
//    `utils/` grows without bound.
// utils/string-utils.ts  (14 exports across unrelated concerns)

// ❌ Default exports — the filename and the export name can diverge silently.
// format-date.ts
export default (d: Date) => ...  // consumer names it anything
```

В каждом из этих случаев имя файла перестаёт надёжно указывать на то, что код делает,
и рефакторинг превращается в чтение вместо навигации.

## Как обеспечить

Это правило держат вместе три правила линтера:

1. `local/max-lines-no-imports` — ограничивает реализацию 50 строками, игнорируя
   объявления импорта. Встроено в каталог проекта `eslint-rules/`.
2. `import/no-default-export` (или эквивалент из `@typescript-eslint`) — запрещает
   экспорты по умолчанию, чтобы имена файлов оставались каноническими именами.
3. Один экспорт на файл — либо собственное правило, считающее узлы
   `ExportNamedDeclaration`, либо архитектурное ограничение, которое держат тесты на
   соглашения о каталогах.

Все три гоняются в CI, комментарии `eslint-disable` не разрешены. Когда правило
срабатывает, разбей файл. Подавления предупреждения тут не рассматриваются.

## Смотрите также

Дерево с раскладкой по использованию — это структурный аналог правила без ветвления.
Карты стратегий делают ветвление явным и исчерпывающим; папки по использованию делают
зависимости явными и направленными. Используй оба, и архитектура читается прямо из
файловой системы.
