---
title: 'One pure function per file, organised by usage'
category: functional-architecture
summary: 'Split logic into single-export files named after their function, organised into usage-based folder trees, and keep each file under 50 lines excluding imports.'
principle: 'Decompose logic into small pure functions — one exported function per file (filename = kebab function name), ≤50 lines excluding imports, in folders grouped by usage, not by layer.'
severity: strong
tags: [functional-architecture, file-organisation, pure-functions, decomposition]
sources:
  - project: 'an engineering standard'
    date: 2026-06-07
    note: '≤50 lines excl imports; one export per file; folder-by-usage; depth over breadth.'
  - project: 'a content-admin SPA'
    date: 2026-03-24
    note: '70+ SW files restructured into a 7-level dependency tree during a major refactoring.'
related:
  - functional-architecture/lint-enforces-architecture
  - functional-architecture/no-branching-switch-and-strategies
order: 1
updated: 2026-06-10
---

A file that exports a single pure function and is named after that function is the
smallest coherent unit of functional architecture. When every file follows this shape,
the codebase becomes a navigable tree: find the thing you need by following the usage
path, not by hunting through barrel exports or scanning a flat `utils/` folder.

The complementary constraint is size: **≤ 50 lines excluding import lines**. That limit
is not aesthetic. A function that needs more than 50 lines of implementation is either
doing two things (split it) or contains logic that should be lifted into a helper called
from a subdirectory below it.

## Why this matters

A major refactoring of a content-admin SPA (2026-03-24) restructured over 70
service-worker files into a **7-level dependency tree**. The guiding principle stated
explicitly: "tree structure — depth over breadth; dependent files in subdirectories."
Before the refactoring, the codebase had wide, shallow folders where related logic
accumulated in the same directory regardless of specificity. Finding the function
responsible for a narrow concern meant reading multiple files with multiple exports.

After the refactoring, each file had one export, its filename was the function name, and
specialised logic lived in subdirectories of the logic that depended on it. The depth of
a file in the tree communicated its specificity. Navigating the tree was navigating the
dependency graph.

The engineering standard (2026-06-07) codified this explicitly:

- One exported function per file.
- Filename in kebab-case equals the function name in camelCase.
- Files organised into folders and subfolders by **usage logic**, deepening the tree as
  logic specialises.
- Side effects only in a thin imperative shell at the top of the tree.
- Each file ≤ 50 lines **excluding import lines** — the built-in `max-lines` ESLint rule
  counts imports; a custom `max-lines-no-imports` rule is required to enforce the real
  constraint.

## How to apply

**Folder-by-usage, not folder-by-layer.**

Layer-based layout groups by technical role (`services/`, `utils/`, `helpers/`). Every
new concern adds to the same flat directories. Usage-based layout groups by what the
code is for: logic that exists to serve a narrower piece of logic lives below it in the
tree.

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

The deepest files are the most specialised. Their callers live exactly one level up.
There are no cross-cutting imports from `utils/` that obscure the dependency direction.

**One export, filename equals function name.**

```ts
// Bad: format-helpers.ts — multiple exports, caller must know which one to pick
export const formatDate = (d: Date): string => ...
export const formatCurrency = (n: number): string => ...
export const formatPercent = (n: number): string => ...

// Good: format-date.ts — one export, discoverable by filename
export const formatDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'short' }).format(d);
```

The filename is the API. Autocomplete and `go-to-definition` work without opening
barrel files.

**The 50-line rule and the custom lint rule.**

The built-in ESLint `max-lines` rule counts every line including imports. A file with
10 imports and 50 lines of implementation reports 60 lines and fails the check. The
correct rule excludes imports:

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

A minimal implementation of `max-lines-no-imports` counts lines where
`node.type !== 'ImportDeclaration'` before comparing against the limit. Ship it once in
`eslint-rules/max-lines-no-imports.js`; the rule then applies across every workspace.

**Side effects belong at the top of the tree.**

Pure functions compose without limit. A function that reads from `localStorage` or fires
a network request cannot be composed safely because calling it in a test has a side
effect. Keep side effects in files at the root of the tree — files that import pure
helpers, call them, and then perform the effect. The pure helpers are individually
testable; only the thin imperative shell needs integration tests.

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

## Anti-patterns

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

Each anti-pattern costs in the same way: the file's name stops being a reliable pointer
to the code's purpose, and refactoring requires reading rather than navigating.

## Enforcement

Three lint rules enforce this together:

1. `local/max-lines-no-imports` — caps implementation at 50 lines, ignoring import
   declarations. Built into the project's `eslint-rules/` directory.
2. `import/no-default-export` (or `@typescript-eslint` equivalent) — bans default
   exports so that filenames remain the canonical names.
3. One-export-per-file — either a custom rule counting `ExportNamedDeclaration` nodes
   or an architectural restriction enforced by directory-convention tests.

All three run in CI. No `eslint-disable` comments. When the rule fires, the correct
response is to split the file, not to suppress the warning.

## See also

The folder-by-usage tree is the structural counterpart to the no-branching rule: just as
strategy maps make branching explicit and exhaustive, usage-based folder structure makes
dependencies explicit and directional. The two together make the architecture legible
from the filesystem.
