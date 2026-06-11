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

Three GitHub Actions defaults are wrong for security, and all three are invisible
until an audit or an incident makes them visible:

1. **The ambient `GITHUB_TOKEN` defaults to a broad grant** (org/repo setting
   dependent, historically read/write). Any step — including code inside a
   compromised action or a malicious transitive dependency running during
   `bun install` — inherits it.
2. **Tags are mutable.** `uses: some-org/some-action@v4` re-resolves on every run.
   A hijacked maintainer account re-points the tag, and the next deploy runs
   attacker code adjacent to `CLOUDFLARE_API_TOKEN`.
3. **Job-level `env` hands secrets to every step**, and on `pull_request` events the
   job runs PR-authored code (GitHub withholds secrets from fork PRs by default,
   but same-repo PRs and loosened settings both bypass that comfort).

On a content-admin SPA and its public site (2026-06-11), the audit found all three
at once: nine workflows, zero `permissions:` blocks, every action tag-pinned, and a
sandbox PAT in job-level env on a `pull_request`-triggered E2E workflow.

## How to apply

Top of every workflow, before `jobs:`:

```yaml
# Least-privilege GITHUB_TOKEN — deploys use dedicated secrets,
# nothing here needs repo write access via the ambient token.
permissions:
  contents: read
```

Widening happens per job, with the reason visible: a workflow that pushes commits
uses a dedicated PAT (different blast radius, rotatable) or gets `contents: write`
on exactly the job that pushes.

Every `uses:` gets a full SHA and a human-readable comment:

```yaml
- uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
- uses: cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0 # v4.0.0
```

The comment is not decoration — dependabot's `github-actions` ecosystem reads it,
keeps the SHA moving, and updates the comment in the same PR. Pinning without
dependabot is how you end up running a two-year-old action; add both in the same
change:

```yaml
# .github/dependabot.yml
- package-ecosystem: github-actions
  directory: /
  schedule:
    interval: weekly
```

Secrets move from job-level to step-level env, and PR-triggered jobs that touch
secrets get a same-repo guard:

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

Branch protection makes the E2E/deploy checks *required* so workflow-level gates
cannot be bypassed by commit-message phrasing. Beyond that: zizmor or actionlint in
CI both flag missing `permissions:` and unpinned actions; dependabot keeps the pins
honest.
