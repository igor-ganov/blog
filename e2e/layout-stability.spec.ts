import { expect, test } from '@playwright/test';
import { APP } from './base';

// One representative URL per page type. The bug shows up navigating *between*
// pages, so the invariant has to hold for every one of them.
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

// A viewport tall enough that the short pages (about, blog index, …) do NOT need a
// vertical scrollbar while the long ones (home, principles) do. With
// `scrollbar-gutter: auto` that makes the short pages 15px wider, so the centred
// layout jumps sideways on every navigation between the two kinds — the visible
// "скачки". `scrollbar-gutter: stable` reserves the gutter everywhere and removes it.
test.describe('layout stability (no horizontal jump on navigation)', () => {
  test.use({ viewport: { width: 1280, height: 3200 } });

  for (const { name, path } of PAGES) {
    test(`${name} reserves the scrollbar gutter`, async ({ page }) => {
      await page.goto(`${APP}${path}`);
      const root = await page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        return { overflowY: s.overflowY, scrollbarGutter: s.scrollbarGutter };
      });
      // `overflow-y: scroll` is what actually reserves the gutter on classic-scrollbar
      // browsers; `scrollbar-gutter: stable` is the modern hint. Both must hold.
      expect(root.overflowY).toBe('scroll');
      expect(root.scrollbarGutter).toBe('stable');
    });
  }

  test('content width is identical across every page', async ({ page }) => {
    const widths: Record<string, number> = {};
    for (const { name, path } of PAGES) {
      await page.goto(`${APP}${path}`);
      widths[name] = await page.evaluate(() => document.documentElement.clientWidth);
    }
    const values = Object.values(widths);
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread, `clientWidth varies across pages: ${JSON.stringify(widths)}`).toBe(0);
  });
});
