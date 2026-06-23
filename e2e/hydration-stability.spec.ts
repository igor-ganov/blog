import { expect, test } from '@playwright/test';
import { APP } from './base';

// One representative URL per page type.
const PAGES = [
  { name: 'home', path: '' },
  { name: 'blog index', path: '/blog' },
  { name: 'about', path: '/about' },
  { name: 'skills', path: '/skills' },
  { name: 'principles', path: '/principles' },
  { name: 'article', path: '/principles/error-handling/never-swallow-errors' },
  { name: 'essay', path: '/blog/why-this-site' },
  { name: 'category', path: '/c/testing' },
] as const;

// Catches a whole class of bug: an island whose server-rendered HTML differs from
// what it renders after hydrating, so the page reflows when the island's script
// runs. On a warm load the script upgrades the element before first paint, hiding
// it — so we hold the scripts back to force the cold-load order (server HTML paints,
// then hydration) and compare the layout across that boundary.
//
// The footer sits below all flow content, so its Y position is the height of
// everything above it: if any island injects/removes/reorders flow content on
// hydration, the footer moves. It must not.
test.describe('hydration stability (server HTML matches hydrated render)', () => {
  for (const { name, path } of PAGES) {
    test(`${name}: hydration does not reflow the page`, async ({ page }) => {
      // Simulate a cold load: hold every script so the server HTML paints first.
      await page.route('**/*.js', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      });

      await page.goto(`${APP}${path}`, { waitUntil: 'commit' });
      await page.locator('footer').last().waitFor({ state: 'attached' });
      // Let styles/layout settle, then snapshot every server-rendered block that is
      // actually visible now. We keep the element references and re-measure them after
      // hydration, so anything that moves — in the main flow OR a sidebar column — is
      // caught. (Footer alone would miss a sidebar-only reflow.)
      const undefinedBefore = await page.evaluate(() => {
        const w = window as unknown as { __anchors: { el: Element; top: number }[] };
        const sel = 'footer, main > *, .layout > *, .sidebar > *, .grid > *';
        w.__anchors = [...document.querySelectorAll(sel)]
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && rect.height > 0) // skip not-yet-shown islands
          .map(({ el, rect }) => ({ el, top: rect.top }));
        return document.querySelectorAll(':not(:defined)').length;
      });

      // Now let the islands hydrate and settle.
      await page.waitForFunction(() => !document.querySelector(':not(:defined)'));
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      const moved = await page.evaluate(() => {
        const w = window as unknown as { __anchors: { el: Element; top: number }[] };
        return w.__anchors
          .map((a) => ({
            tag: a.el.tagName.toLowerCase(),
            delta: Math.round(Math.abs(a.el.getBoundingClientRect().top - a.top)),
          }))
          .filter((a) => a.delta > 1);
      });

      // Sanity: the baseline really was captured before hydration.
      expect(undefinedBefore, 'no custom elements were pending — stall ineffective').toBeGreaterThan(
        0,
      );
      expect(
        moved,
        `elements moved when islands hydrated: ${JSON.stringify(moved)}`,
      ).toEqual([]);
    });
  }
});
