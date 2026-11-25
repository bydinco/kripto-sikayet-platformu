import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WEB_PORT = 3002;
const API_PORT = 3001;

// "pnpm test:smoke:prod" from the repo root — the exact same spec files as
// playwright.config.ts (same testDir), run against a REAL `next build` +
// `next start` instead of `next dev`. The point: next.config.ts's
// headers() only emits Content-Security-Policy on a production build
// (`next dev` relies on eval() for Fast Refresh, which a CSP without
// 'unsafe-eval' would break — see src/lib/security-headers.ts), so this is
// the only way to actually exercise CSP in a real browser. Any CSP
// violation shows up in the console as "Refused to load/execute ..." and
// the shared fixtures.ts listener fails the test on it automatically —
// no CSP-specific assertions needed here.
//
// SECURE_HEADERS_HTTPS is deliberately left unset: this still serves over
// plain http://localhost, so HSTS/upgrade-insecure-requests must stay off
// here too, same as the dev run.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
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
      // Sequential on purpose: `next build` must finish (and, importantly,
      // bake NODE_ENV=production into next.config.ts's headers() output —
      // see security-headers.ts) before `next start` serves anything.
      command: 'pnpm --filter web run build && pnpm --filter web run start',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      cwd: repoRoot,
    },
  ],
});
