import { expect, test } from '@playwright/test';
import { APP } from './base';

test.describe('mobile flying menu', () => {
  test.use({ viewport: { width: 390, height: 820 } });

  test('keeps the header within the viewport and exposes nav via the flying menu', async ({
    page,
  }) => {
    await page.goto(`${APP}/principles`);

    // The header no longer overflows sideways (the bug this replaced).
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);

    // The inline desktop nav is hidden; the floating trigger takes over.
    await expect(page.locator('nav.primary.desktop-only')).toBeHidden();
    const trigger = page.getByRole('button', { name: 'Menu' });
    await expect(trigger).toBeVisible();

    // Tapping the trigger opens the menu with the primary links.
    await trigger.click();
    const principles = page
      .locator('flying-menu [slot="menu"]')
      .getByRole('link', { name: 'Principles', exact: true });
    await expect(principles).toBeVisible();
  });
});
