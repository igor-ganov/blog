---
title: 'Bun is the default runtime'
category: tooling-runtime
summary: 'Use bun for every TS/JS task in the project; fall back to another runtime only when the lockfile forces it or bun is genuinely absent.'
principle: 'Use bun for executing TS/JS, running scripts, installing deps, and serving static files; fall back to another runtime only when a project lockfile forces it or bun is genuinely missing.'
severity: strong
tags: [bun, runtime, tooling, static-server]
sources:
  - project: 'an engineering standard'
    date: 2026-05-27
    note: 'bun enforced over python http.server/node/npm; bun x serve, bun run, bun install'
related:
  - typescript/native-ts-node-scripts
order: 1
updated: 2026-06-10
---

## Why this matters

On 2026-05-27, during DDD research, the assistant reached for `python -m http.server`
to spin up a quick static file server. That got rejected on the spot. There is no reason
to invoke Python for a file-serving task when bun ships its own static server, runs
TypeScript natively, and is already on PATH.

`node`, `npx`, and `npm` get the same treatment. Each one is another mental context
switch, another source of inconsistency in the dev environment, and in most cases it
does less than the bun command it stands in for.

What makes bun the default:

- **Native TypeScript execution** — `bun run script.ts` works without a compilation step
  or a `ts-node`/`tsx` wrapper.
- **Built-in static server** — `bun x serve <dir>`, or a one-file `server.ts` with
  `Bun.serve()`, replaces every ad-hoc Python/Node HTTP server.
- **Faster installs** — `bun install` resolves and downloads packages much faster than
  `npm install`, thanks to a binary lockfile and parallel fetching.
- **Single binary** — no version mismatch between the runner and the package manager.
- **Hot reload** — `bun --hot ./server.ts` reloads instantly, no `nodemon` needed.

This blog runs on bun end to end: `bun install`, `bun run dev`, `bun run build`. An
engineering standard encodes the same as a project-wide rule.

## How to apply

### Serving static files

```bash
# Serve a built dist directory on port 4173
bun x serve dist -p 4173

# Or write a minimal typed server (no Python, no npx http-server)
bun x serve . -p 8080
```

For a richer server with API routes, write a `server.ts` and run it with hot reload:

```typescript
// server.ts
const server = Bun.serve({
  port: 4173,
  fetch(req) {
    const url = new URL(req.url);
    return new Response(Bun.file(`dist${url.pathname}`));
  },
});

console.log(`Listening on http://localhost:${server.port}`);
```

```bash
bun --hot ./server.ts
```

### Executing TypeScript scripts

```bash
# Good — bun handles the TS compilation internally
bun run scripts/seed.ts

# Also fine for package.json scripts
bun run build
bun run dev
bun run test
```

### Installing dependencies

```bash
# Good
bun install
bun add zod
bun add -d typescript

# Equivalent of npx for one-off tools
bunx prettier --write src/
bun x astro check
```

### Passing extra arguments to package scripts

Per the project convention, pass extra arguments after `--`:

```bash
bun run test -- --reporter=verbose
bun run build -- --debug
```

### Detecting the bun binary

If a script needs to locate bun programmatically:

```typescript
// Bun exposes itself as a global when running under bun
const isBun = typeof Bun !== 'undefined';
const bunVersion = isBun ? Bun.version : undefined;
```

The binary lives on PATH under the name `bun`.

## Anti-patterns

### Reaching for Python to serve files

```bash
# Bad — introduces Python dependency, no TypeScript awareness, slow startup
python -m http.server 8080

# Good
bun x serve . -p 8080
```

The symptom: the project has no Python dependency, yet a stray `python -m http.server`
shows up in a script or in the assistant's tool calls. That is the exact incident that
produced this rule (an engineering standard, 2026-05-27).

### Using node to run TypeScript

```bash
# Bad — requires ts-node or tsx, adds a compilation layer, different module resolution
npx tsx scripts/migrate.ts
node --loader ts-node/esm scripts/migrate.ts

# Good — bun resolves and executes in one step
bun run scripts/migrate.ts
```

### Using npm/npx when bun is available

```bash
# Bad — slower, different lockfile format, redundant binary
npm install
npx astro check

# Good
bun install
bun x astro check
```

The lockfile mismatch is a real risk. If `npm install` writes a `package-lock.json`
next to `bun.lockb`, CI and other developers can end up resolving different versions.

### Falling back without checking

There are only two legitimate reasons to use a different runtime:

1. A `package-lock.json` or `yarn.lock` is checked in and the project owner has not
   migrated. Respect the existing lockfile rather than silently switching.
2. Bun is genuinely absent from `$PATH` and cannot be installed in the current
   environment.

"I'm used to node" and "npm is simpler to type" do not count.

## Enforcement

The engineering standard contains the rule verbatim. The assistant reads it at session
start and applies it without being reminded. For CI, add a check to
`.github/workflows`:

```yaml
- name: Verify no npm/node fallback in scripts
  run: |
    if grep -r "npm install\|npx \|python -m http" package.json scripts/ --include="*.ts"; then
      echo "Found forbidden runtime fallback"; exit 1
    fi
```

For this blog, the `bun.lockb` at the repo root is the single source of truth for the
package manager. Any PR that introduces `package-lock.json` must be rejected.

## See also

- `typescript/native-ts-node-scripts` — executing TypeScript files natively without a
  compilation step or wrapper binary.
- Bun documentation: https://bun.sh/docs/cli/run
- Bun static file server: https://bun.sh/docs/api/http#bun-serve
