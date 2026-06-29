import { expect, test } from '@playwright/test';
import { APP } from './base';

test.describe('apps & demos', () => {
  test('lists projects and pens, reachable from the nav', async ({ page }) => {
    await page.goto(APP);
    await page.getByRole('link', { name: 'Apps', exact: true }).first().click();
    await expect(page).toHaveURL(/\/apps$/);
    await expect(page.getByRole('heading', { level: 1, name: /apps & demos/i })).toBeVisible();

    // An app card with a live demo link.
    await expect(page.getByRole('heading', { name: 'flying-menu' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Demo' }).first()).toBeVisible();

    // A CodePen card carries the embed markup (enhanced by CodePen's script at runtime).
    await expect(page.locator('p.codepen[data-slug-hash]').first()).toBeAttached();
    await expect(page.getByRole('link', { name: 'Code' }).first()).toBeVisible();
  });
});
