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

When production is broken, the correct action is to restore service. Not to understand
why it broke. Not to write a test that proves it is broken. Not to open a PR with the
clean architectural fix. Those things are necessary — but they come after the site is
green, not before.

The instinct to "fix it properly" while the site is down is understandable: it avoids
deploying a hotfix that gets immediately superseded by the real fix. In practice it means
the site stays down longer while you write tests and review code. Users and stakeholders
are watching the outage extend. The cost of a two-step recovery (hotfix now, proper fix
later) is almost always lower than the cost of a one-step recovery that takes three times
as long.

## Why this matters

**A content-admin SPA, 2026-05-05.**

The public site build went red. The error was a YAML parse failure on a content file
(see [no-self-rolled-yaml](/kb/error-handling/no-self-rolled-yaml) for the root cause).
The build log pointed at a specific file. The correct sequence was:

1. Identify the broken file via the CI log.
2. Hot-patch the content in the content repo (not in the application repo — its `src/content`
   is gitignored; content lives one repo over).
3. Push the patch. An automation creates an empty commit on the application repo triggering
   a redeploy.
4. Watch the deploy go green. Confirm the site is up.
5. Only then: open the PR(s) that fix the root cause and add tests.

The team's first instinct was to start with step 5 — open the clean-fix PR with proper
YAML library usage, add regression tests, review, merge, deploy. This approach kept the
site red for the duration of that work. Every minute of downtime during code review and
test writing was unnecessary.

The hotfix itself (quoting a hostile YAML string in the content file) took under two
minutes once the broken file was identified. The time between "identified" and "site
green" should have been under five minutes. It was not.

## How to apply

### Step 1: Identify the broken state

```sh
# Get the failing run ID from the most recent workflow run
gh run list --workflow deploy.yml --limit 5

# View the log for the failing steps only
gh run view <run-id> --log-failed
```

The `--log-failed` flag filters to only the failing steps, which in a build-failure
scenario points directly at the file and the error. Do not spend time reading the full
log; read only the failure.

### Step 2: Hot-patch in the right repo

If the failure is in build input (content, config, environment variables) rather than in
application code, the patch goes in the input repo, not the application repo.

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

Do not move to step 4 until the deploy is confirmed green. Watch the workflow run in real
time or poll:

```sh
gh run watch --workflow deploy.yml
# or
gh run list --workflow deploy.yml --limit 1
```

The site must be up and serving correctly before the post-mortem phase begins. Take a
production screenshot if the fix is visual (see
[prove-with-production-screenshots](/kb/process/prove-with-production-screenshots)).

### Step 4: Open the root-cause PR

After the site is green, open a PR that:

- Fixes the underlying code that allowed the breakage to occur (e.g. replaces the
  self-rolled YAML serializer with a real library).
- Adds a regression test that would have caught the breakage before it reached CI.
- Documents the incident in the PR description with the timeline and the root cause.

This PR can be reviewed carefully, go through the normal review process, and be merged
without time pressure. The site is already green.

### Hostile YAML strings — the specific fix pattern

The trigger for the 2026-05-05 incident was a YAML value containing a colon. The
immediate hotfix is to quote the string:

```yaml
# ❌ Broken — colon after space is a YAML mapping indicator
title: An article about REST: designing APIs

# ✅ Fixed — single-quoted string; YAML allows colons inside single quotes
title: 'An article about REST: designing APIs'

# ✅ Also valid — double-quoted
title: "An article about REST: designing APIs"
```

The content repo's files are edited by humans; a human can apply the quote in under a
minute. The proper fix (a YAML library in the serializer, a pre-commit parse guard) is
applied in the follow-up PR.

### Triggering a redeploy without a code change

Some projects require a code change in the application repo to trigger CI, even when the
fix is in a different repo. An empty commit serves this purpose:

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

The following are actions that extend the outage unnecessarily:

**Opening a clean-fix PR while the site is down.** The PR requires review. Review takes
time. The site stays down during that time. The hotfix would have restored service in
minutes.

**Writing regression tests first.** Tests confirm the bug exists — which is already
confirmed by the production outage. Tests are necessary, but they belong in the
root-cause PR, not in the hotfix.

**Trying to understand the full root cause before acting.** "I want to understand why
this happened before I touch anything" is the correct instinct for a post-mortem. It is
the wrong instinct when the site is red. Restore first, investigate second.

**Hotfixing in the wrong repo.** If content is external to the application repo, the
hotfix goes in the content repo. Patching the wrong repo triggers a deploy that does not
include the fix.

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

This is a process rule, not a code rule. It is enforced through:

1. **Incident runbook.** A written runbook in the repo's `docs/` that spells out the
   four steps. New team members read it as part of onboarding. The runbook is the
   authoritative source of incident order.

2. **Post-incident review.** After every production incident, a brief written review
   records the timeline, the root cause, and whether the incident order was followed.
   Deviations are noted without blame; the pattern of deviations informs runbook updates.

3. **On-call awareness.** The engineer on call must know before an incident occurs which
   repo contains content, which repo triggers deploys, and how to trigger a redeploy
   without a code change. This knowledge must not be discovered during an outage.
