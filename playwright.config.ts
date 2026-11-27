import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite. Targets BASE_URL when set (CI runs it against the real nginx container);
 * otherwise builds the app and serves it with `vite preview`.
 * Locally, set PW_CHANNEL=chrome to use an installed Chrome instead of downloading Chromium.
 */
const external = process.env.BASE_URL;
const ci = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  workers: ci ? 2 : undefined,
  reporter: ci
    ? [['github'], ['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // ffmpeg ships with `playwright install` (CI); local runs with PW_CHANNEL=chrome skip video
    video: ci ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 1000 },
        channel: process.env.PW_CHANNEL || undefined,
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
  ],
  webServer: external
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !ci,
        timeout: 120_000,
      },
});
