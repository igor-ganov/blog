---
title: 'Node runs TypeScript — write .ts scripts, no build step'
category: typescript
summary: 'Author Node utility scripts as native .ts files; Node 22+ executes them directly via type-stripping with no transpile step, no .js output, and no third-party runner.'
principle: 'Author Node scripts as native .ts that Node executes directly; no .js, no transpile step, no third-party runners or flags.'
severity: preferred
tags: [typescript, node, scripts, tooling]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'native .ts scripts, no third-party libs/flags'
  - project: 'Jira admin tooling'
    date: 2026-05-22
    note: 'numbered .ts scripts run on Node 24 native TS'
related:
  - tooling-runtime/bun-by-default
order: 5
updated: 2026-06-10
---

## Why this matters

For years, running TypeScript in Node meant one of three chores: compile to JavaScript first (`tsc && node dist/script.js`), reach for a third-party runner (`ts-node`, `tsx`), or pass experimental flags. Each one costs you something. A build step leaves the script stale until you remember to rebuild. Third-party runners are extra dependencies whose pinned TypeScript version drifts away from yours. The flags are obscure and tend to break quietly when Node upgrades under you.

Node 22 shipped native TypeScript support via type-stripping (the `--experimental-strip-types` flag, on by default from Node 22.6). Node 23 promoted the feature out of experimental. **Node 24**, which is the version on this machine (`v24.7.0`), runs `.ts` files directly with no flags, no config, and no extra packages:

```
node script.ts
```

That is the whole invocation. The style rule in this codebase leaves no room: **generate only `.ts` scripts that Node can run natively. No `.js`. No third-party libs or flags. Node can run TS by itself.**

The Jira admin tooling scripts (2026-05-22) were the first place this got applied across the board. That tooling was a set of numbered `.ts` scripts (`01-fetch-sprint.ts`, `02-map-issues.ts`, etc.) that ran straight on Node 24 with no `package.json` build command and no compiled output. They stayed in TypeScript for their whole life: edit the `.ts` file, run it, done.

**Relationship to bun**: the project default runtime is `bun` (see [bun-by-default](/kb/tooling-runtime/bun-by-default)). This article is not arguing Node over bun. Bun also runs `.ts` natively and is usually the better pick. What both runtimes share is that **no build pipeline is needed for scripts**. You do not write `.js`, you do not run `tsc`, you do not install `ts-node`.

## How to apply

### Running a script directly

```bash
# Node 24 — no flags, no build step
node script.ts

# bun — also runs .ts natively (preferred default)
bun run script.ts
# or just
bun script.ts
```

No compilation, no `dist/` folder, no intermediate `.js` file.

### Script structure

Write scripts with full TypeScript types. Type-stripping erases annotations at execution time and does nothing else to the syntax, so steer clear of any TypeScript feature that needs a real transform:

- **Allowed**: type annotations, interfaces, type aliases, generics, `as const`, `satisfies`, `import type`.
- **Not stripped (avoided in scripts)**: `enum` (use `as const` objects instead), legacy decorators, `namespace` blocks.

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

Run it:

```bash
node 01-fetch-sprint.ts
```

Execution needs no tsconfig at all; Node strips with its own defaults. If you want type-checking in the editor, a small `tsconfig.json` over the scripts directory does the job:

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

### Enum replacement

`enum` needs a transform that type-stripping never runs. Use an `as const` object instead:

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

### Importing other .ts files

When a script imports another `.ts` file, use the `.ts` extension in the import path (not `.js`):

```typescript
// Good — explicit .ts extension matches the actual file
import type { Sprint } from './types.ts';
import { parseSprint } from './parse-sprint.ts';

// Bad — .js extension that does not match any file on disk
import { parseSprint } from './parse-sprint.js';
```

Node's `NodeNext` resolution paired with type-stripping resolves `.ts` imports correctly.

### Numbered scripts for sequential tooling

When a workflow runs in steps, prefix each script with a number. The order documents itself, the files sort right in a directory listing, and you can still run any step on its own.

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

Or as a package.json convenience script:

```jsonc
{
  "scripts": {
    "report": "node scripts/01-fetch-sprint.ts && node scripts/02-map-issues.ts && node scripts/03-generate-report.ts"
  }
}
```

## Anti-patterns

### Compiling to JavaScript before running

```bash
# Bad — extra step, output files clutter the repo, script is stale between edits
tsc --project tsconfig.scripts.json
node dist/scripts/01-fetch-sprint.js
```

**Symptom**: someone edits the source, forgets to recompile, runs the stale `.js`, and can't work out why the change did nothing.

### Using ts-node or tsx

```bash
# Bad — third-party runner, version drift, extra dependency
npx ts-node scripts/01-fetch-sprint.ts
npx tsx scripts/01-fetch-sprint.ts
```

**Symptom**: `ts-node` and `tsx` pin their own TypeScript through their own dependency tree, which can drift from the project's version. Small type-checking differences then make a script pass locally and fail in CI, or the reverse.

### Writing the script in JavaScript

```typescript
// Bad — script.js with JSDoc types
/** @param {string} id */
const fetchIssue = async (id) => { /* ... */ };
```

**Symptom**: no compile-time checks, so the errors only show up at runtime. TypeScript is already there and runs natively, so writing untyped scripts buys you nothing.

### Using experimental flags explicitly

```bash
# Bad — unnecessary; Node 24 requires no flags for .ts
node --experimental-strip-types script.ts
```

**Symptom**: the flag advertises a wrong assumption about the Node version. On Node 24 it is implicit, so keeping it tricks the next reader into thinking it is still required.

### Using enums

```typescript
// Bad — does not strip cleanly
enum Direction { North = 'N', South = 'S' }
```

**Symptom**: `SyntaxError: Unexpected reserved word` or `SyntaxError: Decorators are not valid here`, depending on the Node version. Switch to `as const` objects.

## Enforcement

- Set `"noEmit": true` in any tsconfig covering scripts, so a CI job that tries to emit `.js` from a scripts directory fails the build.
- A project-level `.gitignore` rule of `dist/` or `scripts/dist/` keeps compiled output out of commits.
- Lint rule: `@typescript-eslint/no-restricted-syntax` can ban `TSEnumDeclaration` in script files.
- Pin the minimum Node version to 22 in the `engines` field of `package.json` so the native-TS capability becomes a stated requirement:

```jsonc
{
  "engines": { "node": ">=22.0.0" }
}
```

## See also

- [bun-by-default](/kb/tooling-runtime/bun-by-default) — `bun` is the default runtime; it also runs `.ts` natively and is the preferred choice for most scripts.
