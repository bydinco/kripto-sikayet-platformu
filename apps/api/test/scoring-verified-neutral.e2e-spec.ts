import { INestApplication } from '@nestjs/common';
import { EntityType, Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

// The end-to-end guarantee that Entity.verified never affects the computed
// risk score: two otherwise-identical entities, differing only in
// `verified`, must get identical scores. (RiskEngineInputs doesn't even
// have a `verified` field — this proves it holds through the real DB
// round-trip too, not just at the type level.)
//
// Uses EntityType.WALLET for its scratch RiskModel — see
// scoring-admin.e2e-spec.ts for why each scoring e2e file picks its own
// entityType (avoids racing on "latest version" with other files).
describe('Risk scoring — Entity.verified has no effect (e2e)', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  const entityIds: string[] = [];
  const modelIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    admin = await registerAndLogin(app, 'scoreverif-admin');
    await setRole(app, admin.userId, Role.ADMIN);
    admin.accessToken = await reLogin(app, admin.email);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.riskScoreFactor.deleteMany({ where: { score: { entityId: { in: entityIds } } } });
    await prisma.riskScore.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.walletProfile.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.riskFactorDef.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.riskModel.deleteMany({ where: { id: { in: modelIds } } });
    await prisma.user.deleteMany({ where: { email: admin.email } });
    await app.close();
  });

  it('produces identical scores for two entities that differ only in verified', async () => {
    const prisma = app.get(PrismaService);
    const version = 900_000 + Math.floor(Math.random() * 50_000);
    const model = await prisma.riskModel.create({ data: { entityType: EntityType.WALLET, version } });
    modelIds.push(model.id);
    await prisma.riskFactorDef.create({
      data: { modelId: model.id, code: 'OPEN_SOURCE', name: 'Open source', weight: 100, maxPoints: 100 },
    });

    const verifiedEntity = await prisma.entity.create({
      data: { type: EntityType.WALLET, slug: `wallet-verif-true-${Date.now()}`, name: 'Verified Wallet', verified: true },
    });
    const unverifiedEntity = await prisma.entity.create({
      data: { type: EntityType.WALLET, slug: `wallet-verif-false-${Date.now()}`, name: 'Unverified Wallet', verified: false },
    });
    entityIds.push(verifiedEntity.id, unverifiedEntity.id);

    // Identical WalletProfile data for both — the only difference between
    // the two entities is Entity.verified.
    for (const entity of [verifiedEntity, unverifiedEntity]) {
      await prisma.walletProfile.create({
        data: { entityId: entity.id, kind: 'MOBILE', openSource: false, supportedChains: [], officialSellers: [] },
      });
    }

    const [verifiedRes, unverifiedRes] = await Promise.all(
      [verifiedEntity, unverifiedEntity].map((entity) =>
        request(app.getHttpServer())
          .post(`/scoring/recompute/${entity.id}`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(201),
      ),
    );

    expect(verifiedRes.body.score).toBe(unverifiedRes.body.score);
    expect(verifiedRes.body.level).toBe(unverifiedRes.body.level);
    expect(verifiedRes.body.confidence).toBe(unverifiedRes.body.confidence);

    const normalizeFactors = (factors: { factor: { code: string }; points: string | number; rawValue: string | null }[]) =>
      factors
        .map((f) => ({ code: f.factor.code, points: Number(f.points), rawValue: f.rawValue }))
        .sort((a, b) => a.code.localeCompare(b.code));

    expect(normalizeFactors(verifiedRes.body.factors)).toEqual(normalizeFactors(unverifiedRes.body.factors));
    // Sanity check this isn't trivially vacuous (e.g. both empty/zero).
    expect(verifiedRes.body.score).toBe(100); // openSource:false -> fraction 1 -> max risk
    expect(verifiedRes.body.level).toBe('CRITICAL_SIGNAL');
  });
});
