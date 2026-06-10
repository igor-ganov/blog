---
title: 'Every repo must build standalone in CI'
category: build-ci-deploy
summary: 'A repo checked out alone in CI must contain everything it needs: inline tsconfig, its own biome config, .gitattributes eol=lf, no parent-dir lint refs, devDeps in its own package.json, and github:org/repo deps instead of workspace:*.'
principle: 'A repo checked out alone in CI must contain everything it needs: inline tsconfig (no extends ../base), its own biome config, .gitattributes eol=lf, no parent-dir lint refs, devDeps in its own package.json, and github:org/repo deps instead of workspace:*.'
severity: strong
tags: [ci, typescript, biome, git, monorepo, submodule, build]
sources:
  - project: 'a multi-package monorepo'
    date: 2026-04-11
    note: 'submodule repos must be self-contained for independent CI checkout'
related:
  - build-ci-deploy/crlf-lf-discipline
  - functional-architecture/lint-enforces-architecture
order: 3
updated: 2026-04-11
---

A submodule or standalone repo that works on a developer's machine but fails in CI is
one of the most expensive categories of false negatives: the CI runner checks out only
that repo, on a clean Linux VM, with no parent directory. If the repo depends on anything
outside its own tree — a shared tsconfig, a biome config in `../`, a package installed in
a workspace root — the CI run fails at a step that has nothing to do with the actual change
being tested.

The rule is simple: if you can check out the repo into an empty directory, run
`bun install` and then `tsc --build` and `bunx biome ci .`, and all three succeed, the
repo is standalone. If any step fails without the parent directory present, the repo is
not standalone and must be fixed before the CI pipeline is reliable.

## Why this matters

**A multi-package monorepo, 2026-04-11.**

The library was developed as part of a monorepo on the developer's machine.
The `tsconfig.json` used `extends`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  }
}
```

The biome config referenced a shared config from the parent:

```json
{
  "extends": ["../../biome.json"]
}
```

The lint script in `package.json` pointed at an oxlint config two directories up:

```json
{
  "scripts": {
    "lint": "oxlint --config ../../.oxlintrc.json src/"
  }
}
```

Cross-repo dependencies used workspace protocol:

```json
{
  "dependencies": {
    "@acme/shared": "workspace:*"
  }
}
```

On the developer's machine all of this worked: the parent directory existed, the workspace
was installed, and the shared package resolved. In CI, the runner cloned only the repo
into `/home/runner/work/`. The parent directory `../../` did not exist.
Every command failed with a different error message, none of which pointed at the
configuration as the root cause:

- `tsc --build` — "Cannot find file '../../tsconfig.base.json'"
- `bunx biome ci .` — "Failed to load config: ../../biome.json not found"
- `bun run lint` — "Cannot open config file: ../../.oxlintrc.json"
- `bun install` — workspace shared package not found in registry

Four separate failures, four separate debugging sessions, before the pattern became
obvious: every failure traced back to a path that escaped the repo root.

The fix addressed each category:

1. Inline all TypeScript compiler options — no `extends` to an outside path.
2. Add a self-contained `biome.json` with the full configuration inline.
3. Replace the oxlint script's config path with a `biome ci .` call against the local
   config.
4. Replace `workspace:*` deps with `github:org/repo#commit-or-tag` references.
5. Move all `devDependencies` (biome, oxlint, typescript) into the repo's own
   `package.json`.
6. Add `.gitattributes` with `* text=auto eol=lf` (see
   [CRLF/LF discipline](/kb/build-ci-deploy/crlf-lf-discipline)).
7. Remove `--frozen-lockfile` from the CI install step — lockfiles are not committed for
   submodule repos.

## How to apply

### tsconfig.json — inline everything

```json
// ❌ Depends on a file outside the repo
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  }
}

// ✅ Self-contained — all options inline
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

Copy the compiler options from the shared base at the time of extraction. The copy may
diverge over time — that is acceptable. Divergence is visible and intentional; a broken
`extends` path is invisible and unintentional.

### biome.json — self-contained with correct schema

```json
// ❌ Extends an outside config
{
  "extends": ["../../biome.json"]
}

// ✅ Self-contained; schema version matches the installed biome version
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "includes": ["**", "!!dist/**", "!!node_modules/**"]
  }
}
```

The `files.includes` pattern is the Biome 2.x negation syntax. Using `"!!"` to exclude
`dist/` prevents Biome from linting compiled output. Without this exclusion, Biome lints
generated files and produces errors that are irrelevant to the source.

### package.json — devDeps present, no workspace refs

```json
// ❌ Missing devDeps (assumed to be in workspace root), workspace dep
{
  "name": "@org/my-lib",
  "dependencies": {
    "@org/shared": "workspace:*"
  }
}

// ✅ devDeps in the repo, github: ref for cross-repo deps
{
  "name": "@org/my-lib",
  "devDependencies": {
    "@biomejs/biome": "2.0.0",
    "typescript": "5.8.3"
  },
  "dependencies": {
    "@org/shared": "github:org/shared#v1.4.2"
  }
}
```

The `github:org/repo#ref` format resolves without a registry lookup or a local workspace.
The ref should be a tag or a commit hash — a branch name is mutable and is not
reproducible.

### .gitattributes — enforce LF line endings

```gitattributes
# .gitattributes at the repo root
* text=auto eol=lf
```

This ensures that every text file in the repo uses LF line endings in the git object
store, regardless of the developer's platform. See
[CRLF/LF discipline](/kb/build-ci-deploy/crlf-lf-discipline) for the full rationale.

### CI workflow — no --frozen-lockfile for submodule repos

```yaml
# .github/workflows/ci.yml

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      # ❌ --frozen-lockfile fails if bun.lockb is not committed
      - run: bun install --frozen-lockfile

      # ✅ Plain install — lockfile not committed for submodule repos
      - run: bun install

      - run: bunx tsc --build
      - run: bunx biome ci .
```

Lockfiles for submodule repos are not committed to git (they contain absolute paths and
workspace-relative hashes that are meaningless outside the developer's machine). The
`--frozen-lockfile` flag requires a committed lockfile and fails without one.

### Verify standalone checkout

Before opening a PR, verify the repo builds from scratch:

```sh
# In a temp directory — not inside the monorepo
git clone git@github.com:org/repo.git /tmp/repo-test
cd /tmp/repo-test
bun install
bunx tsc --build
bunx biome ci .
# All three must succeed with no errors
```

## Anti-patterns

```jsonc
// ❌ tsconfig.json — extends an outside path
// Symptom: "Cannot find file ../../tsconfig.base.json" in CI
{ "extends": "../../tsconfig.base.json" }

// ❌ biome.json — extends an outside config
// Symptom: "Failed to load config: ../../biome.json not found" in CI
{ "extends": ["../../biome.json"] }

// ❌ package.json — workspace dep
// Symptom: bun install fails; shared package not found in registry
{ "dependencies": { "@org/shared": "workspace:*" } }

// ❌ package.json — missing devDeps
// Symptom: bunx biome — command not found; tsc — command not found
{ "devDependencies": {} }
```

```yaml
# ❌ CI workflow — frozen lockfile without committed bun.lockb
- run: bun install --frozen-lockfile
# Symptom: "error: lockfile not found" — bun.lockb is not in the repo
```

## Enforcement

1. **Standalone checkout test.** Make the first step of the CI workflow a validation
   that the checkout is genuinely isolated — no symlinks to outside directories, no
   `../` paths in any config file:

   ```sh
   # Fail if any config file references a parent directory
   grep -r '\.\./\.\.' tsconfig.json biome.json package.json 2>/dev/null && {
     echo "Config file references a parent-directory path — repo is not standalone"
     exit 1
   } || true
   ```

2. **`tsc --build` and `bunx biome ci .` as required CI steps.** Both must pass from
   a clean checkout. Gate merges on these checks.

3. **`github:` refs in code review.** Any `workspace:*` or `file:../` dependency in
   a submodule repo's `package.json` is a defect. Flag it in review.
