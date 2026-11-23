import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WEB_PORT = 3002;
const API_PORT = 3001;

// Permanent smoke suite — "pnpm test:smoke" from the repo root. Talks only
// to the dedicated e2e test database (port 5435, apps/api/.env.test),
// never the dev DB (5434): the API webServer command resets+seeds that DB
// first (see apps/api/test/smoke-reset.ts, same guarded TRUNCATE helper
// apps/api's own e2e suite uses) and only then starts the API with
// NODE_ENV=test, which makes it load .env.test.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // A flaky pass must never hide a real regression — no retries.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter api run db:reset:test && pnpm --filter api run start',
      url: `http://localhost:${API_PORT}/api/docs`,
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: repoRoot,
      env: { NODE_ENV: 'test' },
    },
    {
      command: 'pnpm --filter web run dev',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      cwd: repoRoot,
    },
  ],
});
