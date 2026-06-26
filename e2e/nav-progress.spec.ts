import { expect, test } from '@playwright/test';
import { APP } from './base';

// The progress bar is driven by ClientRouter's lifecycle events. Dispatching them
// directly tests the wiring deterministically, without racing a (prefetched) nav.
test.describe('navigation progress bar', () => {
  test('shows on navigation start and completes on page-load', async ({ page }) => {
    await page.goto(APP);
    const bar = page.locator('#nav-progress');

    // Hidden at rest.
    await expect(bar).toHaveCSS('opacity', '0');

    // A navigation begins → the bar becomes visible immediately (the feedback).
    await page.evaluate(() => document.dispatchEvent(new Event('astro:before-preparation')));
    await expect(bar).toHaveCSS('opacity', '1');

    // The new page is ready → the bar completes and fades out.
    await page.evaluate(() => document.dispatchEvent(new Event('astro:page-load')));
    await expect(bar).toHaveCSS('opacity', '0');
  });
});
