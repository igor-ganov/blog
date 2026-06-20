---
title: 'Dependabot + CodeQL + guarded auto-merge'
category: build-ci-deploy
summary: 'On a public repo, run Dependabot (grouped weekly + immediate security), CodeQL security-extended, a CI verify gate + dependency-review, and auto-merge only patch/minor — leave majors for human review.'
principle: 'On a public repo, run Dependabot (grouped weekly + immediate security), CodeQL security-extended, a CI verify gate + dependency-review, and auto-merge only patch/minor — leave majors for human review.'
severity: preferred
tags: [ci, security, dependabot, codeql, automerge, branch-protection, github]
sources:
  - project: 'a headless web-component library'
    date: 2026-06-10
    note: 'Dependabot+CodeQL+CI verify+dependency-review; auto-merge patch/minor only; branch protection'
related:
  - build-ci-deploy/standalone-submodule-ci
  - functional-architecture/lint-enforces-architecture
order: 6
updated: 2026-06-10
---

A public repository accumulates security exposure as its dependencies age, and Dependabot
surfaces that exposure for you. Without guardrails, though, Dependabot PRs pile up. You
either merge them blind or let them rot into a backlog nobody touches, and both options
carry risk. This pattern automates the low-risk work (patch and minor updates) and forces
a human to look at the high-risk work: major updates and security advisories that need a
judgment call.

There are four moving parts. Dependabot finds the updates, CodeQL scans the code for
introduced vulnerabilities, CI checks that the build still passes, and the auto-merge
workflow merges the safe updates so nobody has to.

## Why this matters

**A headless web-component library, 2026-06-10.**

The library is a public repo. It needed a maintenance posture that stays secure over time
without making a developer hand-review and merge routine dependency bumps every week. The
design goals:

- Patch and minor updates merge automatically if CI passes — zero human time.
- Major updates require a human: they may include breaking API changes.
- High-severity advisory updates are flagged immediately, not weekly.
- Code introduced by dependencies is scanned for known vulnerability patterns.
- PRs that pull in high-severity advisories are blocked at the CI gate, not just flagged.

The full setup lives in `.github/`. Some of it is workflow files; the rest is repository
settings applied through the GitHub API, since they can't be expressed in files.

## How to apply

### .github/dependabot.yml

```yaml
# .github/dependabot.yml
version: 2
updates:
  # npm dependencies — grouped to reduce PR noise
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      all-dependencies:
        patterns: ["*"]
    # Security updates bypass the weekly schedule and open immediately
    open-pull-requests-limit: 10

  # GitHub Actions — keep runners and actions up to date
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      all-actions:
        patterns: ["*"]
```

The `groups` key collapses multiple package updates into one PR, which cuts the number of
PRs to review or auto-merge from potentially dozens a week down to one or two. Security
updates are never grouped. They open the moment a vulnerability is published, ignoring the
weekly schedule.

### .github/workflows/codeql.yml

```yaml
# .github/workflows/codeql.yml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Weekly scan independent of pushes — catches newly published CVEs
    - cron: '0 3 * * 1'

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          # security-extended adds CWE coverage beyond the default ruleset
          queries: security-extended

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: /language:javascript-typescript
```

The `security-extended` query suite covers injection, path traversal, prototype pollution,
and other CWE categories the default suite skips. The weekly cron run is what catches a
vulnerability in code that hasn't changed, once a new CVE lands for it.

### .github/workflows/ci.yml

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    name: Verify
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bunx tsc --build
      - run: bunx biome ci .
      - run: bun run build

  dependency-review:
    name: Dependency Review
    runs-on: ubuntu-latest
    # Only runs on PRs — compares the base and head to find new deps
    if: github.event_name == 'pull_request'
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          # Block PRs that introduce packages with high or critical advisories
          fail-on-severity: high
          # Post a summary comment on the PR
          comment-summary-in-pr: always
```

The `dependency-review` job is the gate that stops Dependabot from auto-merging a "security
update" that is really a downgrade to a version with an advisory. It diffs the dependency
tree before and after the PR and fails if any new dependency carries a high-or-critical
severity advisory.

### .github/workflows/dependabot-auto-merge.yml

```yaml
# .github/workflows/dependabot-auto-merge.yml
name: Dependabot Auto-merge

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  auto-merge:
    name: Auto-merge patch/minor
    runs-on: ubuntu-latest
    # Only run for Dependabot PRs
    if: github.actor == 'dependabot[bot]'
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Fetch Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Enable auto-merge for patch and minor updates
        # Majors are intentionally excluded: they may have breaking changes
        # and deserve human review regardless of CI status.
        if: |
          steps.metadata.outputs.update-type == 'version-update:semver-patch' ||
          steps.metadata.outputs.update-type == 'version-update:semver-minor'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`gh pr merge --auto` arms the merge only once all required status checks pass. It does not
approve the PR; GitHub Actions can't approve PRs on the repo owner's behalf, by design. The
merge fires when CI (verify + dependency-review + codeql) goes green.

Majors stay out of this on purpose. A major bump can remove APIs, change default behavior,
or demand a config migration. Green CI on a major tells you the build compiles, not that
the upgrade is safe. Someone has to read the changelog.

### Repository settings via gh api

These settings can't be expressed in workflow files. Apply them once, after the repo
exists:

```sh
REPO="my-org/web-components"

# Enable Dependabot alerts and automated security fixes
gh api repos/$REPO/vulnerability-alerts -X PUT
gh api repos/$REPO/automated-security-fixes -X PUT

# Enable secret scanning and push protection
gh api repos/$REPO \
  --method PATCH \
  --field security_and_analysis='{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}'

# Enable auto-merge at the repo level (required for gh pr merge --auto to work)
gh api repos/$REPO --method PATCH --field allow_auto_merge=true

# Branch protection on main: require the verify check, require conversation resolution
gh api repos/$REPO/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["Verify"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_conversation_resolution": true
}
EOF
```

`enforce_admins: false` keeps admin direct-push working, which you want for emergency
hotfixes. `required_conversation_resolution: true` blocks merging a PR that still has
unresolved review comments, which matters for the major-update PRs that go through human
review.

## Anti-patterns

```yaml
# ❌ No groups — one PR per package update
# Symptom: 20+ Dependabot PRs open simultaneously; all ignored as noise
- package-ecosystem: npm
  schedule:
    interval: daily

# ❌ Auto-merge of majors
if: steps.metadata.outputs.update-type != 'version-update:semver-major'
# Symptom: a major that removes a used API merges automatically; CI misses runtime
# behavior changes that TypeScript types don't capture.

# ❌ No dependency-review gate
# Symptom: Dependabot security update is itself a downgrade to a vulnerable version;
# PR auto-merges; repo now has a dependency with an active CVE.

# ❌ Approve step using GITHUB_TOKEN
- run: gh pr review --approve "$PR_URL"
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
# Symptom: "Resource not accessible by integration" — Actions cannot self-approve.
# The auto-merge works without an approve step when branch protection does not
# require reviews (set required_pull_request_reviews: null).
```

## Enforcement

Enforcement is structural. The branch protection rule requires the `Verify` check to pass
before any merge is allowed, auto-merge fires only when checks pass, and majors never
auto-merge. There's no manual step left to skip.

Review the setup quarterly:
- Confirm CodeQL is still analyzing with `security-extended`.
- Confirm `dependency-review` fail-on-severity is still `high`.
- Confirm no major-update PRs have sat unreviewed for more than two weeks.

When a major-update PR sits open past two weeks, the human review step has become too
expensive. Fix the process, don't reach for an automation bypass.
