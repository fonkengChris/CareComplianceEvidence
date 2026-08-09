import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e config (Phase 10). These specs drive the *full stack* — Vite client
 * (5173) proxying /api to the Express server (3000) against a real Postgres — so they
 * cannot run in the sandbox that forbids binding listening ports. Run them in a real
 * environment:
 *
 *   bun install
 *   bunx playwright install --with-deps    # one-time browser download
 *   bun run db:migrate && bun run db:seed  # seeded role logins + sample data
 *   bun run test:e2e
 *
 * Specs are named *.e2e.ts (not *.spec.ts) so `bun test` does not try to run them as
 * unit tests; `testMatch` below scopes Playwright to that suffix.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      // The staff recording journey runs on the mobile project only (below).
      testIgnore: '**/record-to-report.e2e.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Staff recording is mobile-first (CLAUDE.md) — exercise it on a phone viewport.
      name: 'mobile',
      testMatch: '**/record-to-report.e2e.ts',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    // `bun run dev` starts both the client (5173) and server (3000) via workspaces.
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
