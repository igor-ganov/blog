import { expect, test } from '@playwright/test';
import { TOC_DRAWER } from '../src/components/islands/toc-drawer.locators';
import { APP } from './base';

const ARTICLE = `${APP}/kb/error-handling/never-swallow-errors`;

test.describe('toc-drawer', () => {
  test('renders the contents inline on desktop, with no floating button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ARTICLE);

    await expect(page.getByTestId(TOC_DRAWER.panel)).toBeVisible();
    await expect(page.getByTestId(TOC_DRAWER.toggle)).toBeHidden();
  });

  test('opens from a side button and traps focus on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(ARTICLE);

    const toggle = page.getByTestId(TOC_DRAWER.toggle);
    const panel = page.getByTestId(TOC_DRAWER.panel);
    const close = page.getByTestId(TOC_DRAWER.close);

    // Collapsed by default: button visible, drawer hidden off-canvas.
    await expect(toggle).toBeVisible();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Focus moves into the drawer (read the deep active element across shadow roots).
    await expect(close).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          let el: Element | null = document.activeElement;
          while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
          return el?.getAttribute('data-testid');
        }),
      )
      .toBe(TOC_DRAWER.close);

    // Escape dismisses and the drawer hides again.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('selecting a heading navigates and closes the drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(ARTICLE);

    await page.getByTestId(TOC_DRAWER.toggle).click();
    const panel = page.getByTestId(TOC_DRAWER.panel);
    await expect(panel).toBeVisible();

    await panel.getByRole('link').first().click();
    await expect(page).toHaveURL(/#/);
    await expect(panel).toBeHidden();
  });

  test('tapping the backdrop closes the drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(ARTICLE);

    await page.getByTestId(TOC_DRAWER.toggle).click();
    const panel = page.getByTestId(TOC_DRAWER.panel);
    await expect(panel).toBeVisible();

    // Click the exposed top-left corner of the backdrop (away from the right-side panel).
    await page.getByTestId(TOC_DRAWER.backdrop).click({ position: { x: 6, y: 6 } });
    await expect(panel).toBeHidden();
  });
});
