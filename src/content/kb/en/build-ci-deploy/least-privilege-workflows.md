---
title: 'Workflows declare permissions and pin actions by SHA'
category: build-ci-deploy
summary: 'Every GitHub Actions workflow gets an explicit least-privilege permissions block, third-party actions pinned to full commit SHAs, and secrets scoped to the step that needs them — because the default is none of those things.'
principle: 'permissions: contents: read at the top of every workflow (widen per job only when proven necessary); every uses: pinned to a 40-char SHA with the version in a comment; secrets in step-level env behind a same-repo guard, never job-level on pull_request.'
severity: strong
tags: [ci, github-actions, supply-chain, least-privilege, security]
sources:
  - project: 'a content-admin SPA'
    date: 2026-06-11
    note: 'Audit: zero permissions blocks across 9 workflows in two repos, all actions tag-pinned, a sandbox PAT in job-level env on pull_request. All three fixed in one pass; dependabot github-actions ecosystem keeps SHA pins current.'
related:
  - build-ci-deploy/dependabot-codeql-automerge
  - build-ci-deploy/build-time-env-is-baked
order: 7
updated: 2026-06-11
---

Three GitHub Actions defaults are wrong for security, and you won't see any of them
until an audit or an incident drags them into the light:

1. **The ambient `GITHUB_TOKEN` defaults to a broad grant** (it depends on the
   org/repo setting, and historically that meant read/write). Every step inherits
   it, including code inside a compromised action or a malicious transitive
   dependency that runs during `bun install`.
2. **Tags are mutable.** `uses: some-org/some-action@v4` re-resolves on every run.
   Hijack a maintainer account, re-point the tag, and the next deploy runs attacker
   code sitting right next to `CLOUDFLARE_API_TOKEN`.
3. **Job-level `env` hands secrets to every step.** On `pull_request` events that
   job runs PR-authored code. GitHub withholds secrets from fork PRs by default,
   but same-repo PRs and loosened settings both walk straight past that protection.

On a content-admin SPA and its public site (2026-06-11), the audit turned up all
three together: nine workflows with zero `permissions:` blocks, every action
tag-pinned, and a sandbox PAT in job-level env on a `pull_request`-triggered E2E
workflow.

## How to apply

Top of every workflow, before `jobs:`:

```yaml
# Least-privilege GITHUB_TOKEN — deploys use dedicated secrets,
# nothing here needs repo write access via the ambient token.
permissions:
  contents: read
```

Widen per job, and make the reason obvious. A workflow that pushes commits should
use a dedicated PAT (different blast radius, and you can rotate it) or get
`contents: write` on exactly the job that pushes, nowhere else.

Every `uses:` gets a full SHA and a human-readable comment:

```yaml
- uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
- uses: cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0 # v4.0.0
```

That comment does real work. Dependabot's `github-actions` ecosystem reads it, keeps
the SHA moving, and rewrites the comment in the same PR. Pinning without dependabot
is how you end up running a two-year-old action, so add both in one change:

```yaml
# .github/dependabot.yml
- package-ecosystem: github-actions
  directory: /
  schedule:
    interval: weekly
```

Move secrets from job-level to step-level env, and give any PR-triggered job that
touches a secret a same-repo guard:

```yaml
if: >-
  github.event_name == 'push' ||
  github.event.pull_request.head.repo.full_name == github.repository
steps:
  - name: Run real-mode suite
    env:
      GITHUB_E2E_KEY: ${{ secrets.GH_E2E_PAT }}   # this step only
    run: bun run test:e2e:realmode
```

## Anti-patterns

```yaml
# Whole-job secret on a PR trigger — every step, including PR code, sees it.
jobs:
  e2e:
    env:
      API_KEY: ${{ secrets.API_KEY }}

# Trusting a moving tag next to deploy credentials.
- uses: cloudflare/wrangler-action@v3

# Gating deploy logic on attacker-controllable text:
if: ${{ !startsWith(github.event.head_commit.message, 'content:') }}
# anyone who can phrase a commit message can skip the gate — make the
# check a required status check in branch protection instead.
```

## Enforcement

Branch protection makes the E2E/deploy checks *required*, so a workflow-level gate
can't be skipped by phrasing a commit message a certain way. On top of that, zizmor
or actionlint in CI will flag missing `permissions:` and unpinned actions, and
dependabot keeps the pins honest.
