import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4477);
const TMDB_PORT = PORT + 2;
/** The same app behind a community code (COMMUNITY_CODE). */
const LOCKED_PORT = PORT + 4;
/** The same app where only Google accounts get in (GOOGLE_ONLY). */
const GOOGLE_ONLY_PORT = PORT + 6;

// "Continuar com Google" with the fake Google keys (tests/fake-google.ts; the button is faked in the spec).
const GOOGLE = {
  GOOGLE_CLIENT_ID: '1234-fake.apps.googleusercontent.com',
  GOOGLE_DOMAIN: 'lusiaves.pt',
  GOOGLE_CERTS_URL: `http://127.0.0.1:${TMDB_PORT}/google/certs`,
};

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
      // A fake TMDB (series and movies), Open Library (books), Photon (map) and Google sign-in, so the tests run offline.
      command: `npx tsx tests/fake-tmdb.ts ${TMDB_PORT}`,
      url: `http://127.0.0.1:${TMDB_PORT}/3/configuration`,
      reuseExistingServer: false,
    },
    {
      // Fresh data on every run (the community space is shared by all the tests).
      command: `node -e "require('fs').rmSync('.e2e-data', { recursive: true, force: true })" && node dist/server/index.js`,
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(PORT),
        HOST: '127.0.0.1',
        DATA_DIR: '.e2e-data',
        TMDB_API_KEY: 'fake-tmdb-key',
        TMDB_API_URL: `http://127.0.0.1:${TMDB_PORT}/3`,
        // The same fake answers as Open Library (books) and Photon (restaurants and places).
        OPENLIBRARY_URL: `http://127.0.0.1:${TMDB_PORT}/ol`,
        PHOTON_URL: `http://127.0.0.1:${TMDB_PORT}/photon`,
        // The admins' page (/admin), for the account "chefe".
        ADMINS: 'chefe',
        ...GOOGLE,
      },
    },
    {
      // Colleagues only: the code, or a Google account of the company, opens it.
      command: `node -e "require('fs').rmSync('.e2e-data-locked', { recursive: true, force: true })" && node dist/server/index.js`,
      url: `http://127.0.0.1:${LOCKED_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(LOCKED_PORT),
        HOST: '127.0.0.1',
        DATA_DIR: '.e2e-data-locked',
        COMMUNITY_CODE: 'frango-e2e',
        ...GOOGLE,
      },
    },
    {
      // Only Google accounts: no profiles without an account, no passwords, no code.
      command: `node -e "require('fs').rmSync('.e2e-data-google', { recursive: true, force: true })" && node dist/server/index.js`,
      url: `http://127.0.0.1:${GOOGLE_ONLY_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(GOOGLE_ONLY_PORT),
        HOST: '127.0.0.1',
        DATA_DIR: '.e2e-data-google',
        GOOGLE_ONLY: 'true',
        ...GOOGLE,
      },
    },
  ],
});
