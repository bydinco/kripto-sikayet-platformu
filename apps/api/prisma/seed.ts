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
  WalletKind,
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

interface SeedFactorDef {
  code: string;
  name: string;
  description: string;
  maxPoints: number;
  dataSource: string;
}

const METHODOLOGY_V1_DRAFT =
  'Taslak, kalibre edilecek. v1 yöntemi: her faktör mevcut veriye göre 0-1 risk oranına çevrilir, ' +
  'ardından faktör ağırlığıyla (maxPoints) ölçeklenir. Veri eksikse faktör atlanır ve güven (confidence) düşer; ' +
  'güven %40 altındaysa sayısal skor üretilmez ("Insufficient data").';

// v1 risk models, seeded inactive (active: false) — see CLAUDE.md for the
// activation flow. Weights below are a draft starting point, not calibrated
// against real-world outcomes yet.
async function upsertRiskModel(entityType: EntityType, factors: SeedFactorDef[]) {
  const model = await prisma.riskModel.upsert({
    where: { entityType_version: { entityType, version: 1 } },
    update: {},
    create: { entityType, version: 1, active: false, methodology: METHODOLOGY_V1_DRAFT },
  });
  for (const factor of factors) {
    await prisma.riskFactorDef.upsert({
      where: { modelId_code: { modelId: model.id, code: factor.code } },
      update: {},
      create: { modelId: model.id, weight: factor.maxPoints, ...factor },
    });
  }
  return model;
}

const COIN_FACTORS: SeedFactorDef[] = [
  { code: 'HONEYPOT', name: 'Honeypot taraması', description: 'Kontratın satışı engelleyen (honeypot) davranış gösterip göstermediği.', maxPoints: 20, dataSource: 'contract_audit' },
  { code: 'LIQUIDITY_LOCK', name: 'Likidite kilidi', description: 'Likiditenin kilitli olup olmadığı.', maxPoints: 15, dataSource: 'contract_audit' },
  { code: 'TOP10_HOLDERS', name: 'İlk 10 cüzdan oranı', description: 'İlk 10 cüzdanın toplam arzdaki payı.', maxPoints: 10, dataSource: 'contract_audit' },
  { code: 'SELL_TAX', name: 'Satış vergisi', description: 'Satış işlemlerinde kesilen vergi oranı.', maxPoints: 10, dataSource: 'contract_audit' },
  { code: 'OWNERSHIP', name: 'Sahiplik feragati', description: 'Kontrat sahipliğinin feragat edilip edilmediği.', maxPoints: 5, dataSource: 'contract_audit' },
  { code: 'REPORT_RATE', name: 'Şikayet oranı', description: 'Son 90 günde bağımsız yazarlardan, onaylı kanıtlı nitelikli şikayet sayısı.', maxPoints: 15, dataSource: 'reports' },
  { code: 'CHAIN_VERIFIED_RATIO', name: 'Zincir üstü doğrulama oranı', description: 'Onaylı kanıtların zincir üstü doğrulanma oranı.', maxPoints: 10, dataSource: 'evidence' },
  { code: 'BRAND_RESPONSE', name: 'Marka yanıt oranı', description: 'Yanıtlanan benzersiz şikayet oranı (yanıt sayısı/hızı değil).', maxPoints: 5, dataSource: 'reports' },
  { code: 'RESOLUTION', name: 'Çözüm oranı', description: 'Çözülmüş şikayet oranı.', maxPoints: 5, dataSource: 'reports' },
  { code: 'ENTITY_AGE', name: 'Varlık yaşı', description: 'Kuruluş tarihinden (foundedAt) bu yana geçen süre.', maxPoints: 5, dataSource: 'manual' },
];

const EXCHANGE_FACTORS: SeedFactorDef[] = [
  { code: 'LICENSE', name: 'Lisans durumu', description: 'Borsanın bilinen bir lisansı olup olmadığı.', maxPoints: 20, dataSource: 'exchange_profile' },
  { code: 'PROOF_OF_RESERVES', name: 'Rezerv kanıtı', description: 'Kamuya açık rezerv kanıtı olup olmadığı.', maxPoints: 20, dataSource: 'exchange_profile' },
  { code: 'REPORT_RATE', name: 'Şikayet oranı', description: 'Son 90 günde bağımsız yazarlardan, onaylı kanıtlı nitelikli şikayet sayısı.', maxPoints: 20, dataSource: 'reports' },
  { code: 'CHAIN_VERIFIED_RATIO', name: 'Zincir üstü doğrulama oranı', description: 'Onaylı kanıtların zincir üstü doğrulanma oranı.', maxPoints: 10, dataSource: 'evidence' },
  { code: 'BRAND_RESPONSE', name: 'Marka yanıt oranı', description: 'Yanıtlanan benzersiz şikayet oranı (yanıt sayısı/hızı değil).', maxPoints: 10, dataSource: 'reports' },
  { code: 'RESOLUTION', name: 'Çözüm oranı', description: 'Çözülmüş şikayet oranı.', maxPoints: 10, dataSource: 'reports' },
  { code: 'ENTITY_AGE', name: 'Varlık yaşı', description: 'Kuruluş tarihinden (foundedAt) bu yana geçen süre.', maxPoints: 10, dataSource: 'manual' },
];

const WALLET_FACTORS: SeedFactorDef[] = [
  { code: 'OPEN_SOURCE', name: 'Açık kaynak', description: 'Yazılımın açık kaynaklı olup olmadığı.', maxPoints: 20, dataSource: 'wallet_profile' },
  { code: 'AUDITED', name: 'Bağımsız denetim', description: 'Bağımsız bir denetimden geçip geçmediği.', maxPoints: 20, dataSource: 'wallet_profile' },
  { code: 'SECURE_ELEMENT', name: 'Güvenli eleman', description: 'Sadece donanım cüzdanlarına uygulanır: güvenli eleman (secure element) olup olmadığı.', maxPoints: 15, dataSource: 'wallet_profile' },
  { code: 'OFFICIAL_SELLERS', name: 'Yetkili satış kanalı', description: 'Yetkili satış kanalı kaydı olup olmadığı (sahte cihaz riskine karşı).', maxPoints: 10, dataSource: 'wallet_profile' },
  { code: 'REPORT_RATE', name: 'Şikayet oranı', description: 'Son 90 günde bağımsız yazarlardan, onaylı kanıtlı nitelikli şikayet sayısı.', maxPoints: 15, dataSource: 'reports' },
  { code: 'CHAIN_VERIFIED_RATIO', name: 'Zincir üstü doğrulama oranı', description: 'Onaylı kanıtların zincir üstü doğrulanma oranı.', maxPoints: 10, dataSource: 'evidence' },
  { code: 'BRAND_RESPONSE', name: 'Marka yanıt oranı', description: 'Yanıtlanan benzersiz şikayet oranı (yanıt sayısı/hızı değil).', maxPoints: 5, dataSource: 'reports' },
  { code: 'RESOLUTION', name: 'Çözüm oranı', description: 'Çözülmüş şikayet oranı.', maxPoints: 5, dataSource: 'reports' },
];

async function upsertDemoUser(email: string, handle: string, role: Role) {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, handle, passwordHash, role, emailVerified: true },
  });
}

async function main() {
  await upsertRiskModel(EntityType.COIN, COIN_FACTORS);
  await upsertRiskModel(EntityType.EXCHANGE, EXCHANGE_FACTORS);
  await upsertRiskModel(EntityType.WALLET, WALLET_FACTORS);

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
      foundedAt: new Date('2023-06-01'),
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
      foundedAt: new Date('2021-03-01'),
    },
  });

  const entityC = await prisma.entity.upsert({
    where: { slug: 'demo-wallet-c' },
    update: {},
    create: {
      type: EntityType.WALLET,
      slug: 'demo-wallet-c',
      name: 'Demo Wallet C',
      summary: 'Tamamen kurgusal örnek cüzdan (seed verisi).',
      foundedAt: new Date('2022-09-01'),
    },
  });

  // Risk engine inputs: a Chain + Coin + ContractAudit for entityA, an
  // ExchangeProfile for entityB, a WalletProfile for entityC.
  const chain = await prisma.chain.upsert({
    where: { slug: 'demo-chain' },
    update: {},
    create: { slug: 'demo-chain', name: 'Demo Chain (seed)', explorerUrl: 'https://explorer.example.com' },
  });

  const coinProfile = await prisma.coin.upsert({
    where: { entityId: entityA.id },
    update: {},
    create: {
      entityId: entityA.id,
      chainId: chain.id,
      symbol: 'DEMOA',
      contractAddress: '0x0000000000000000000000000000000000000001',
    },
  });
  await prisma.contractAudit.create({
    data: {
      coinId: coinProfile.id,
      ownerRenounced: true,
      isHoneypot: false,
      liquidityLocked: true,
      liquidityUsd: 50_000,
      top10HolderPct: 35,
      buyTaxPct: 1,
      sellTaxPct: 2,
      isProxy: false,
    },
  });

  await prisma.exchangeProfile.upsert({
    where: { entityId: entityB.id },
    update: {},
    create: {
      entityId: entityB.id,
      custodial: true,
      licensed: true,
      licenseInfo: 'Demo lisans kaydı (seed verisi).',
      proofOfReserves: false,
      restrictedCountries: [],
      supportedCountries: [],
    },
  });

  await prisma.walletProfile.upsert({
    where: { entityId: entityC.id },
    update: {},
    create: {
      entityId: entityC.id,
      kind: WalletKind.HARDWARE,
      openSource: false,
      auditedBy: 'Demo Denetim Firması (seed verisi).',
      secureElement: true,
      supportedChains: [],
      officialSellers: ['https://example.com/demo-store'],
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
  console.log(`  Varlıklar: /${entityA.slug}, /${entityB.slug}, /${entityC.slug}`);
  console.log('  Risk modelleri (v1, active=false): COIN, EXCHANGE, WALLET');
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
