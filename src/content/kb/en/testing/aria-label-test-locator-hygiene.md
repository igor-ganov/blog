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

Playwright's role locators see accessible names through substring matching.
`getByRole('button', { name: /new/i })` finds every interactive element whose
accessible name contains "new", including ones you never meant to target. So when some
unrelated component picks up an aria-label that happens to contain a word from your test
vocabulary, the locator starts matching several elements and the test dies with
"strict mode violation: locator resolved to 2 elements".

Fix it at the label. Loosening the locator only hides the real cause, which is a naming
collision.

## Why this matters

On the content-admin SPA (2026-04-30), the notifications indicator got an accessible
name of `"No new notifications"`. Accurate, descriptive, perfectly fine read in
isolation. Then eleven Chromium suites failed in the same CI run. It took twenty minutes
to find the cause: a `getByRole('button', { name: /new/i })` used all over the suite to
target the **"Create new content"** button was now matching two elements, the create
button and the notifications indicator. Both sat in the page layout, both were `button`
roles, and both carried the substring `new`.

Renaming the notifications label to `"Notifications: none unread"` fixed it, a noun-led
label with no reserved vocabulary in it. All eleven suites recovered.

The scale of the breakage is what makes the principle concrete. One label change on a
component that renders on every page cost more than an hour of debugging across a
mid-sized suite. The reserved vocabulary here:

- `new`, `create`, `save`, `delete`, `add`, `remove`, `edit`

Any aria-label on a status indicator, badge, counter, or decorative element that
contains one of these words will eventually collide with a role locator that targets an
action. In a large application the collision can land months after the label was
written, the day an unrelated team adds the conflicting test.

## How to apply

**Use noun-led labels with a colon for status and indicator elements.**

The colon pattern (`Noun: value`) is a well-established accessible name convention for
status regions. It separates the element's role from its current state, reads naturally
when a screen reader announces it ("Notifications colon none unread"), and keeps action
vocabulary out of the label.

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

Before you settle on any aria-label, grep the test suite for role locators that would
match it:

```
grep -r "getByRole.*name.*new" e2e/
grep -r "getByRole.*name.*create" e2e/
```

If the grep turns up a match in an unrelated test, the proposed label conflicts and has
to change.

**Prefer `data-testid` for primary navigation in tests; reserve role locators for
accessibility assertions.**

Role locators are the right tool for asserting that an element is reachable by its role
and name, which is exactly what they check. As a primary navigation anchor they are
fragile, because accessible names are user-visible copy that translation, copy edits, and
A/B tests all churn. Anchor navigation on a `data-testid` from a colocated locator
constant, and let the role locator be a secondary assertion that confirms the accessible
name is what you expect.

```ts
// ❌ Role locator as primary navigation — fragile against copy changes and collisions
await page.getByRole('button', { name: /create/i }).click();

// ✅ testid for navigation, role locator for the accessibility assertion
await page.getByTestId(TOOLBAR.createButton).click();
await expect(page.getByTestId(TOOLBAR.createButton)).toHaveAccessibleName(
  'Create new content',
);
```

The split also makes intent obvious. The click navigates to the feature, and the role
assertion verifies the accessible name is present and correct.

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

All three make the same mistake: treating an accessible name as private to its
component. It isn't. Every Playwright `getByRole` call anywhere in the suite can see it,
on any page that renders the component, so accessible names are effectively a shared
namespace.

## Enforcement

Before merging a component that introduces a new interactive element:

1. Read the proposed aria-label.
2. Extract each significant word.
3. Run `grep -r "getByRole.*name.*<word>" e2e/` for each word.
4. If any grep returns a match, change the label to noun-led with a colon.

It takes thirty seconds and heads off a class of failures that costs twenty minutes to
debug each time it surfaces. If the suite is large enough to justify it, automate the
check with a custom lint rule on aria-label strings.

One more thing. When you write a new role locator for an action button, make the regex or
exact string as specific as you can. `{ name: 'Create new content' }` (exact,
case-sensitive) is far less likely to collide than `{ name: /new/i }`. Keep regex
matching for content that genuinely varies: counts, dates, user-generated text.
