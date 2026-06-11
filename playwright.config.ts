import { defineConfig, devices } from '@playwright/test';

const PORT = 4330;
const inCI = Boolean(process.env.CI);

// No retries — a flaky test reports a real race (see the testing practices).
// The server is built fresh and previewed; reuse a running one only in dev.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: inCI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bun run build && bunx astro preview --port ${PORT}`,
    // The site is served under the /blog base — poll there for readiness.
    url: `http://localhost:${PORT}/blog`,
    reuseExistingServer: !inCI,
    timeout: 120_000,
  },
});
