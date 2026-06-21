---
title: 'Node умеет запускать TypeScript — пишите .ts-скрипты без сборки'
category: typescript
summary: 'Пишите служебные скрипты для Node как обычные .ts-файлы; Node 22+ запускает их напрямую через срезание типов — без шага транспиляции, без .js-вывода и без стороннего раннера.'
principle: 'Пишите скрипты для Node как обычные .ts, которые Node запускает напрямую; никаких .js, никакого шага транспиляции, никаких сторонних раннеров или флагов.'
severity: preferred
tags: [typescript, node, scripts, tooling]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'обычные .ts-скрипты, без сторонних библиотек и флагов'
  - project: 'инструментарий для администрирования Jira'
    date: 2026-05-22
    note: 'нумерованные .ts-скрипты запускаются на нативном TS в Node 24'
related:
  - tooling-runtime/bun-by-default
order: 5
updated: 2026-06-10
---

## Зачем это нужно

Годами запуск TypeScript в Node означал одну из трёх рутин: сначала собрать в JavaScript (`tsc && node dist/script.js`), взять сторонний раннер (`ts-node`, `tsx`) или передать экспериментальные флаги. Каждый вариант чего-то стоит. Шаг сборки оставляет скрипт устаревшим, пока вы не вспомните про пересборку. Сторонние раннеры — это лишние зависимости, чья закреплённая версия TypeScript уходит в сторону от вашей. Флаги малопонятны и любят тихо ломаться, когда Node обновляется у вас под ногами.

В Node 22 появилась нативная поддержка TypeScript через срезание типов (флаг `--experimental-strip-types`, включён по умолчанию с Node 22.6). В Node 23 фича вышла из статуса экспериментальной. **Node 24**, та самая версия на этой машине (`v24.7.0`), запускает `.ts`-файлы напрямую — без флагов, без конфига и без лишних пакетов:

```
node script.ts
```

Вот и весь вызов. Правило стиля в этой кодовой базе не оставляет выбора: **создавайте только `.ts`-скрипты, которые Node запускает нативно. Никаких `.js`. Никаких сторонних библиотек или флагов. Node сам умеет запускать TS.**

Скрипты инструментария для администрирования Jira (2026-05-22) стали первым местом, где это применили повсеместно. Это был набор нумерованных `.ts`-скриптов (`01-fetch-sprint.ts`, `02-map-issues.ts` и т.д.), которые шли прямо на Node 24 без команды сборки в `package.json` и без скомпилированного вывода. Они оставались TypeScript всю свою жизнь: правишь `.ts`-файл, запускаешь, готово.

**Связь с bun**: рантайм по умолчанию в проекте — `bun` (см. [bun-by-default](/kb/tooling-runtime/bun-by-default)). Эта статья не доказывает, что Node лучше bun. Bun тоже запускает `.ts` нативно и обычно выбор лучше. Что общего у обоих рантаймов — **для скриптов не нужен конвейер сборки**. Вы не пишете `.js`, не запускаете `tsc`, не ставите `ts-node`.

## Как применять

### Запуск скрипта напрямую

```bash
# Node 24 — no flags, no build step
node script.ts

# bun — also runs .ts natively (preferred default)
bun run script.ts
# or just
bun script.ts
```

Никакой компиляции, никакой папки `dist/`, никакого промежуточного `.js`-файла.

### Структура скрипта

Пишите скрипты с полными типами TypeScript. Срезание типов убирает аннотации в момент запуска и больше ничего с синтаксисом не делает, поэтому держитесь подальше от любой возможности TypeScript, которой нужна настоящая трансформация:

- **Разрешено**: аннотации типов, интерфейсы, псевдонимы типов, дженерики, `as const`, `satisfies`, `import type`.
- **Не срезается (избегаем в скриптах)**: `enum` (используйте объекты с `as const`), legacy-декораторы, блоки `namespace`.

```typescript
// 01-fetch-sprint.ts
// Jira tooling script — runs with: node 01-fetch-sprint.ts

import type { Sprint } from './types.ts';

const JIRA_BASE = process.env['JIRA_BASE'] ?? 'https://company.atlassian.net';
const BOARD_ID = process.env['BOARD_ID'] ?? '42';

const fetchActiveSprint = async (): Promise<Sprint> => {
  const res = await fetch(`${JIRA_BASE}/rest/agile/1.0/board/${BOARD_ID}/sprint?state=active`);
  if (!res.ok) throw new Error(`Jira responded ${res.status}`);
  const body: unknown = await res.json();
  // validate here — see validate-at-the-boundary
  return body as Sprint; // replace with real decoder in production
};

const sprint = await fetchActiveSprint();
console.log(`Active sprint: ${sprint.name} (id ${sprint.id})`);
```

Запустить:

```bash
node 01-fetch-sprint.ts
```

Для запуска tsconfig вообще не нужен; Node срезает типы со своими дефолтами. Если хочется проверки типов в редакторе, маленький `tsconfig.json` над каталогом скриптов справится:

```jsonc
// tsconfig.scripts.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true  // no build output; we run .ts directly
  },
  "include": ["scripts/**/*.ts"]
}
```

### Замена enum

`enum` требует трансформации, которую срезание типов никогда не выполняет. Используйте вместо него объект с `as const`:

```typescript
// Bad — enum requires transformation, fails with type-stripping
enum IssueStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Done = 'done',
}

// Good — plain const object; no transformation needed
const IssueStatus = {
  Open: 'open',
  InProgress: 'in_progress',
  Done: 'done',
} as const;

type IssueStatus = typeof IssueStatus[keyof typeof IssueStatus];
// 'open' | 'in_progress' | 'done'
```

### Импорт других .ts-файлов

Когда скрипт импортирует другой `.ts`-файл, указывайте в пути импорта расширение `.ts` (а не `.js`):

```typescript
// Good — explicit .ts extension matches the actual file
import type { Sprint } from './types.ts';
import { parseSprint } from './parse-sprint.ts';

// Bad — .js extension that does not match any file on disk
import { parseSprint } from './parse-sprint.js';
```

Резолвинг `NodeNext` в Node в паре со срезанием типов корректно разрешает импорты `.ts`.

### Нумерованные скрипты для пошагового инструментария

Когда рабочий процесс идёт шагами, ставьте каждому скрипту префикс с номером. Порядок документирует сам себя, файлы сортируются как надо в листинге каталога, и любой шаг по-прежнему можно запустить отдельно.

```
scripts/
  01-fetch-sprint.ts
  02-map-issues.ts
  03-generate-report.ts
```

```bash
node scripts/01-fetch-sprint.ts
node scripts/02-map-issues.ts
node scripts/03-generate-report.ts
```

Или как удобный скрипт в package.json:

```jsonc
{
  "scripts": {
    "report": "node scripts/01-fetch-sprint.ts && node scripts/02-map-issues.ts && node scripts/03-generate-report.ts"
  }
}
```

## Антипаттерны

### Компиляция в JavaScript перед запуском

```bash
# Bad — extra step, output files clutter the repo, script is stale between edits
tsc --project tsconfig.scripts.json
node dist/scripts/01-fetch-sprint.js
```

**Симптом**: кто-то правит исходник, забывает пересобрать, запускает устаревший `.js` и не может понять, почему изменение ничего не дало.

### Использование ts-node или tsx

```bash
# Bad — third-party runner, version drift, extra dependency
npx ts-node scripts/01-fetch-sprint.ts
npx tsx scripts/01-fetch-sprint.ts
```

**Симптом**: `ts-node` и `tsx` тянут свой TypeScript через своё дерево зависимостей, и он может разойтись с версией проекта. Небольшие различия в проверке типов потом приводят к тому, что скрипт проходит локально и падает в CI, или наоборот.

### Написание скрипта на JavaScript

```typescript
// Bad — script.js with JSDoc types
/** @param {string} id */
const fetchIssue = async (id) => { /* ... */ };
```

**Симптом**: проверок на этапе компиляции нет, поэтому ошибки всплывают только в рантайме. TypeScript уже под рукой и запускается нативно, так что писать нетипизированные скрипты не даёт ничего.

### Явное указание экспериментальных флагов

```bash
# Bad — unnecessary; Node 24 requires no flags for .ts
node --experimental-strip-types script.ts
```

**Симптом**: флаг выдаёт неверное допущение о версии Node. На Node 24 он подразумевается по умолчанию, так что, оставив его, вы обманываете следующего читателя, который решит, что флаг всё ещё нужен.

### Использование enum

```typescript
// Bad — does not strip cleanly
enum Direction { North = 'N', South = 'S' }
```

**Симптом**: `SyntaxError: Unexpected reserved word` или `SyntaxError: Decorators are not valid here`, в зависимости от версии Node. Переходите на объекты с `as const`.

## Как обеспечить соблюдение

- Ставьте `"noEmit": true` в любом tsconfig, покрывающем скрипты, чтобы CI-задача, пытающаяся сгенерировать `.js` из каталога скриптов, проваливала сборку.
- Правило `dist/` или `scripts/dist/` в `.gitignore` уровня проекта держит скомпилированный вывод вне коммитов.
- Правило линтера: `@typescript-eslint/no-restricted-syntax` умеет запрещать `TSEnumDeclaration` в файлах скриптов.
- Закрепите минимальную версию Node на 22 в поле `engines` в `package.json`, чтобы нативная поддержка TS стала явным требованием:

```jsonc
{
  "engines": { "node": ">=22.0.0" }
}
```

## См. также

- [bun-by-default](/kb/tooling-runtime/bun-by-default) — `bun` — рантайм по умолчанию; он тоже запускает `.ts` нативно и предпочтительнее для большинства скриптов.
