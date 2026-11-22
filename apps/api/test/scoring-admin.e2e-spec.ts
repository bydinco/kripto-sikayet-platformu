import { INestApplication } from '@nestjs/common';
import { EntityType, Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

// Covers the HTTP surface added for the risk scoring engine: ADMIN-only
// recompute/model-activation, the public active-models listing, and the
// visibility rule (non-ADMIN only ever sees scores computed under a
// currently-active model).
//
// Uses EntityType.EXCHANGE for its scratch RiskModel rows — deliberately
// NOT the same type as scoring.e2e-spec.ts (COIN) or
// scoring-verified-neutral.e2e-spec.ts (WALLET): recomputeScore always
// picks the highest-`version` model for a given entityType, so two test
// files racing on the SAME entityType could stomp on each other's
// "latest" when vitest runs files in parallel workers against the same
// dev DB. A dedicated entityType per file sidesteps that entirely.
describe('Risk scoring — admin endpoints and visibility (e2e)', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let moderator: TestUser;
  const entityIds: string[] = [];
  const modelIds: string[] = [];
  // Monotonically increasing within this file (random base avoids
  // collisions with the real seeded EXCHANGE v1 model), so "latest
  // version" is deterministic across this file's own sequential tests.
  let nextVersion = 900_000 + Math.floor(Math.random() * 50_000);

  beforeAll(async () => {
    app = await createTestApp();
    admin = await registerAndLogin(app, 'scoreadm-admin');
    moderator = await registerAndLogin(app, 'scoreadm-mod');
    await setRole(app, admin.userId, Role.ADMIN);
    await setRole(app, moderator.userId, Role.MODERATOR);
    admin.accessToken = await reLogin(app, admin.email);
    moderator.accessToken = await reLogin(app, moderator.email);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.riskScoreFactor.deleteMany({ where: { score: { entityId: { in: entityIds } } } });
    await prisma.riskScore.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.riskFactorDef.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.riskModel.deleteMany({ where: { id: { in: modelIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [admin.email, moderator.email] } } });
    await app.close();
  });

  // A single always-available factor (REPORT_RATE, fed by complaint
  // aggregates) is enough here — no need for Coin/ContractAudit setup.
  // With zero reports, qualifyingReportCount=0 -> fraction=0 -> score=0.
  async function createExchangeModel(active = false) {
    const prisma = app.get(PrismaService);
    const model = await prisma.riskModel.create({ data: { entityType: EntityType.EXCHANGE, version: nextVersion++, active } });
    modelIds.push(model.id);
    await prisma.riskFactorDef.create({
      data: { modelId: model.id, code: 'REPORT_RATE', name: 'Report rate', weight: 100, maxPoints: 100 },
    });
    return model;
  }

  async function createExchangeEntity() {
    const prisma = app.get(PrismaService);
    const entity = await prisma.entity.create({
      data: { type: EntityType.EXCHANGE, slug: `exchange-scoreadm-${Date.now()}-${Math.random()}`, name: 'Test Exchange' },
    });
    entityIds.push(entity.id);
    return entity;
  }

  it('restricts POST /scoring/recompute/:entityId to ADMIN', async () => {
    const entity = await createExchangeEntity();
    await request(app.getHttpServer())
      .post(`/scoring/recompute/${entity.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(403);
  });

  it('is a quiet no-op (no crash) when no model exists for the entity type', async () => {
    const prisma = app.get(PrismaService);
    const entity = await prisma.entity.create({
      data: { type: EntityType.INFLUENCER, slug: `influencer-scoreadm-${Date.now()}`, name: 'Test Influencer' },
    });
    entityIds.push(entity.id);

    const res = await request(app.getHttpServer())
      .post(`/scoring/recompute/${entity.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);
    // Express's res.send(null) (what Nest does for a null return value)
    // ends the response with an empty body, not the JSON text "null".
    expect(res.text).toBe('');
  });

  it('computes and stores a score using the latest model for the entity type, even inactive', async () => {
    await createExchangeModel(false);
    const entity = await createExchangeEntity();

    const res = await request(app.getHttpServer())
      .post(`/scoring/recompute/${entity.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);

    expect(res.body.entityId).toBe(entity.id);
    expect(res.body.score).toBe(0); // no reports -> REPORT_RATE fraction 0
    expect(res.body.level).toBe('LOW');
  });

  it('hides a score computed under an inactive model from non-ADMIN, shows it to ADMIN', async () => {
    await createExchangeModel(false);
    const entity = await createExchangeEntity();
    await request(app.getHttpServer())
      .post(`/scoring/recompute/${entity.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);

    const anonymous = await request(app.getHttpServer()).get(`/scoring?entityId=${entity.id}`).expect(200);
    expect(anonymous.body).toHaveLength(0);

    const asModerator = await request(app.getHttpServer())
      .get(`/scoring?entityId=${entity.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
    expect(asModerator.body).toHaveLength(0);

    const asAdmin = await request(app.getHttpServer())
      .get(`/scoring?entityId=${entity.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(asAdmin.body).toHaveLength(1);

    const scoreId = asAdmin.body[0].id;
    await request(app.getHttpServer()).get(`/scoring/${scoreId}`).expect(404);
    await request(app.getHttpServer())
      .get(`/scoring/${scoreId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
  });

  it('reveals the same score to everyone once its model is activated', async () => {
    const model = await createExchangeModel(false);
    const entity = await createExchangeEntity();
    await request(app.getHttpServer())
      .post(`/scoring/recompute/${entity.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);

    const before = await request(app.getHttpServer()).get(`/scoring?entityId=${entity.id}`).expect(200);
    expect(before.body).toHaveLength(0);

    await request(app.getHttpServer())
      .patch(`/scoring/models/${model.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ active: true })
      .expect(200);

    const after = await request(app.getHttpServer()).get(`/scoring?entityId=${entity.id}`).expect(200);
    expect(after.body).toHaveLength(1);
  });

  it('restricts PATCH /scoring/models/:id to ADMIN', async () => {
    const model = await createExchangeModel(false);
    await request(app.getHttpServer())
      .patch(`/scoring/models/${model.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ active: true })
      .expect(403);
  });

  it('activating one model version deactivates every other version of the same entityType', async () => {
    const modelA = await createExchangeModel(true);
    const modelB = await createExchangeModel(false);

    await request(app.getHttpServer())
      .patch(`/scoring/models/${modelB.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ active: true })
      .expect(200);

    const prisma = app.get(PrismaService);
    const refreshedA = await prisma.riskModel.findUnique({ where: { id: modelA.id } });
    const refreshedB = await prisma.riskModel.findUnique({ where: { id: modelB.id } });
    expect(refreshedA?.active).toBe(false);
    expect(refreshedB?.active).toBe(true);
  });

  it('lists only active models publicly via GET /scoring/models/active', async () => {
    const activeModel = await createExchangeModel(true);
    await createExchangeModel(false);

    const res = await request(app.getHttpServer()).get('/scoring/models/active').expect(200);
    const ids = res.body.map((m: { id: string }) => m.id);
    expect(ids).toContain(activeModel.id);
  });
});
