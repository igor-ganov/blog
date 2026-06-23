import { expect, test } from '@playwright/test';
import { APP } from './base';

test.describe('blog (essays)', () => {
  test('is reachable from the header nav', async ({ page }) => {
    await page.goto(APP);
    await page.getByRole('link', { name: 'Blog', exact: true }).click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible();
  });

  test('lists posts and opens the motivation essay with a working cross-link', async ({ page }) => {
    await page.goto(`${APP}/blog`);

    const first = page.getByRole('link', { name: /why this site exists/i });
    await expect(first).toBeVisible();
    await first.click();

    await expect(page).toHaveURL(/\/blog\/why-this-site$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /why this site exists/i }),
    ).toBeVisible();

    // The in-prose link into the principles resolves under the deploy base and locale.
    const principles = page.getByRole('link', { name: 'Principles', exact: true }).first();
    await expect(principles).toHaveAttribute('href', `${APP}/principles`);
  });
});
