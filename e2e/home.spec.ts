import { expect, test } from '@playwright/test';
import { APP } from './base';

test.describe('home', () => {
  test('shows the hero, stats and a category grid', async ({ page }) => {
    await page.goto(APP);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Principles', exact: true })).toBeVisible();

    // Thirteen category cards link into /<lang>/c/<slug>.
    const categoryLinks = page.locator(`a[href^="${APP}/c/"]`);
    await expect(categoryLinks).toHaveCount(13);

    // The non-negotiables block surfaces at least one practice card.
    await expect(
      page.getByRole('heading', { name: /start with the non-negotiables/i }),
    ).toBeVisible();
  });

  test('surfaces the latest blog essays as the first section after the intro', async ({ page }) => {
    await page.goto(APP);

    await expect(page.getByRole('heading', { name: 'From the blog' })).toBeVisible();

    const essayLinks = page.locator(`a[href^="${APP}/blog/"]`);
    const count = await essayLinks.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(5);

    await expect(page.getByRole('link', { name: /all essays/i })).toBeVisible();
  });

  test('navigates from a category card to its page', async ({ page }) => {
    await page.goto(APP);
    await page.locator(`a[href="${APP}/c/testing"]`).first().click();
    await expect(page).toHaveURL(/\/c\/testing$/);
    await expect(page.getByRole('heading', { level: 1, name: /testing/i })).toBeVisible();
  });
});
