import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import { assertTestDatabaseUrl, truncateAllTables } from './reset-test-db.js';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Run once (via the Playwright smoke suite's webServer command, before the
// API process that will actually serve the tests starts) against the same
// dedicated test DB apps/api's own e2e suite uses — never the dev DB. Same
// pattern as test/global-setup.e2e.ts, plus a seed pass: the smoke suite
// needs a MODERATOR account and an existing entity to search for, and
// prisma/seed.ts already provides exactly that (demo-moderator@example.com
// / DemoPass123!, "Demo Coin A", ...).
async function main() {
  config({ path: resolve(apiRoot, '.env.test'), override: true });
  process.env.NODE_ENV = 'test';

  const url = process.env.DATABASE_URL;
  assertTestDatabaseUrl(url);

  console.log(`[smoke] Test şeması güncelleniyor (migrate deploy): ${url}`);
  execSync('pnpm exec prisma migrate deploy', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  const count = await truncateAllTables(url);
  console.log(`[smoke] ${count} tablo temizlendi (veri silindi, şema/migration geçmişi korundu).`);

  console.log('[smoke] Demo seed verisi yükleniyor...');
  execSync('pnpm exec tsx prisma/seed.ts', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  console.log('[smoke] Test veritabanı hazır.');
}

main().catch((error) => {
  console.error('[smoke] Test veritabanı hazırlanamadı:', error);
  process.exit(1);
});
