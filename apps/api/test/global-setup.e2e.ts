import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import { assertTestDatabaseUrl, truncateAllTables } from './reset-test-db.js';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Runs once before the whole e2e suite (Vitest's globalSetup). Mutations to
// process.env here ARE visible to every test file — see
// https://vitest.dev/config/#globalsetup. This is the single place that
// decides which database the entire e2e run talks to; individual test
// files never load env files themselves.
//
// By explicit decision: never `prisma migrate reset` (Prisma's own
// AI-agent guard refuses it without a human typing exact consent, and
// that consent was declined) and never a PRISMA_USER_CONSENT_* variable
// anywhere in this codebase. Schema setup is `migrate deploy` only
// (additive, never drops anything); data is cleared via TRUNCATE in
// reset-test-db.ts, which carries its own independent guard.
export default async function setup() {
  config({ path: resolve(apiRoot, '.env.test'), override: true });
  process.env.NODE_ENV = 'test';

  const url = process.env.DATABASE_URL;
  assertTestDatabaseUrl(url);

  console.log(`[e2e] Test şeması güncelleniyor (migrate deploy): ${url}`);
  try {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    });
  } catch (error) {
    throw new Error(
      'Test şeması uygulanamadı. "docker compose up -d postgres_test" çalıştırıldığından emin olun.',
      { cause: error },
    );
  }

  const count = await truncateAllTables(url);
  console.log(`[e2e] ${count} tablo temizlendi (veri silindi, şema/migration geçmişi korundu).`);
}
