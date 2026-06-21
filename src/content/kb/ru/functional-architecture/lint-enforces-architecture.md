---
title: 'Если правило можно сделать правилом линтера — оно должно им быть'
category: functional-architecture
summary: 'Любое архитектурное ограничение, которое выразимо в линтере, выражается линтером и проверяется в CI — никакой ревью не ловит то, что ловят автоматические инструменты.'
principle: 'Любое архитектурное правило, которое можно закодировать в линтере, кодируется в линтере и проверяется в CI — ревью не ловит того, что ловит линтер. Никаких отключений, никаких подавлений.'
severity: strong
tags: [functional-architecture, lint, ci, enforcement, eslint, biome]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-07
    note: 'ESLint ОБЯЗАН проверять, а CI ОБЯЗАН запускать: no-restricted-syntax, max-lines-no-imports, eslint-plugin-functional, switch-exhaustiveness-check.'
  - project: 'SPA для администрирования контента'
    date: 2026-03-24
    note: 'Фаза 8 крупного рефакторинга: убрано 148 подавленных нарушений и все override-блоки biome/oxlint.'
  - project: 'многопакетный монорепозиторий'
    date: 2026-04-11
    note: 'Каждый репозиторий везёт собственный конфиг biome.json/oxlint, чтобы линтер работал с чистого checkout.'
related:
  - functional-architecture/no-branching-switch-and-strategies
  - build-ci-deploy/standalone-submodule-ci
order: 5
updated: 2026-06-10
---

Правило линтера срабатывает на каждом коммите, на каждом PR, на каждом запуске CI.
Код-ревью случается один раз, под давлением сроков, человеком, который может устать или
наполовину переключиться на другую задачу. Поэтому правило, живущее только в комментариях
к ревью или в командной договорённости, размывается, а то же правило, закодированное в
линтере, держится, пока кто-нибудь намеренно его не удалит. Вся аргументация — в этой
асимметрии.

Вторая половина правила — **никаких отключений, никаких подавлений**. Комментарий
`biome-ignore` или `eslint-disable` — это дыра в архитектуре, а когда дыр становится
достаточно, правила перестают что-либо значить. Если правило линтера мешает — чини
проект, а не глуши предупреждение.

## Почему это важно

В крупном рефакторинге SPA для администрирования контента (2026-03-24) была поставлена
явная цель: **«проверка линтером — все правила выполнены, никаких отключений и
подавлений»**. Фаза 8 рефакторинга была целиком посвящена чистке линтера:

- **148 подавленных нарушений линтера** удалены — `eslint-disable`, `biome-ignore` и
  встроенные подавления.
- **9 override-блоков Biome** в `biome.json` удалены.
- **3 override-блока oxlint** удалены.

За каждым подавлением стояла одна из двух проблем: реальное нарушение, которое кто-то
решил терпеть, или правило, настроенное настолько криво, что срабатывало на корректном
коде. После фазы 8 линтер стал проходить начисто, без override-ов, и каждый последующий
PR обязан был брать ту же планку.

Инженерный стандарт (2026-06-07) перечислил конкретные правила, которые обязаны быть
включены:

- `no-restricted-syntax`, запрещающий `IfStatement` и `ConditionalExpression`.
- `local/max-lines-no-imports`, ограничивающий файл 50 строками реализации.
- `eslint-plugin-functional`: `no-let`, `immutable-data`, `no-this`.
- `eslint-plugin-fp` для дополнительных функциональных ограничений.
- `@typescript-eslint/switch-exhaustiveness-check`.
- Соглашения «один экспорт на файл» и «имя файла совпадает с экспортом».

Решение по многопакетному монорепозиторию (2026-04-11) добавило правило: **каждый
репозиторий везёт собственный `biome.json` и конфиг oxlint**. Тогда линтер работает с
чистого checkout, не опираясь на общий конфиг, который расходится между проектами.

Этот блоговый репозиторий делает то же самое. Его `biome.json` включает
`noEmptyBlockStatements`, `noExplicitAny` и `noNonNullAssertion` на уровне error без
единого override.

## Как применять

**Канонический конфиг ESLint для этой архитектуры.**

```js
// eslint.config.js
import functional from 'eslint-plugin-functional';
import fp         from 'eslint-plugin-fp';
import tseslint   from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: { functional, fp },
    rules: {
      // ── Branching ban ──────────────────────────────────────────────────────
      'no-restricted-syntax': [
        'error',
        { selector: 'IfStatement',         message: 'No if. Use switch or strategy maps.' },
        { selector: 'ConditionalExpression', message: 'No ternary. Use switch or strategy maps.' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // ── File-size cap (excludes import lines) ──────────────────────────────
      'max-lines': 'off',
      'local/max-lines-no-imports': ['error', { max: 50 }],

      // ── Functional constraints ─────────────────────────────────────────────
      'functional/no-let':         'error',
      'functional/immutable-data': 'error',
      'functional/no-this':        'error',
      'fp/no-loops':               'error',

      // ── Single export per file ─────────────────────────────────────────────
      'import/no-default-export':   'error',
      // custom rule: exactly one ExportNamedDeclaration per file
      'local/one-export-per-file':  'error',
    },
  },
);
```

**Кастомное правило `max-lines-no-imports` (написать один раз, переиспользовать везде).**

```js
// eslint-rules/max-lines-no-imports.js
/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    schema: [{ type: 'object', properties: { max: { type: 'number' } } }],
    messages: { exceed: 'File has {{count}} implementation lines (max {{max}}).' },
  },
  create(context) {
    return {
      Program(node) {
        const max = context.options[0]?.max ?? 50;
        const lines = node.body.filter(
          (n) => n.type !== 'ImportDeclaration',
        );
        const count = lines.length === 0
          ? 0
          : lines.at(-1).loc.end.line - lines[0].loc.start.line + 1;
        if (count > max) {
          context.report({
            node,
            messageId: 'exceed',
            data: { count, max },
          });
        }
      },
    };
  },
};
```

Подключите его в `eslint.config.js` как `plugins: { local: { rules: { 'max-lines-no-imports': rule } } }`.

**Конфиг Biome (правила, проверяемые в этом репозитории).**

```json
// biome.json (excerpt)
{
  "linter": {
    "rules": {
      "correctness": {
        "noEmptyBlockStatements": "error"
      },
      "suspicious": {
        "noExplicitAny": "error"
      },
      "style": {
        "noNonNullAssertion": "error"
      }
    }
  }
}
```

Никакого блока `overrides`. Никаких `// biome-ignore`. Конфиг едет вместе с репозиторием
и работает с чистого checkout.

**Гейт в CI.**

```yaml
# .github/workflows/ci.yml (excerpt)
- name: Lint
  run: bun run lint
  # Fails the build on any lint error.
  # No --max-warnings flag that lets warnings through.
```

Шаг линтера роняет сборку на первой же ошибке. Флаг `--max-warnings 0` не нужен, потому
что в конфиге изначально нет ни одного правила на уровне `warn`. Всё, что стоит
проверять, выставлено в `error`.

**Что делать, когда правило сработало.**

Ошибка линтера в PR — это не предмет переговоров. У тебя два варианта:

1. Поправить проект так, чтобы он удовлетворял правилу.
2. Подать RFC на удаление или изменение правила — это осознанное и проверенное решение.

Третьего не дано. `eslint-disable` — это не он, и подавления не попадают в merge.

## Антипаттерны

```ts
// ❌ Inline suppression — the rule is broken here, permanently
// eslint-disable-next-line functional/no-let
let count = 0;

// ❌ biome.json override block — a named scope where rules are relaxed,
//    effectively punching a hole in the architecture
// "overrides": [{ "include": ["src/legacy/**"], "linter": { "rules": { ... } } }]

// ❌ Rule at 'warn' severity instead of 'error' — warnings accumulate and are
//    ignored; only 'error' fails CI
'functional/no-let': 'warn',

// ❌ Architecture rule documented only in a README or wiki — it will be missed
//    on the next onboarding, the next late-night PR, the next deadline push
```

Каждый из этих пунктов открывает зазор между правилом как оно написано и правилом как
оно проверяется, и зазор со временем только растёт. В SPA для администрирования контента
было 148 таких зазоров, прежде чем фаза 8 их закрыла.

## Смотрите также

Правило «без ветвлений», правило размера файла и правило «один экспорт» ничего не значат,
пока что-то их не проверяет. Линтер — это то, что превращает заявленное предпочтение в
архитектурное ограничение. Остальные статьи в `functional-architecture/` описывают сами
правила; эта описывает механизм, благодаря которому любое из них держится.
