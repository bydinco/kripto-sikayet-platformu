import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

// Companion to the static source check in
// src/scoring/risk-score-engagement-independence.spec.ts: proves end to
// end that voting, "me too", commenting, and a moderator hiding a comment
// never trigger a score recompute (see CLAUDE.md: the risk score must
// never be influenced by a user-manipulable engagement signal).
describe('Engagement never recomputes the risk score (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let voter: TestUser;
  let moderator: TestUser;
  let entityId: string;
  let modelId: string;

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'escore-author');
    voter = await registerAndLogin(app, 'escore-voter');
    moderator = await registerAndLogin(app, 'escore-mod');
    await setRole(app, moderator.userId, Role.MODERATOR);
    moderator.accessToken = await reLogin(app, moderator.email);

    const prisma = app.get(PrismaService);
    const entity = await prisma.entity.create({
      data: { type: 'COIN', slug: `coin-escore-${Date.now()}`, name: 'Test Coin' },
    });
    entityId = entity.id;
    const model = await prisma.riskModel.create({
      data: { entityType: 'COIN', version: 900_000 + Math.floor(Math.random() * 90_000) },
    });
    modelId = model.id;
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.reportComment.deleteMany({ where: { report: { entityId } } });
    await prisma.reportVote.deleteMany({ where: { report: { entityId } } });
    await prisma.reportStatusHistory.deleteMany({ where: { report: { entityId } } });
    await prisma.moderationLog.deleteMany({ where: { report: { entityId } } });
    await prisma.evidence.deleteMany({ where: { report: { entityId } } });
    await prisma.report.deleteMany({ where: { entityId } });
    await prisma.riskScore.deleteMany({ where: { entityId } });
    await prisma.riskModel.delete({ where: { id: modelId } });
    await prisma.entityStats.deleteMany({ where: { entityId } });
    await prisma.entity.delete({ where: { id: entityId } });
    await prisma.user.deleteMany({ where: { email: { in: [author.email, voter.email, moderator.email] } } });
    await app.close();
  });

  it('leaves the RiskScore row untouched after a vote, a me-too, a comment, and a moderator hiding a comment', async () => {
    const prisma = app.get(PrismaService);

    const create = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't', body: 'b' })
      .expect(201);
    const reportId = create.body.id as string;
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ reportId, type: 'LINK', value: `https://example.com/${Date.now()}` });
    // PENDING -> PUBLISHED triggers safeRecomputeScore, which writes the
    // one RiskScore row this test watches.
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'PUBLISHED', reason: 'ok' })
      .expect(200);

    const before = await prisma.riskScore.findFirst({ where: { entityId, modelId }, orderBy: { computedAt: 'desc' } });
    expect(before).not.toBeNull();

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/votes`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/me-too`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .expect(201);
    const comment = await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .send({ body: 'this should never touch the score' })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/comments/${comment.body.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ reason: 'test hide' })
      .expect(200);

    const after = await prisma.riskScore.findFirst({ where: { entityId, modelId }, orderBy: { computedAt: 'desc' } });
    expect(after?.id).toBe(before?.id);
    expect(after?.computedAt.getTime()).toBe(before?.computedAt.getTime());

    const allScores = await prisma.riskScore.findMany({ where: { entityId, modelId } });
    expect(allScores).toHaveLength(1);
  });
});
