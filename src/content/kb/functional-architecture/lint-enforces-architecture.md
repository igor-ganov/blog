---
title: 'If a rule can be a lint rule, it must be'
category: functional-architecture
summary: 'Every architectural constraint that can be expressed as lint is expressed as lint and enforced in CI — no review processes catch what automated tools can.'
principle: 'Every architectural rule that can be encoded as lint is encoded as lint and enforced in CI — reviews do not catch what lint can. No overrides, no suppressions.'
severity: strong
tags: [functional-architecture, lint, ci, enforcement, eslint, biome]
sources:
  - project: 'an engineering standard'
    date: 2026-06-07
    note: 'ESLint MUST enforce and CI MUST run: no-restricted-syntax, max-lines-no-imports, eslint-plugin-functional, switch-exhaustiveness-check.'
  - project: 'a content-admin SPA'
    date: 2026-03-24
    note: 'A major refactoring phase 8: removed 148 suppressed violations + all biome/oxlint override blocks.'
  - project: 'a multi-package monorepo'
    date: 2026-04-11
    note: 'Each repo ships its own biome.json/oxlint config so lint runs from a fresh checkout.'
related:
  - functional-architecture/no-branching-switch-and-strategies
  - build-ci-deploy/standalone-submodule-ci
order: 5
updated: 2026-06-10
---

A lint rule runs on every commit, every PR, every CI invocation. A code review happens
once, under time pressure, by a person who may be fatigued or context-switched. The two
are not comparable. An architectural rule that lives only in review comments or team
conventions will erode. An architectural rule that lives in lint will hold until someone
deliberately removes the rule.

The corollary is equally important: **no overrides, no suppressions**. A `biome-ignore`
or `eslint-disable` comment is a hole in the architecture. Enough holes and the rules
mean nothing. When a lint rule is fighting you, the correct response is to fix the
design, not to suppress the warning.

## Why this matters

A major refactoring of a content-admin SPA (2026-03-24) set an explicit goal:
**"linter enforcement — all rules satisfied, no overrides/suppressions."** Phase 8 of
the refactoring was dedicated entirely to lint cleanup:

- **148 suppressed lint violations** removed — `eslint-disable`, `biome-ignore`, and
  inline suppressions.
- **9 Biome override blocks** in `biome.json` removed.
- **3 oxlint override blocks** removed.

Each suppression represented either a real violation that was tolerated, or a rule so
misconfigured that it fired falsely — both states are problems. After phase 8, the
linter ran clean with no overrides. Every subsequent PR had to pass the same bar.

The engineering standard (2026-06-07) specified the exact rules that must be
active:

- `no-restricted-syntax` banning `IfStatement` and `ConditionalExpression`.
- `local/max-lines-no-imports` capping files at 50 implementation lines.
- `eslint-plugin-functional`: `no-let`, `immutable-data`, `no-this`.
- `eslint-plugin-fp` for additional functional constraints.
- `@typescript-eslint/switch-exhaustiveness-check`.
- One-export-per-file and filename-matches-export conventions.

The multi-package monorepo decision (2026-04-11) added: **each repo ships its own `biome.json`
and oxlint config**. Lint runs from a fresh checkout without relying on shared config
that may drift between projects.

This blog repository itself demonstrates the pattern: `biome.json` enforces
`noEmptyBlockStatements`, `noExplicitAny`, and `noNonNullAssertion` at error severity
with no overrides.

## How to apply

**The canonical ESLint config for this architecture.**

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

**The custom `max-lines-no-imports` rule (ship once, reuse everywhere).**

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

Register it in `eslint.config.js` as `plugins: { local: { rules: { 'max-lines-no-imports': rule } } }`.

**Biome config (this repo's enforced rules).**

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

No `overrides` block. No `// biome-ignore`. The config ships with the repository and
runs from a clean checkout.

**CI gate.**

```yaml
# .github/workflows/ci.yml (excerpt)
- name: Lint
  run: bun run lint
  # Fails the build on any lint error.
  # No --max-warnings flag that lets warnings through.
```

The lint step fails the build on the first error. `--max-warnings 0` is implicit in
`bun run lint` because the config has no rules at `warn` severity — everything that
matters is `error`.

**What to do when a rule fires.**

A lint error on a PR is not a negotiation. The options are:

1. Fix the design so it satisfies the rule.
2. Submit an RFC to remove or modify the rule itself — a deliberate, reviewed decision.

There is no option 3 (`eslint-disable`). Suppressions are not merged.

## Anti-patterns

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

Each pattern creates a gap between the written rule and the enforced rule. The gap widens
over time. The content-admin SPA had 148 such gaps before phase 8 closed them.

## See also

The no-branching rule, the file-size rule, and the one-export rule only have meaning if
they are enforced. Lint enforcement is what converts a preference into an architectural
constraint. The rules documented in the other `functional-architecture/` articles are
the content; this article is the mechanism that makes them real.
