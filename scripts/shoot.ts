import { chromium } from '@playwright/test';

// Capture proof screenshots of the built site. Run against a running preview:
//   SHOOT_BASE=http://localhost:4340 bun run scripts/shoot.ts
const base = process.env.SHOOT_BASE ?? 'http://localhost:4340';

interface Shot {
  readonly path: string;
  readonly name: string;
  readonly full: boolean;
  readonly theme?: 'light' | 'dark';
}

const shots: readonly Shot[] = [
  { path: '/', name: 'home-light', full: true },
  { path: '/', name: 'home-dark', full: true, theme: 'dark' },
  { path: '/kb', name: 'browse', full: false },
  { path: '/kb/error-handling/never-swallow-errors', name: 'article', full: false },
  { path: '/skills', name: 'skills', full: false },
];

const browser = await chromium.launch();
for (const shot of shots) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 880 } });
  await context.addInitScript((theme) => {
    globalThis.localStorage.setItem('theme', theme);
  }, shot.theme ?? 'light');
  const page = await context.newPage();
  await page.goto(base + shot.path, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `screenshots/${shot.name}.png`, fullPage: shot.full });
  await context.close();
}
await browser.close();
console.log('screenshots written to screenshots/');
