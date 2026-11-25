import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Loads apps/api/.env.test, guards against DATABASE_URL not being the
    // dedicated test DB, and resets that schema — once for the whole run.
    // See test/global-setup.e2e.ts.
    globalSetup: ['./test/global-setup.e2e.ts'],
    // All e2e files share one real Postgres DB and each boots a full Nest
    // app; running files in parallel both races on shared data (e.g.
    // unfiltered list endpoints) and causes CPU/connection contention that
    // shows up as flaky hook timeouts. One file at a time instead.
    fileParallelism: false,
    // Default (10s/5s) is tight for a cold Nest app boot + first real
    // Postgres connection, especially right after `docker compose up -d` —
    // seen flake on this in practice. 60s gives real headroom without
    // masking a genuinely hung test.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
