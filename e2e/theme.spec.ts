import { expect, test } from '@playwright/test';
import { THEME_TOGGLE } from '../src/components/islands/theme-toggle.locators';

test.describe('theme-toggle island', () => {
  test('flips the theme and persists it across a reload', async ({ page }) => {
    await page.goto('/');

    const html = page.locator('html');
    const initial = (await html.getAttribute('data-theme')) ?? 'light';
    const flipped = initial === 'light' ? 'dark' : 'light';

    const button = page.locator(THEME_TOGGLE.tag).getByTestId(THEME_TOGGLE.button);
    await expect(button).toBeVisible();
    await button.click();

    await expect(html).toHaveAttribute('data-theme', flipped);

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', flipped);
  });
});
