import { INestApplication } from '@nestjs/common';
import { Role, StatusActorType } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

describe('Evidence approval gate (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let moderator: TestUser;
  const entityIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'evap-author');
    moderator = await registerAndLogin(app, 'evap-mod');
    await setRole(app, moderator.userId, Role.MODERATOR);
    moderator.accessToken = await reLogin(app, moderator.email);
    await app.get(PrismaService).user.update({
      where: { id: author.userId },
      data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.reportStatusHistory.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.moderationLog.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.evidence.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.report.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [author.email, moderator.email] } } });
    await app.close();
  });

  async function createEntity(): Promise<string> {
    const entity = await app
      .get(PrismaService)
      .entity.create({ data: { type: 'COIN', slug: `coin-evap-${Date.now()}-${Math.random()}`, name: 'Test Coin' } });
    entityIds.push(entity.id);
    return entity.id;
  }

  async function createPendingReport(entityId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't', body: 'b' })
      .expect(201);
    return res.body.id as string;
  }

  async function addEvidence(reportId: string, token: string) {
    const res = await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${token}`)
      .send({ reportId, type: 'LINK', value: `https://example.com/${Date.now()}-${Math.random()}` })
      .expect(201);
    return res.body;
  }

  it('is approved by default when added before publication', async () => {
    const reportId = await createPendingReport(await createEntity());
    const evidence = await addEvidence(reportId, author.accessToken);
    expect(evidence.approved).toBe(true);
  });

  it('adding evidence while NEEDS_EVIDENCE auto-moves the report back to PENDING with an AUTHOR history row', async () => {
    const reportId = await createPendingReport(await createEntity());
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'NEEDS_EVIDENCE', reason: 'need proof' })
      .expect(200);

    await addEvidence(reportId, author.accessToken);

    const report = await app.get(PrismaService).report.findUnique({ where: { id: reportId } });
    expect(report?.status).toBe('PENDING');

    const history = await app.get(PrismaService).reportStatusHistory.findFirst({
      where: { reportId, toStatus: 'PENDING' },
    });
    expect(history?.fromStatus).toBe('NEEDS_EVIDENCE');
    expect(history?.actorType).toBe(StatusActorType.AUTHOR);
    expect(history?.actorId).toBe(author.userId);
  });

  async function publishReport(entityId: string): Promise<{ reportId: string }> {
    const reportId = await createPendingReport(entityId);
    await addEvidence(reportId, author.accessToken);
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'PUBLISHED', reason: 'ok' })
      .expect(200);
    return { reportId };
  }

  it("hides the author's post-publication evidence from the public until a moderator approves it", async () => {
    const { reportId } = await publishReport(await createEntity());
    const newEvidence = await addEvidence(reportId, author.accessToken);
    expect(newEvidence.approved).toBe(false);

    await request(app.getHttpServer()).get(`/evidence/${newEvidence.id}`).expect(403);

    await request(app.getHttpServer())
      .get(`/evidence/${newEvidence.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/evidence/${newEvidence.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/evidence/${newEvidence.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ approved: true })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/evidence/${newEvidence.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ approved: true })
      .expect(200);

    await request(app.getHttpServer()).get(`/evidence/${newEvidence.id}`).expect(200);
  });

  it('does not gate evidence a moderator adds after publication', async () => {
    const { reportId } = await publishReport(await createEntity());
    const modEvidence = await addEvidence(reportId, moderator.accessToken);
    expect(modEvidence.approved).toBe(true);
    await request(app.getHttpServer()).get(`/evidence/${modEvidence.id}`).expect(200);
  });
});
