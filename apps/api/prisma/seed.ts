// Development-only seed data. Entities are entirely fictional ("Demo Coin
// A", ...) — never a real project's name.
import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  EntityType,
  EvidenceType,
  ModerationAction,
  PrismaClient,
  ReportCategory,
  ReportStatus,
  Role,
  StatusActorType,
} from '@prisma/client';

function assertSafeToSeed(): string {
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed reddedildi: NODE_ENV=production.');
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Seed reddedildi: DATABASE_URL tanımlı değil.');
    process.exit(1);
  }
  const host = new URL(databaseUrl).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error(`Seed reddedildi: DATABASE_URL host'u ("${host}") localhost/127.0.0.1 değil.`);
    process.exit(1);
  }
  return databaseUrl;
}

const databaseUrl = assertSafeToSeed();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const DEMO_PASSWORD = 'DemoPass123!';

// Mirrors EntityStatsService.recomputeStats without needing to bootstrap
// the Nest app just for seeding.
async function recomputeStats(entityId: string) {
  const reports = await prisma.report.findMany({
    where: { entityId },
    select: {
      createdAt: true,
      status: true,
      satisfactionRating: true,
      responses: { select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 },
    },
  });

  const totalReports = reports.length;
  const respondedReports = reports.filter((r) => r.responses.length > 0).length;
  const resolvedReports = reports.filter((r) => r.status === ReportStatus.RESOLVED).length;
  const responseHours = reports
    .filter((r) => r.responses.length > 0)
    .map((r) => (r.responses[0].createdAt.getTime() - r.createdAt.getTime()) / 3_600_000);
  const ratings = reports.map((r) => r.satisfactionRating).filter((r): r is number => r !== null);
  const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

  const data = {
    totalReports,
    respondedReports,
    resolvedReports,
    responseRatePct: totalReports ? (respondedReports / totalReports) * 100 : 0,
    resolutionRatePct: totalReports ? (resolvedReports / totalReports) * 100 : 0,
    avgResponseHours: average(responseHours),
    avgSatisfaction: average(ratings),
  };

  await prisma.entityStats.upsert({
    where: { entityId },
    create: { entityId, ...data },
    update: { ...data, computedAt: new Date() },
  });
}

async function upsertDemoUser(email: string, handle: string, role: Role) {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, handle, passwordHash, role, emailVerified: true },
  });
}

async function main() {
  const author = await upsertDemoUser('demo-author@example.com', 'demo_author', Role.USER);
  const moderator = await upsertDemoUser('demo-moderator@example.com', 'demo_moderator', Role.MODERATOR);
  const owner = await upsertDemoUser('demo-owner@example.com', 'demo_owner', Role.ENTITY_OWNER);

  const entityA = await prisma.entity.upsert({
    where: { slug: 'demo-coin-a' },
    update: {},
    create: {
      type: EntityType.COIN,
      slug: 'demo-coin-a',
      name: 'Demo Coin A',
      summary: 'Tamamen kurgusal örnek coin (seed verisi).',
      ownerId: owner.id,
    },
  });

  const entityB = await prisma.entity.upsert({
    where: { slug: 'demo-exchange-b' },
    update: {},
    create: {
      type: EntityType.EXCHANGE,
      slug: 'demo-exchange-b',
      name: 'Demo Exchange B',
      summary: 'Tamamen kurgusal örnek borsa (seed verisi).',
    },
  });

  // PUBLISHED, with approved evidence + a moderation decision.
  const published = await prisma.report.create({
    data: {
      entityId: entityA.id,
      authorId: author.id,
      category: ReportCategory.WITHDRAWAL_BLOCKED,
      title: 'Para çekme talebim iki haftadır bekliyor',
      body: 'İki hafta önce para çekme talebinde bulundum, hâlâ işleme alınmadı. (Seed verisi.)',
      status: ReportStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
  await prisma.evidence.create({
    data: { reportId: published.id, type: EvidenceType.LINK, value: 'https://example.com/seed-proof-1', approved: true },
  });
  await prisma.moderationLog.create({
    data: { reportId: published.id, moderatorId: moderator.id, action: ModerationAction.APPROVE, reason: 'Kanıt yeterli (seed).' },
  });
  await prisma.reportStatusHistory.create({
    data: {
      reportId: published.id,
      fromStatus: ReportStatus.PENDING,
      toStatus: ReportStatus.PUBLISHED,
      actorId: moderator.id,
      actorType: StatusActorType.MODERATOR,
      reason: 'Kanıt yeterli (seed).',
    },
  });

  // DISPUTED: published, then the brand responds disputing it.
  const disputed = await prisma.report.create({
    data: {
      entityId: entityA.id,
      authorId: author.id,
      category: ReportCategory.HIDDEN_FEES,
      title: 'Beklemediğim bir kesinti oldu',
      body: 'Hesabımdan açıklanmayan bir ücret kesildi. (Seed verisi.)',
      status: ReportStatus.DISPUTED,
      publishedAt: new Date(),
    },
  });
  await prisma.evidence.create({
    data: { reportId: disputed.id, type: EvidenceType.LINK, value: 'https://example.com/seed-proof-2', approved: true },
  });
  await prisma.entityResponse.create({
    data: {
      reportId: disputed.id,
      entityId: entityA.id,
      authorId: owner.id,
      body: 'Bu ücret kullanım şartlarında açıkça belirtilmiştir, itiraz ediyoruz. (Seed verisi.)',
      isDispute: true,
    },
  });
  await prisma.reportStatusHistory.create({
    data: {
      reportId: disputed.id,
      fromStatus: ReportStatus.PUBLISHED,
      toStatus: ReportStatus.DISPUTED,
      actorId: owner.id,
      actorType: StatusActorType.ENTITY,
    },
  });

  // RESOLVED, with a brand response and the author's satisfaction rating.
  const resolved = await prisma.report.create({
    data: {
      entityId: entityB.id,
      authorId: author.id,
      category: ReportCategory.SUPPORT_UNRESPONSIVE,
      title: 'Destek bir hafta sonra döndü, çözüldü',
      body: 'Destek ekibi bir hafta sonra yanıt verdi ve sorunu çözdü. (Seed verisi.)',
      status: ReportStatus.RESOLVED,
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(),
      satisfactionRating: 4,
      satisfactionNote: 'Gecikti ama sonunda çözüldü. (Seed verisi.)',
    },
  });
  await prisma.evidence.create({
    data: { reportId: resolved.id, type: EvidenceType.LINK, value: 'https://example.com/seed-proof-3', approved: true },
  });
  await prisma.entityResponse.create({
    data: {
      reportId: resolved.id,
      entityId: entityB.id,
      authorId: moderator.id,
      body: 'Destek ekibimiz konuyu inceledi ve çözdü. (Seed verisi.)',
      isDispute: false,
    },
  });

  // PENDING: no evidence yet, not publicly visible.
  await prisma.report.create({
    data: {
      entityId: entityB.id,
      authorId: author.id,
      category: ReportCategory.OTHER,
      title: 'İnceleme bekleyen örnek şikayet',
      body: 'Henüz moderasyon incelemesi bekliyor. (Seed verisi.)',
      status: ReportStatus.PENDING,
    },
  });

  // REJECTED and REMOVED: exercise the "hidden from the public" statuses.
  await prisma.report.create({
    data: {
      entityId: entityA.id,
      authorId: author.id,
      category: ReportCategory.OTHER,
      title: 'Reddedilmiş örnek şikayet',
      body: 'Yeterli dayanağı olmadığı için reddedildi. (Seed verisi.)',
      status: ReportStatus.REJECTED,
    },
  });
  await prisma.report.create({
    data: {
      entityId: entityB.id,
      authorId: author.id,
      category: ReportCategory.OTHER,
      title: 'Kaldırılmış örnek şikayet',
      body: 'Politika ihlali nedeniyle kaldırıldı. (Seed verisi.)',
      status: ReportStatus.REMOVED,
      publishedAt: new Date(),
    },
  });

  await recomputeStats(entityA.id);
  await recomputeStats(entityB.id);

  console.log('Seed tamamlandı.');
  console.log(`  Varlıklar: /${entityA.slug}, /${entityB.slug}`);
  console.log(`  Yayınlanmış şikayet: ${published.id}`);
  console.log(`  İtiraz edilmiş şikayet: ${disputed.id}`);
  console.log(`  Çözülmüş şikayet: ${resolved.id}`);
  console.log('  Demo hesaplar (sadece yerel dev DB):');
  console.log(`    ${author.email} / ${DEMO_PASSWORD} (USER)`);
  console.log(`    ${moderator.email} / ${DEMO_PASSWORD} (MODERATOR)`);
  console.log(`    ${owner.email} / ${DEMO_PASSWORD} (ENTITY_OWNER, demo-coin-a sahibi)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
