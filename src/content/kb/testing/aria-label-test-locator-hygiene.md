---
title: 'Accessible names are a shared namespace with your tests'
category: testing
summary: "Don't put reserved test vocabulary into unrelated aria-labels; Playwright role locators substring-match the accessible name, so an echo breaks unrelated suites."
principle: "Don't put reserved test vocabulary into unrelated aria-labels; Playwright role locators substring-match the accessible name, so an echo breaks unrelated suites. Prefer noun-led labels with a colon."
severity: strong
tags: [testing, playwright, accessibility, aria, locators]
sources:
  - project: 'a content-admin SPA'
    date: 2026-04-30
    note: 'aria-label "No new notifications" contained "new", matched getByRole button with name /new/i used for "Create new content", 11 chromium suites failed at once.'
related:
  - testing/locator-constants
  - web-components/aria-on-the-real-element
order: 5
updated: 2026-04-30
---

Accessible names are visible to Playwright's role locators through substring matching.
`getByRole('button', { name: /new/i })` finds every interactive element whose
accessible name contains "new" — including ones you never intended to target. When an
unrelated component acquires an aria-label that happens to contain a word in your test's
vocabulary, the locator suddenly matches multiple elements and the test fails with
"strict mode violation: locator resolved to 2 elements".

This is not a test problem. It is a naming problem, and it must be fixed at the label,
not by loosening the locator.

## Why this matters

On the content-admin SPA (2026-04-30), the notifications indicator received an
accessible name of `"No new notifications"` — accurate, descriptive, and reasonable in
isolation. Eleven Chromium test suites failed within the same CI run. The cause took
twenty minutes to locate: a `getByRole('button', { name: /new/i })` used throughout the
suite to target the **"Create new content"** button now matched two elements — the
create button and the notifications indicator. Both lived in the page layout, both were
`button` roles, both contained the substring `new`.

The fix required changing the notifications label to `"Notifications: none unread"`, a
noun-led label that contains no reserved vocabulary. All eleven suites recovered.

The scale of the breakage made the principle concrete: a single label change to a
component used on every page costs more than an hour of debugging time across a
mid-sized suite. Reserved vocabulary is:

- `new`, `create`, `save`, `delete`, `add`, `remove`, `edit`

Any aria-label on a status indicator, badge, counter, or decorative UI element that
contains one of these words will eventually collide with a role locator targeting an
action. In a large application the collision may happen months after the label is
written, when an unrelated team adds the conflicting test.

## How to apply

**Use noun-led labels with a colon for status and indicator elements.**

The colon pattern (`Noun: value`) is a well-established accessible name convention for
status regions. It separates the element's role from its current state, produces a
label that screen readers announce naturally ("Notifications colon none unread"), and
contains no action vocabulary.

```ts
// ❌ Dangerous — contains "new", matches /new/i role locators
html`<button aria-label="No new notifications" ...>`

// ❌ Also dangerous — "delete" matches /delete/i
html`<span aria-label="No items to delete" ...>`

// ✅ Noun-led, colon-separated, no action vocabulary
html`<button aria-label="Notifications: none unread" ...>`
html`<button aria-label="Sync status: idle" ...>`
html`<span aria-label="Queue: 0 items" ...>`
```

Before settling any new aria-label, grep the test suite for role locators that match
it:

```
grep -r "getByRole.*name.*new" e2e/
grep -r "getByRole.*name.*create" e2e/
```

If the grep finds a match in an unrelated test, the proposed label conflicts and must
change.

**Prefer `data-testid` for primary navigation in tests; reserve role locators for
accessibility assertions.**

Role locators are the right tool when you want to assert that an element is accessible
by its role and name — that is what they test. They are a fragile primary navigation
anchor because accessible names are user-visible copy subject to translation, copy
edits, and A/B tests. The stable test anchor is a `data-testid` from a colocated
locator constant; the role locator is a secondary assertion that confirms the accessible
name is correct.

```ts
// ❌ Role locator as primary navigation — fragile against copy changes and collisions
await page.getByRole('button', { name: /create/i }).click();

// ✅ testid for navigation, role locator for the accessibility assertion
await page.getByTestId(TOOLBAR.createButton).click();
await expect(page.getByTestId(TOOLBAR.createButton)).toHaveAccessibleName(
  'Create new content',
);
```

This separation also makes the test's intent clearer: the click navigates to the
feature; the role assertion verifies the accessible name is present and correct.

## Anti-patterns

```ts
// ❌ Substring role locator as the sole locator — brittle against label changes
//    and will match any future element whose name contains the substring.
const btn = page.getByRole('button', { name: /new/i });
await btn.click(); // breaks when notifications badge gets "No new notifications"

// ❌ Fixing the collision by making the locator more specific in the test,
//    rather than fixing the label.
const btn = page.getByRole('button', { name: /^Create new content$/i });
// This works today, but the label is still a trap for the next team member
// who writes a new /new/i locator and hits the same collision.

// ❌ Status text that mirrors action vocabulary without the noun-led structure.
html`<p aria-live="polite">Ready to save ${count} items</p>`
// matches /save/i — collides with save-button locators throughout the suite
```

The underlying mistake in all three is treating accessible names as private to the
component. They are not. They are visible to every Playwright `getByRole` call anywhere
in the suite, on any page that renders the component. Accessible names are a
**shared namespace**.

## Enforcement

Before merging a component that introduces a new interactive element:

1. Read the proposed aria-label.
2. Extract each significant word.
3. Run `grep -r "getByRole.*name.*<word>" e2e/` for each word.
4. If any grep returns a match, change the label to noun-led with a colon.

This takes thirty seconds and prevents a class of failures that takes twenty minutes to
debug per occurrence. Automate it with a custom lint rule on aria-label strings if the
suite is large enough to justify it.

A corollary: when writing a new role locator for an action button, use the most specific
regex or exact string you can. `{ name: 'Create new content' }` (exact, case-sensitive)
is far less likely to collide than `{ name: /new/i }`. Reserve regex matching for
content that is genuinely variable (counts, dates, user-generated text).
