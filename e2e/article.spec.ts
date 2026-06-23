import { expect, test } from '@playwright/test';
import { APP } from './base';

test.describe('article page', () => {
  test('renders the principle, body sections and provenance', async ({ page }) => {
    await page.goto(`${APP}/principles/error-handling/never-swallow-errors`);

    await expect(page.getByRole('heading', { level: 1, name: /never swallow/i })).toBeVisible();
    await expect(page.getByText(/Principle\./)).toBeVisible();
    await expect(page.getByRole('heading', { name: /why this matters/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /provenance/i })).toBeVisible();

    // Provenance carries a real machine-readable date.
    await expect(page.locator('time[datetime="2026-05-09"]')).toBeVisible();
  });

  test('links to a related practice', async ({ page }) => {
    await page.goto(`${APP}/principles/error-handling/never-swallow-errors`);
    const related = page.getByRole('link', { name: /always check res\.ok/i }).first();
    await expect(related).toBeVisible();
    await related.click();
    await expect(page).toHaveURL(/always-check-res-ok$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/res\.ok/i);
  });
});
