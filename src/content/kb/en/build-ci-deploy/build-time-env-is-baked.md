---
title: 'Build-time env is baked in — audit it against CI'
category: build-ci-deploy
summary: 'Vite and Astro inline public env vars as string literals at build time from the build machine; a local .env is never read by CI, so any VITE_* or public astro:env var missing from the workflow ships as an empty string or crashes a worker.'
principle: 'Vite/Astro inline public env vars (VITE_*, public astro:env) as string literals at build time from the build machine environment; a local .env is not read by CI. Audit every reference against the workflow env, fail loudly on missing, and never put server secrets behind a public prefix.'
severity: non-negotiable
tags: [build, ci, environment, vite, astro, secrets, cloudflare]
sources:
  - project: 'a static content site'
    date: 2026-04-12
    note: 'VITE_GITHUB_CLIENT_ID missing in CI → empty-string OAuth → P0 outage; looked like OAuth app deleted'
  - project: 'a Jira client app'
    date: 2026-06-08
    note: 'public astro:env inlined at build; secret astro:env validates at module init; pipe secrets to wrangler'
related:
  - build-ci-deploy/restore-prod-first-incident-order
  - web-components/no-ssr-custom-elements-on-edge
order: 1
updated: 2026-06-08
---

At build time Vite replaces every `import.meta.env.VITE_*` reference with the string
literal value of that variable, read from `process.env` on the build machine. There is no
runtime lookup. The deployed bundle just contains the literal. If `process.env.VITE_GITHUB_CLIENT_ID`
is `"gh-client-abc123"` during the build, the bundle ships `"gh-client-abc123"`. If the var
is `undefined`, the bundle ships `"undefined"`, or, with a nullish coalescing fallback, `""`.

A GitHub Actions runner is a clean Ubuntu VM and does not read your `.env` file. Variables
only exist if you declare them explicitly under `env:` in the workflow, sourced from
`vars.*` (repository variables) or `secrets.*`.

So whether the build works locally but fails in CI comes down entirely to what happens
to be present in the environment at the moment `vite build` or `astro build` runs.

## Why this matters

**P0 outage, 2026-04-12, a static content site.**

The project had a GitHub OAuth login flow. The client ID was stored in a local `.env`:

```
VITE_GITHUB_CLIENT_ID=Ov23liXXXXXXXXXXXXXX
```

It was also referenced in code with a safety fallback that was meant to be defensive:

```ts
// src/auth/github.ts — the exact pattern that shipped
const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';
const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&...`;
```

The CI workflow had no `env:` block for `VITE_GITHUB_CLIENT_ID`, so the build happily
succeeded. Vite replaced the reference with `undefined`, the `?? ''` kicked in, and the
bundle shipped `client_id=` as an empty string. Green build, green deploy, site up. The
symptom only appears when a user clicks "Sign in with GitHub":

```
GET https://github.com/login/oauth/authorize?client_id=&redirect_uri=...
→ 404
```

GitHub returns a generic 404, not an OAuth error page, so the symptom reads exactly like
"the OAuth app has been deleted or transferred." The team spent about an hour ruling out
account-level changes before a network tab inspection turned up the empty `client_id=`.

The fix was small: spot that the workflow lacked the variable, add it from the repository's
`vars.*` store, re-run the build. A three-line addition to the workflow file would have
prevented the whole outage.

**Secondary finding, 2026-06-08, a Jira client app (Astro + Cloudflare Workers).**

Astro's `astro:env` module has two variable classes:

- `PUBLIC_*` variables are inlined at build time — identical to Vite's behavior.
- `SECRET_*` variables are accessed at request time and validated at module initialisation.

Validation for secret variables runs when the module is first imported. If a secret is
absent from the worker's environment (not set via `wrangler secret put`), every route that
touches that module throws a 500 before any handler logic runs. That took out a worker
entirely after a fresh deployment to a new environment where the secrets had not yet been
provisioned.

A second trap on the same project: running `wrangler secret put NAME` interactively uploaded
an empty string when the terminal was attached to a pipeline that provided no stdin.
Cloudflare accepted it, so the secret looked "set", but its value was `""`. Always pipe the
value explicitly:

```sh
# ❌ Interactive — silently uploads "" when run non-interactively
wrangler secret put CF_API_TOKEN

# ✅ Piped — uploads the exact value, safe in scripts and CI
printf '%s' "$CF_API_TOKEN" | wrangler secret put CF_API_TOKEN
```

## How to apply

### 1. Enumerate every VITE_* and public astro:env reference

```sh
# Find every public env reference in source
grep -rn 'import\.meta\.env\.VITE_\|getSecret\|getEnv' src/ --include='*.ts' --include='*.tsx' --include='*.astro'
```

List every name. Then open your workflow file and confirm each name appears in an `env:`
block or is injected via a step.

### 2. Map each variable to its CI source

```yaml
# .github/workflows/deploy.yml

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      # Public vars: visible in the bundle — use repository variables (vars.*)
      VITE_GITHUB_CLIENT_ID: ${{ vars.VITE_GITHUB_CLIENT_ID }}
      VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
      # Sensitive but public (e.g. analytics write key): still vars.*, but document it
      VITE_POSTHOG_KEY: ${{ vars.VITE_POSTHOG_KEY }}
    steps:
      - uses: actions/checkout@v4
      - run: bun install
      - run: bun run build
```

Variables that carry no secrets belong in `vars.*` (visible in the UI, not redacted in
logs). Anything secret belongs in `secrets.*`, which redacts it. Neither is read from
`.env`.

### 3. Fail loudly on a missing variable

Replace silent fallbacks with build-time guards. A guard that throws stops a successful
build from producing a broken artifact:

```ts
// src/env.ts — import this instead of importing import.meta.env directly

// ❌ Silent fallback — the build succeeds, the artifact is broken
const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';

// ✅ Loud guard — the build fails, no broken artifact ships
const requireEnv = (name: string): string => {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

export const GITHUB_CLIENT_ID = requireEnv('VITE_GITHUB_CLIENT_ID');
```

In Astro's `astro:env`, the schema declaration itself provides the guard:

```ts
// src/env.ts (astro:env style)
import { defineConfig } from 'astro/config';

// astro.config.mjs
export default defineConfig({
  env: {
    schema: {
      // PUBLIC_ vars are inlined at build time; missing = build error
      PUBLIC_GITHUB_CLIENT_ID: envField.string({ context: 'client', access: 'public' }),
      // SECRET_ vars are validated at runtime on first import; missing = 500
      CF_API_TOKEN: envField.string({ context: 'server', access: 'secret' }),
    },
  },
});
```

### 4. Never give a server secret the VITE_ prefix

A variable prefixed `VITE_` is inlined into the client bundle and visible to anyone who
downloads the page. A credential that must not be client-visible, such as a Cloudflare API
token or a database password, must not carry the `VITE_` prefix, even when the code that
reads it only runs on the server side of a Vite-based project.

```ts
// ❌ Token visible in the client bundle
const token = import.meta.env.VITE_CF_API_TOKEN;

// ✅ Server-only: access via process.env (SSR) or astro:env SECRET_
const token = process.env.CF_API_TOKEN;
```

Rename the variable at the source. Change the workflow secret name. Rotate the credential
if it was ever deployed with the public prefix.

### 5. Provision worker secrets correctly

When deploying to Cloudflare Workers, secret variables must be present before the first
request hits the worker. Use the piped form in any non-interactive context:

```sh
# In CI, reading from a GitHub secret
printf '%s' "${{ secrets.CF_API_TOKEN }}" | wrangler secret put CF_API_TOKEN

# Locally, reading from .env
source .env && printf '%s' "$CF_API_TOKEN" | wrangler secret put CF_API_TOKEN
```

Verify with `wrangler secret list` that the secret exists and its value is non-empty
before deploying.

## Anti-patterns

```ts
// ❌ Pattern 1 — nullish fallback hides a missing var, ships empty string
const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';
// Symptom: client_id= in the OAuth redirect, GitHub 404, looks like deleted OAuth app.

// ❌ Pattern 2 — server secret behind a public prefix
const dbPassword = import.meta.env.VITE_DB_PASSWORD;
// Symptom: password visible in bundle; bundle is public.

// ❌ Pattern 3 — no workflow env: block, assumes .env is read
// (no code — the antipattern is the absence of an env: block in the YAML)
// Symptom: VITE_* is undefined on the runner; build succeeds with empty literals.

// ❌ Pattern 4 — interactive wrangler secret put in a script
wrangler secret put CF_API_TOKEN   // reads stdin; stdin is /dev/null in CI
// Symptom: secret is "set" but empty; every worker route 500s on first import.
```

## Enforcement

1. **Grep gate in CI.** Add a step before `bun run build` that confirms every `VITE_*`
   name found in source is present in the environment:

   ```sh
   # scripts/check-env.sh
   missing=0
   for name in $(grep -roh 'VITE_[A-Z0-9_]*' src/ | sort -u); do
     if [ -z "${!name}" ]; then
       echo "Missing env var: $name"
       missing=1
     fi
   done
   [ $missing -eq 0 ] || exit 1
   ```

2. **`requireEnv` at module initialisation.** The guard in `src/env.ts` (shown above)
   runs before any component or page renders; if a var is absent the build step throws and
   no artifact is produced.

3. **Repository variable audit.** Keep a comment in the workflow `env:` block listing
   every var, its source (`vars.X` or `secrets.X`), and whether it is public or sensitive.
   This comment is the authoritative list; a new joiner can provision a fresh environment
   from it without hunting through source code.

## See also

After a build-time env outage, recovery follows [restore-prod-first incident order](/principles/build-ci-deploy/restore-prod-first-incident-order):
hot-fix the workflow, confirm the green deploy, then open the root-cause PR that adds the
`requireEnv` guard. Don't write the guard first while the site is down.

The Cloudflare Workers runtime behavior of `astro:env` shows up again in
[no-ssr-custom-elements-on-edge](/principles/web-components/no-ssr-custom-elements-on-edge),
which covers other module-init pitfalls on edge runtimes.
