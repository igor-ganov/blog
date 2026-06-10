---
title: 'No retries, no flakes — three green runs or it''s broken'
category: testing
summary: 'A test suite with retries enabled or a skipped test is a broken suite; run three times clean or fix the architecture.'
principle: 'Never configure test retries. Run the suite three times; if any run fails the code is broken and gets rewritten. A flaky or skipped test is a failing test.'
severity: non-negotiable
tags: [testing, playwright, e2e, determinism, ci]
sources:
  - project: 'a desktop UI tool'
    date: 2026-03-12
    note: 'No retries ever; run tests 3 times, any failure means the code is broken; if the architecture cannot guarantee deterministic behaviour the architecture is wrong — refactor.'
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'No programmatic exclusion; final confirmation requires a full stable pass; tests must pass in all specified browsers.'
related:
  - testing/event-driven-no-timeouts
  - process/prove-with-production-screenshots
order: 2
updated: 2026-06-02
---

A retry does not fix a test. It buries the failure long enough for CI to go green and
lets a race condition reach production. `retries: 2` in `playwright.config.ts` is not
a reliability setting — it is a lie that the suite is passing when it is not.

The rule is blunt: **configure zero retries, run the suite three consecutive times, and
if any single run fails the code is broken.** A test that needs a second chance is
already reporting a real defect; the retry just drowns out the signal.

## Why this matters

The no-retries standard was set on a desktop UI tool (2026-03-12) with explicit language: run
tests three times; any failure means the code is broken; if the architecture cannot
guarantee deterministic behaviour, the architecture is wrong — refactor it. Retries were
never on the table as a mitigation. Passing CI with retries is not passing CI.

The reason this is absolute rather than "minimise retries": a retry changes the
*economics* of debugging. Without retries a flaky test fails loudly on the first bad run
and blocks the merge. With retries, the same flake fails occasionally, sometimes in
production at 2 AM, and the stack trace no longer points at a test. The retry removed
the only signal that would have caught the race early.

The engineering standard is equally direct (2026-06-02):

- Programmatic test exclusion is forbidden.
- The only definition of "green" is a full, stable pass.
- Tests must pass in **all** specified browsers, not just Chromium.
- No browser-specific hacks — if Chromium passes and WebKit does not, the app behaves
  differently on WebKit and that is the bug.

The development-cycle standard encodes this as a PR gate: **flaky tests or skipped tests are
not allowed.** A PR with a `test.skip` or a test in the grep-exclusion list is not
ready to merge, no matter how complete the feature is.

## How to apply

**Step 1: Zero retries in the config.**

```ts
// ❌ playwright.config.ts — retries hide races
import { defineConfig } from '@playwright/test';

export default defineConfig({
  retries: 2, // masks flakes; remove this entirely
  use: { baseURL: 'http://localhost:4321' },
});

// ✅ playwright.config.ts — zero retries, failures are honest
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // retries field absent — defaults to 0
  use: { baseURL: 'http://localhost:4321' },
});
```

**Step 2: No programmatic test exclusion.**

```ts
// ❌ Skipping because it "sometimes fails" — this is a failing test
test.skip('navigates to /settings after save', async ({ page }) => {
  // ...
});

// ❌ Conditional skip by browser — if it only fails on WebKit, fix the app
test('drag card to Done', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'TODO: fix DnD on WebKit');
  // ...
});

// ❌ Grep exclusion in CI script — hiding tests from the runner is the same as skip
// bun run playwright --grep-invert "drag card"

// ✅ The test runs, it passes, on every browser, every time
test('drag card to Done', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByTestId(BOARD.card('PROJ-1'))).toBeVisible();
  // drive DnD with native events — see testing/native-drag-and-drop-for-tests
  await dragCard(page, 'PROJ-1', 'Done');
  await expect(page.getByTestId(BOARD.column('Done'))).toContainText('PROJ-1');
});
```

**Step 3: The three-run discipline in CI.**

Run the full suite three times in sequence in the pipeline. If any run fails, the build
fails. This is the only acceptance bar.

```yaml
# .github/workflows/ci.yml (excerpt)
- name: E2E — run 1/3
  run: bun run playwright
- name: E2E — run 2/3
  run: bun run playwright
- name: E2E — run 3/3
  run: bun run playwright
```

Running three times catches races that appear once per three runs — the failure
probability a single run would miss. Three consecutive clean runs means the suite is
stable at a confidence level that justifies merging.

**Step 4: When a test becomes flaky, treat it as a blocking defect.**

The triage protocol is:

1. Reproduce locally with `--repeat-each=10`. If it fails once in ten, the race is real.
2. Capture a trace: `bun run playwright --trace on`. Open it in the viewer and read the
   event timeline — what fired, in what order, and where the expectation failed.
3. Identify the root cause: missing wait, wrong wait signal, or a race in application
   code. See [event-driven-no-timeouts](/kb/testing/event-driven-no-timeouts) for the
   correct wait strategy.
4. Fix the root cause. Do not re-enable retries as a workaround.

## Anti-patterns

```ts
// ❌ Project-level retries. The suite will look green while hiding real failures.
export default defineConfig({ retries: process.env.CI ? 2 : 0 });

// ❌ test.fixme — also a skip; it marks a test as expected-to-fail rather than fixing it
test.fixme('modal closes on Escape', async ({ page }) => { /* ... */ });

// ❌ Suppressing output to avoid seeing failures in the terminal
export default defineConfig({ reporter: [['dot']] }); // with retries, dots lie

// ❌ Running only chromium in CI to avoid cross-browser failures
export default defineConfig({
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // webkit and firefox removed because "they're slow" — they catch real bugs
});
```

Each of these has the same symptom: CI is green, production has races that only appear
under load or on a specific browser, and the root cause is invisible because the test
suite was configured to stop reporting it.

## Enforcement

The enforcement mechanism is the CI pipeline itself: zero retries configured, three
sequential runs required, any failure blocks the build. No lint rule catches a
suppressed test in every form, so code review must verify:

- `retries` is absent from `playwright.config.ts`.
- No `test.skip`, `test.fixme`, or `test.only` is committed.
- No grep-invert exclusion in CI scripts.
- The `projects` array includes all required browsers.

A pre-commit hook or CI lint step can grep for `test\.skip|test\.fixme|test\.only|retries\s*:` and fail the
push, making the check automatic.

## See also

Retries and skips are often a symptom of the test waiting on time rather than events —
see [event-driven waits](/kb/testing/event-driven-no-timeouts). The service worker
race on the content-admin SPA is a concrete case where the fix was a correct wait, not a
retry: [wait for the service worker to settle](/kb/testing/wait-for-service-worker-settle).
