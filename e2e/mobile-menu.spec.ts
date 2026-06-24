import { expect, test } from '@playwright/test';
import { TOC_DRAWER } from '../src/components/islands/toc-drawer.locators';
import { APP } from './base';

const ARTICLE = '/principles/error-handling/never-swallow-errors';

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

    // The inline desktop nav AND the desktop theme toggle are hidden; the floating
    // trigger takes over (the theme toggle lives inside the flying menu on mobile).
    await expect(page.locator('nav.primary.desktop-only')).toBeHidden();
    await expect(page.locator('.theme-desktop')).toBeHidden();
    const trigger = page.getByRole('button', { name: 'Menu' });
    await expect(trigger).toBeVisible();

    // Tapping the trigger opens the menu with the primary links.
    await trigger.click();
    const principles = page
      .locator('flying-menu [slot="menu"]')
      .getByRole('link', { name: 'Principles', exact: true });
    await expect(principles).toBeVisible();
  });

  test('the flying trigger never overlaps the TOC FAB and shows a close icon when open', async ({
    page,
  }) => {
    // The article page is the only one with two floating buttons (menu + contents).
    await page.goto(`${APP}${ARTICLE}`);

    const trigger = page.getByRole('button', { name: 'Menu' });
    const tocToggle = page.getByTestId(TOC_DRAWER.toggle);
    await expect(trigger).toBeVisible();
    await expect(tocToggle).toBeVisible();

    // The two FABs sit in opposite bottom corners — their boxes must not intersect.
    const a = await trigger.boundingBox();
    const b = await tocToggle.boundingBox();
    const intersect = Boolean(
      a &&
        b &&
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y,
    );
    expect(intersect, 'the menu trigger and TOC FAB overlap').toBe(false);

    // Opening the menu swaps the hamburger for a close icon.
    await trigger.click();
    await expect(page.locator('.fab .icon-close')).toBeVisible();
    await expect(page.locator('.fab .icon-open')).toBeHidden();
  });

  test('lifts the TOC FAB above the menu when the menu rests bottom-left', async ({ page }) => {
    // The flying menu persists its corner; dragging it to bottom-left would land it on
    // the TOC FAB. Seed that corner and assert the TOC FAB gets out of the way (up).
    await page.addInitScript(() => localStorage.setItem('ep-menu-corner', 'bottom-left'));
    await page.goto(`${APP}${ARTICLE}`);

    const trigger = page.getByRole('button', { name: 'Menu' });
    const tocToggle = page.getByTestId(TOC_DRAWER.toggle);
    await expect(trigger).toBeVisible();
    await expect(tocToggle).toBeVisible();

    const a = await trigger.boundingBox();
    const b = await tocToggle.boundingBox();
    const intersect = Boolean(
      a &&
        b &&
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y,
    );
    expect(intersect, 'the TOC FAB overlaps the bottom-left menu trigger').toBe(false);
    // It clears the trigger by sitting entirely above it.
    expect(b && a ? b.y + b.height <= a.y + 1 : false).toBe(true);
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
