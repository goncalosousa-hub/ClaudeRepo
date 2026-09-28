import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4477);
const TMDB_PORT = PORT + 2;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      // A fake TMDB (series and movies catalogue), so the tests run offline and without a key.
      command: `npx tsx tests/fake-tmdb.ts ${TMDB_PORT}`,
      url: `http://127.0.0.1:${TMDB_PORT}/3/configuration`,
      reuseExistingServer: false,
    },
    {
      command: 'node dist/server/index.js',
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(PORT),
        HOST: '127.0.0.1',
        DATA_DIR: '.e2e-data',
        TMDB_API_KEY: 'fake-tmdb-key',
        TMDB_API_URL: `http://127.0.0.1:${TMDB_PORT}/3`,
      },
    },
  ],
});
