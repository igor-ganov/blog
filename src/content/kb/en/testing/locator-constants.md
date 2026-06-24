---
title: 'Locator constants colocated with the component'
category: testing
summary: 'E2E locators live in a constants file next to the component and are referenced in both the component markup and the tests — never as duplicated string literals.'
principle: 'E2E locators live in a constants file next to the component and are referenced both in the component (as test ids/attributes) and in the tests — never duplicated string selectors.'
severity: strong
tags: [testing, playwright, e2e, locators, components]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'Use constants placed in a separate file next to the component; reference them in the component as well.'
related:
  - testing/aria-label-test-locator-hygiene
  - web-components/lit-functional-core
order: 3
updated: 2026-06-02
---

A `data-testid="toc-toggle"` string in a component and the same string copied
into a test are two independent facts pretending to describe one thing. Change the test
id in the component and only one of the two strings moves. If you're lucky the test
breaks at runtime; if you're not, nobody touches the component and the drift sits there
unnoticed. You find out in CI, not in your editor.

The fix is to put the string once, in a constants file next to the component,
and have both the component and the test import it. Now it can't drift.

## Why this matters

The engineering standard (2026-06-02) says it plainly: keep the constants in a separate
file next to the component, and reference them from the component too.

This blog follows that across its web component layer. The `toc-drawer` and
`kb-filter` components each ship a `.locators.ts` sibling:

```
src/components/islands/
  toc-drawer.ts              ← component
  toc-drawer.locators.ts     ← constants exported as const
  toc-drawer.styles.ts
  kb-filter.ts
  kb-filter.locators.ts
```

`toc-drawer.locators.ts` exports:

```ts
export const TOC_DRAWER = {
  tag: 'toc-drawer',
  toggle: 'toc-toggle',
  panel: 'toc-panel',
  close: 'toc-close',
  backdrop: 'toc-backdrop',
} as const;
```

`kb-filter.locators.ts` exports:

```ts
export const KB_FILTER = {
  tag: 'kb-filter',
  input: 'kb-filter-input',
  count: 'kb-filter-count',
  empty: 'kb-filter-empty',
  chip: 'kb-filter-chip',
  chipTag: 'data-tag',
  item: 'data-kb-item',
  haystack: 'data-haystack',
  itemTags: 'data-tags',
} as const;
```

The `toc-drawer.ts` component imports from its sibling and writes `TOC_DRAWER.tag`
as the custom element name and `TOC_DRAWER.toggle` into `data-testid`. The test does
the same import and calls `page.getByTestId(TOC_DRAWER.toggle)`. Change the constant
and TypeScript flags every reference in the same compilation pass.

## How to apply

**1. Create `<name>.locators.ts` next to the component.**

```ts
// src/components/notifications/notifications-badge.locators.ts
export const NOTIFICATIONS_BADGE = {
  tag: 'notifications-badge',
  indicator: 'notifications-badge-indicator',
  count: 'notifications-badge-count',
} as const;
```

Use `as const` so the values narrow to their literal types. Callers can then destructure
or index without losing the string literal.

**2. Import the constants into the component and use them in the template.**

```ts
// src/components/notifications/notifications-badge.ts
import { html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { NOTIFICATIONS_BADGE } from './notifications-badge.locators';

@customElement(NOTIFICATIONS_BADGE.tag)
export class NotificationsBadge extends LitElement {
  @state() private count = 0;

  protected override render(): unknown {
    return html`
      <button
        type="button"
        data-testid=${NOTIFICATIONS_BADGE.indicator}
        aria-label="Notifications: ${this.count} unread"
      >
        <span data-testid=${NOTIFICATIONS_BADGE.count}>${this.count}</span>
      </button>
    `;
  }
}
```

**3. Import the same constants into the E2E test.**

```ts
// e2e/notifications.spec.ts
import { test, expect } from '@playwright/test';
import { NOTIFICATIONS_BADGE } from '../src/components/notifications/notifications-badge.locators';

test('shows unread count', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByTestId(NOTIFICATIONS_BADGE.indicator),
  ).toBeVisible();
  await expect(
    page.getByTestId(NOTIFICATIONS_BADGE.count),
  ).toHaveText('3');
});
```

The test never contains the string `'notifications-badge-indicator'` as a literal. Only
the constant file does. Renaming the id is a one-file change, and the TypeScript compiler
propagates and verifies it across the whole project.

## Anti-patterns

```ts
// ❌ Duplicated string literals — the component and the test are now out of sync
//    the moment either changes independently.

// In the component:
html`<button data-testid="notif-indicator">`;

// In the test:
page.getByTestId('notif-indicator'); // copied from memory — will drift

// ❌ Inline attribute strings with no shared source of truth
page.locator('[data-testid="kb-filter-input"]'); // bypasses the constant entirely

// ❌ Constants file placed far from the component — in a shared/test-ids.ts or similar.
//    This breaks colocation. When a component moves, the constants do not follow.
//    When a component is deleted, orphan constants accumulate.

// ❌ Relying on role + text selectors for everything when a stable test id would
//    be more precise.  Role locators are excellent for accessibility assertions but
//    fragile as primary navigation anchors — the accessible name is user-visible copy
//    that gets translated, revised, and A/B-tested.  See
//    testing/aria-label-test-locator-hygiene for when aria-label matching is fine and
//    when it is a trap.
```

Missing constants show up as test failures that look like typos. The locator finds zero
elements, the assertion fails, and the cause is a string that was changed in one place
and not the other. Nothing surfaces until runtime, and the diff tells you nothing.

## Enforcement

The TypeScript compiler does most of the enforcing. With the constant typed `as const`,
a reference to a key that doesn't exist (`NOTIFICATIONS_BADGE.indicatr`) is a compile
error rather than a runtime surprise. The pattern also keeps the search surface small:
`grep -r 'data-testid=' src/` should only ever hit component files, never test files.

In code review, verify:

- Every `data-testid` value in a component template comes from a constant import.
- The corresponding `.locators.ts` file is in the same directory as the component.
- Tests import locator constants; they do not contain string literals for `data-testid`.
