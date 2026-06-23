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

  test('does not flash in the page flow before the island hydrates', async ({ page }) => {
    // Stall every script so the pre-hydration paint is observable — this is the cold
    // load where the user saw the menu render at the top and then jump to the corner.
    await page.route('**/*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto(`${APP}/principles`, { waitUntil: 'commit' });

    const fm = page.locator('flying-menu');
    await fm.waitFor({ state: 'attached' });
    const state = await fm.evaluate((el) => ({
      defined: Boolean(customElements.get('flying-menu')),
      display: getComputedStyle(el).display,
    }));

    // Confirm we are genuinely pre-hydration, then assert nothing is laid out: an
    // undefined flying-menu must be display:none so its trigger/menu never paint
    // in the document flow at the top.
    expect(state.defined).toBe(false);
    expect(state.display).toBe('none');
  });
});
