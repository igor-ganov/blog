import { expect, test } from '@playwright/test';
import { KB_FILTER } from '../src/components/islands/kb-filter.locators';
import { APP } from './base';

test.describe('kb-filter island', () => {
  test('narrows the list to matching practices and clears again', async ({ page }) => {
    await page.goto(`${APP}/principles`);

    const filter = page.locator(KB_FILTER.tag);
    const input = filter.getByTestId(KB_FILTER.input);
    await expect(input).toBeVisible();

    const outboxCard = page.locator(`[${KB_FILTER.item}]`, { hasText: 'outbox' }).first();
    const castingCard = page.locator(`[${KB_FILTER.item}]`, { hasText: 'casting' }).first();
    await expect(outboxCard).toBeVisible();
    await expect(castingCard).toBeVisible();

    await input.fill('outbox');

    // The matching card stays; an unrelated one is hidden. Assertions retry on
    // the DOM mutation the input event triggers — no timeout needed.
    await expect(outboxCard).toBeVisible();
    await expect(castingCard).toBeHidden();
  });

  test('shows an empty state when nothing matches', async ({ page }) => {
    await page.goto(`${APP}/principles`);
    const filter = page.locator(KB_FILTER.tag);
    const input = filter.getByTestId(KB_FILTER.input);

    await input.fill('zz-no-such-practice-zz');
    await expect(filter.getByTestId(KB_FILTER.empty)).toBeVisible();
    await expect(filter.getByTestId(KB_FILTER.count)).toContainText('0 /');

    await input.fill('');
    await expect(filter.getByTestId(KB_FILTER.empty)).toBeHidden();
  });

  test('quick-filter tag chips narrow the list to that tag', async ({ page }) => {
    await page.goto(`${APP}/principles`);

    const chips = page.getByTestId(KB_FILTER.chip);
    await expect(chips.first()).toBeVisible();
    const tag = await chips.first().getAttribute(KB_FILTER.chipTag);
    expect(tag).toBeTruthy();

    const visibleCards = page.locator(`[${KB_FILTER.item}]:visible`);
    const before = await visibleCards.count();

    await chips.first().click();
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');

    const after = await visibleCards.count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);

    // Every still-visible card carries the chosen tag.
    const membership = new RegExp(`(^|,)${tag}(,|$)`);
    for (let i = 0; i < after; i += 1) {
      await expect(visibleCards.nth(i)).toHaveAttribute(KB_FILTER.itemTags, membership);
    }

    // Toggling the chip off restores the full list.
    await chips.first().click();
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(visibleCards).toHaveCount(before);
  });
});
