import { expect, test } from '@playwright/test';
import { APP, BASE } from './base';

test.describe('bare root', () => {
  test('client-replaces to the default locale instead of 404ing', async ({ page }) => {
    await page.goto(BASE);
    // location.replace lands on /<base>/en without leaving a history entry.
    await expect(page).toHaveURL(new RegExp(`${APP}/?$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
