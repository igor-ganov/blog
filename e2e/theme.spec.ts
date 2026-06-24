import { expect, type Page, test } from '@playwright/test';
import { THEME_TOGGLE } from '../src/components/islands/theme-toggle.locators';
import { APP } from './base';

const visibleToggle = (page: Page) => page.locator(`[${THEME_TOGGLE.attr}]:visible`);

test.describe('theme toggle', () => {
  test('cycles light → dark → system and persists across a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(APP);

    const html = page.locator('html');
    const button = visibleToggle(page);
    await expect(button).toBeVisible();

    // Default preference is system.
    await expect(html).toHaveAttribute('data-theme-pref', 'system');

    await button.click();
    await expect(html).toHaveAttribute('data-theme-pref', 'light');
    await expect(html).toHaveAttribute('data-theme', 'light');

    await button.click();
    await expect(html).toHaveAttribute('data-theme-pref', 'dark');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await button.click();
    await expect(html).toHaveAttribute('data-theme-pref', 'system');

    // Land on explicit dark, then confirm the choice survives a reload.
    await button.click(); // system → light
    await button.click(); // light → dark
    await expect(html).toHaveAttribute('data-theme-pref', 'dark');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme-pref', 'dark');
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('the system preference follows the OS scheme live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(APP);

    const html = page.locator('html');
    // Default is system; with the OS in dark, the page paints dark.
    await expect(html).toHaveAttribute('data-theme-pref', 'system');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Flipping the OS scheme updates the page while the preference stays system.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(html).toHaveAttribute('data-theme-pref', 'system');
  });

  test('reveals the new theme from the click point when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await page.goto(APP);

    await visibleToggle(page).click();

    // The reveal origin/radius are published on <html> for the clip-path keyframe.
    const radius = await page
      .locator('html')
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--theme-r'));
    expect(radius).not.toBe('');
  });

  test('skips the reveal under reduced motion', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto(APP);

    const html = page.locator('html');
    await visibleToggle(page).click();

    await expect(html).toHaveAttribute('data-theme-pref', 'light');
    const radius = await html.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--theme-r'));
    expect(radius).toBe('');
  });
});
