import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// The one and only port the truncate helper will ever act against — not
// just a naming convention ("_test" in the DB name), a second independent
// check. Both must hold, or this refuses to run.
const TEST_DB_PORT = '5435';

// Guards the only genuinely destructive operation here (TRUNCATE). Thrown
// errors are the intended behavior for a dev/prod URL — never caught and
// "worked around" by a caller.
export function assertTestDatabaseUrl(url: string | undefined): asserts url is string {
  if (!url) {
    throw new Error('DATABASE_URL tanımsız; test veritabanı adresi bulunamadı.');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`DATABASE_URL ayrıştırılamadı: ${url}`);
  }

  const hasTestMarker = url.includes('_test');
  const isTestPort = parsed.port === TEST_DB_PORT;
  if (!hasTestMarker || !isTestPort) {
    throw new Error(
      'Bu işlem (TRUNCATE) sadece ayrılmış test veritabanına karşı çalışabilir: DATABASE_URL hem "_test" ' +
        `içermeli hem de ${TEST_DB_PORT} portunda olmalı (dev veritabanına yanlışlıkla veri kaybı yaşatmamak için). ` +
        `Mevcut DATABASE_URL: ${url}`,
    );
  }
}

// Empties every table (data only — schema/migration history untouched) so
// each e2e run starts from a blank slate. Reads the table list from
// pg_tables rather than hard-coding it, so it never drifts from the real
// schema.
export async function truncateAllTables(url: string): Promise<number> {
  assertTestDatabaseUrl(url);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `;
    if (tables.length > 0) {
      const names = tables.map((t) => `"${t.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
    }
    return tables.length;
  } finally {
    await prisma.$disconnect();
  }
}
