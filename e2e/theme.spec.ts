import { expect, test } from '@playwright/test';
import { THEME_TOGGLE } from '../src/components/islands/theme-toggle.locators';
import { APP } from './base';

test.describe('theme-toggle island', () => {
  test('flips the theme and persists it across a reload', async ({ page }) => {
    await page.goto(APP);

    const html = page.locator('html');
    const initial = (await html.getAttribute('data-theme')) ?? 'light';
    const flipped = initial === 'light' ? 'dark' : 'light';

    // Two toggles exist (inline header + mobile flying menu); only one shows per
    // viewport, so scope to the visible instance.
    const button = page.locator(`${THEME_TOGGLE.tag}:visible`).getByTestId(THEME_TOGGLE.button);
    await expect(button).toBeVisible();
    await button.click();

    await expect(html).toHaveAttribute('data-theme', flipped);

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', flipped);
  });
});
