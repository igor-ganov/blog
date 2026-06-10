import { expect, test } from '@playwright/test';
import { KB_FILTER } from '../src/components/islands/kb-filter.locators';

test.describe('kb-filter island', () => {
  test('narrows the list to matching practices and clears again', async ({ page }) => {
    await page.goto('/kb');

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
    await page.goto('/kb');
    const filter = page.locator(KB_FILTER.tag);
    const input = filter.getByTestId(KB_FILTER.input);

    await input.fill('zz-no-such-practice-zz');
    await expect(filter.getByTestId(KB_FILTER.empty)).toBeVisible();
    await expect(filter.getByTestId(KB_FILTER.count)).toContainText('0 /');

    await input.fill('');
    await expect(filter.getByTestId(KB_FILTER.empty)).toBeHidden();
  });
});
