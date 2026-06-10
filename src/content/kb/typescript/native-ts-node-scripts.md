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

For years, running TypeScript in Node required either compiling to JavaScript first (`tsc && node dist/script.js`), using a third-party runner (`ts-node`, `tsx`), or passing experimental flags. All three approaches add friction: a build step means the script is out of date until you run it; third-party runners are extra dependencies that can drift from the project's TypeScript version; flags are non-obvious and can silently break on Node upgrades.

Node 22 shipped native TypeScript support via type-stripping (the `--experimental-strip-types` flag, enabled by default from Node 22.6). Node 23 promoted the feature out of experimental. **Node 24**, which is the version on this machine (`v24.7.0`), runs `.ts` files directly with no flags, no config, and no extra packages:

```
node script.ts
```

That is the entire invocation. The style rule in this codebase is unambiguous: **generate only `.ts` scripts that Node can run natively. No `.js`. No third-party libs or flags. Node can run TS by itself.**

The Jira admin tooling scripts (2026-05-22) were the first place this was applied systematically. The tooling consisted of numbered `.ts` scripts (`01-fetch-sprint.ts`, `02-map-issues.ts`, etc.) that ran directly on Node 24 with no `package.json` build command and no compiled output. The scripts stayed in TypeScript throughout their lifetime; the team edited the `.ts` file and ran it immediately.

**Relationship to bun**: the project default runtime is `bun` (see [bun-by-default](/kb/tooling-runtime/bun-by-default)). The point of this article is not to prefer Node over bun — bun also runs `.ts` natively and is often the better choice. The point is that **no build pipeline is needed for scripts in either runtime**. You do not write `.js`, you do not run `tsc`, you do not install `ts-node`. That simplicity is the rule.

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

Write scripts with full TypeScript types. Type-stripping removes annotations at execution time; it does not transform syntax beyond that. Avoid TypeScript features that require transformation:

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

No tsconfig required for the execution itself (Node uses its own defaults for stripping). If you want editor type-checking, a minimal `tsconfig.json` covering the scripts directory is sufficient:

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

`enum` requires transformation that type-stripping does not perform. Replace with `as const`:

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

Node's `NodeNext` module resolution with type-stripping resolves `.ts` imports correctly.

### Numbered scripts for sequential tooling

When building a workflow that runs in steps, prefix each script with a number. The sequence is self-documenting, the files sort correctly in a directory listing, and each step can be run independently.

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

**Symptom**: developers forget to recompile after editing; they run the stale `.js` and wonder why their change has no effect.

### Using ts-node or tsx

```bash
# Bad — third-party runner, version drift, extra dependency
npx ts-node scripts/01-fetch-sprint.ts
npx tsx scripts/01-fetch-sprint.ts
```

**Symptom**: `ts-node` and `tsx` have their own TypeScript version pinned via their own dependency tree, which can diverge from the project's TypeScript. Subtle type-checking differences cause scripts that pass locally to fail in CI or vice versa.

### Writing the script in JavaScript

```typescript
// Bad — script.js with JSDoc types
/** @param {string} id */
const fetchIssue = async (id) => { /* ... */ };
```

**Symptom**: no compile-time type checking; errors surface at runtime. TypeScript is already available and runs natively; there is no reason to write untyped scripts.

### Using experimental flags explicitly

```bash
# Bad — unnecessary; Node 24 requires no flags for .ts
node --experimental-strip-types script.ts
```

**Symptom**: the flag documents a misunderstanding of the Node version in use. On Node 24 the flag is implicit; including it misleads future readers into thinking it is still required.

### Using enums

```typescript
// Bad — does not strip cleanly
enum Direction { North = 'N', South = 'S' }
```

**Symptom**: `SyntaxError: Unexpected reserved word` or `SyntaxError: Decorators are not valid here` depending on the Node version. Replace with `as const` objects.

## Enforcement

- Set `"noEmit": true` in any tsconfig covering scripts. If a CI job ever tries to write `.js` output from a scripts directory, the build should fail.
- A project-level `.gitignore` rule of `dist/` or `scripts/dist/` ensures compiled output is never committed.
- Lint rule: `@typescript-eslint/no-restricted-syntax` can ban `TSEnumDeclaration` in script files.
- The `engines` field in `package.json` should pin the minimum Node version to 22 to make the native TS capability a stated requirement:

```jsonc
{
  "engines": { "node": ">=22.0.0" }
}
```

## See also

- [bun-by-default](/kb/tooling-runtime/bun-by-default) — `bun` is the default runtime; it also runs `.ts` natively and is the preferred choice for most scripts.
