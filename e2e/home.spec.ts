import { expect, test } from '@playwright/test';
import { BASE } from './base';

test.describe('home', () => {
  test('shows the hero, stats and a category grid', async ({ page }) => {
    await page.goto(`${BASE}/`);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // exact match: "Browse" is a substring of the "Browser Platform" category card.
    await expect(page.getByRole('link', { name: 'Browse', exact: true })).toBeVisible();

    // Thirteen category cards link into /c/<slug>.
    const categoryLinks = page.locator(`a[href^="${BASE}/c/"]`);
    await expect(categoryLinks).toHaveCount(13);

    // The non-negotiables block surfaces at least one practice card.
    await expect(
      page.getByRole('heading', { name: /start with the non-negotiables/i }),
    ).toBeVisible();
  });

  test('navigates from a category card to its page', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.locator(`a[href="${BASE}/c/testing"]`).first().click();
    await expect(page).toHaveURL(/\/c\/testing$/);
    await expect(page.getByRole('heading', { level: 1, name: /testing/i })).toBeVisible();
  });
});
