---
title: 'When prod is red, restore first, root-cause second'
category: build-ci-deploy
summary: 'On a production outage the order is hot-fix → confirm green deploy → open root-cause PR → write tests. Writing tests or opening the clean-fix PR while the site is down extends the outage.'
principle: 'On a production outage, the order is hot-fix → confirm green deploy → open the root-cause PR → write tests. Don''t write tests or open the clean-fix PR while the site is down.'
severity: strong
tags: [incident, production, deployment, process, reliability]
sources:
  - project: 'a content-admin SPA'
    date: 2026-05-05
    note: 'order: hot-fix → green deploy → root-cause PR → tests'
related:
  - error-handling/no-self-rolled-yaml
  - process/prove-with-production-screenshots
order: 5
updated: 2026-05-05
---

When production is broken, restore service. Understanding why it broke, writing a test that
proves it broke, opening a PR with the clean architectural fix: all necessary, all after the
site is green.

The instinct to "fix it properly" while the site is down is understandable, because it avoids
deploying a hotfix that gets immediately superseded by the real fix. What it actually does is
keep the site down longer while you write tests and wait on review, with users and stakeholders
watching the outage drag on. A two-step recovery (hotfix now, proper fix later) almost always
costs less than a one-step recovery that takes three times as long.

## Why this matters

**A content-admin SPA, 2026-05-05.**

The public site build went red on a YAML parse failure in a content file
(see [no-self-rolled-yaml](/kb/error-handling/no-self-rolled-yaml) for the root cause).
The build log pointed at the offending file. The correct sequence was:

1. Identify the broken file via the CI log.
2. Hot-patch the content in the content repo (not in the application repo — its `src/content`
   is gitignored; content lives one repo over).
3. Push the patch. An automation creates an empty commit on the application repo triggering
   a redeploy.
4. Watch the deploy go green. Confirm the site is up.
5. Only then: open the PR(s) that fix the root cause and add tests.

The team's first instinct was to start at step 5: open the clean-fix PR with proper YAML
library usage, add regression tests, review, merge, deploy. That kept the site red for the
whole duration of that work, and every minute of downtime spent in code review and test
writing was avoidable.

The hotfix itself, quoting a hostile YAML string in the content file, took under two minutes
once the broken file was identified. The gap between "identified" and "site green" should
have been under five minutes. It was not.

## How to apply

### Step 1: Identify the broken state

```sh
# Get the failing run ID from the most recent workflow run
gh run list --workflow deploy.yml --limit 5

# View the log for the failing steps only
gh run view <run-id> --log-failed
```

The `--log-failed` flag filters to the failing steps, which in a build failure points
straight at the file and the error. Don't read the full log, just the failure.

### Step 2: Hot-patch in the right repo

If the failure is in build input (content, config, environment variables) rather than in
application code, the patch belongs in the input repo, not the application repo.

For the content-admin SPA content pipeline:

```sh
# Content lives in the content repo, not in the application repo
# src/content is listed in the application repo's .gitignore

# In the content repo:
git checkout master
# Edit the broken file — quote the hostile YAML string
# title: 'Correct: with colon' rather than title: Correct: with colon
git add content/articles/the-broken-file.md
git commit -m "hotfix: quote colon in title to fix build"
git push
# Automation triggers an empty commit on the application repo, which triggers redeploy
```

### Step 3: Confirm the deploy is green

Don't move to step 4 until the deploy is confirmed green. Watch the workflow run live or poll:

```sh
gh run watch --workflow deploy.yml
# or
gh run list --workflow deploy.yml --limit 1
```

The site must be up and serving correctly before the post-mortem phase starts. Take a
production screenshot if the fix is visual (see
[prove-with-production-screenshots](/kb/process/prove-with-production-screenshots)).

### Step 4: Open the root-cause PR

After the site is green, open a PR that:

- Fixes the underlying code that allowed the breakage to occur (e.g. replaces the
  self-rolled YAML serializer with a real library).
- Adds a regression test that would have caught the breakage before it reached CI.
- Documents the incident in the PR description with the timeline and the root cause.

Review this PR carefully and merge it through the normal process with no time pressure, since
the site is already green.

### Hostile YAML strings — the specific fix pattern

The 2026-05-05 incident was triggered by a YAML value containing a colon. The immediate
hotfix is to quote the string:

```yaml
# ❌ Broken — colon after space is a YAML mapping indicator
title: An article about REST: designing APIs

# ✅ Fixed — single-quoted string; YAML allows colons inside single quotes
title: 'An article about REST: designing APIs'

# ✅ Also valid — double-quoted
title: "An article about REST: designing APIs"
```

The content repo's files are hand-edited, so a human can apply the quote in under a minute.
The proper fix (a YAML library in the serializer, a pre-commit parse guard) goes in the
follow-up PR.

### Triggering a redeploy without a code change

Some projects need a code change in the application repo to trigger CI, even when the fix
lives in a different repo. An empty commit does the job:

```sh
# In the application repo
git commit --allow-empty -m "chore: trigger redeploy after content hotfix"
git push
```

Alternatively, use a GitHub Actions `workflow_dispatch` trigger if the workflow supports
it:

```sh
gh workflow run deploy.yml --ref main
```

## Anti-patterns

These all extend the outage for no reason:

**Opening a clean-fix PR while the site is down.** The PR needs review, review takes time,
and the site stays down the whole time. The hotfix would have restored service in minutes.

**Writing regression tests first.** Tests confirm the bug exists, which the production outage
already confirms. Tests are necessary, but they belong in the root-cause PR rather than the
hotfix.

**Trying to understand the full root cause before acting.** "I want to understand why this
happened before I touch anything" is the right instinct for a post-mortem and the wrong one
when the site is red. Restore first, investigate second.

**Hotfixing in the wrong repo.** If content lives outside the application repo, the hotfix
goes in the content repo. Patching the wrong repo triggers a deploy that doesn't carry the
fix.

```sh
# ❌ Wrong repo — the content site's src/content is gitignored; this change has no effect
cd content-repo
vim src/content/articles/the-broken-file.md
git add src/content/articles/the-broken-file.md
git commit -m "hotfix"
git push
# The broken file is sourced from the content repo at build time.
# This commit changes a gitignored file; the build is unchanged.
```

## Enforcement

This is a process rule rather than a code rule. Enforce it through:

1. **Incident runbook.** A written runbook in the repo's `docs/` that spells out the
   four steps. New team members read it during onboarding, and it stays the authoritative
   source for incident order.

2. **Post-incident review.** After every production incident, a brief written review
   records the timeline, the root cause, and whether the incident order was followed.
   Note deviations without blame, and let the pattern of deviations drive runbook updates.

3. **On-call awareness.** Before an incident hits, the on-call engineer needs to know which
   repo contains content, which repo triggers deploys, and how to trigger a redeploy without
   a code change. Discovering this during an outage is too late.
