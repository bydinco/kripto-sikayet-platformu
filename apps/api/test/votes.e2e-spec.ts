import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

describe('Report votes (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let voter: TestUser;
  let moderator: TestUser;
  const entityIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'vote-author');
    voter = await registerAndLogin(app, 'vote-voter');
    moderator = await registerAndLogin(app, 'vote-mod');
    await setRole(app, moderator.userId, Role.MODERATOR);
    moderator.accessToken = await reLogin(app, moderator.email);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.reportVote.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.reportStatusHistory.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.moderationLog.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.evidence.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.report.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entityStats.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [author.email, voter.email, moderator.email] } } });
    await app.close();
  });

  async function createEntity(): Promise<string> {
    const entity = await app.get(PrismaService).entity.create({
      data: { type: 'COIN', slug: `coin-vote-${Date.now()}-${Math.random()}`, name: 'Test Coin' },
    });
    entityIds.push(entity.id);
    return entity.id;
  }

  async function createPendingReport(entityId: string): Promise<string> {
    const create = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't', body: 'b' })
      .expect(201);
    return create.body.id as string;
  }

  async function createPublishedReport(entityId: string): Promise<string> {
    const reportId = await createPendingReport(entityId);
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ reportId, type: 'LINK', value: `https://example.com/${Date.now()}` });
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'PUBLISHED', reason: 'ok' })
      .expect(200);
    return reportId;
  }

  it('401s an anonymous vote', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer()).post(`/reports/${reportId}/votes`).expect(401);
  });

  it('404s voting on a PENDING report for someone who is neither the author nor a moderator', async () => {
    const entityId = await createEntity();
    const reportId = await createPendingReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/votes`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .expect(404);
  });

  it('403s the report author voting on their own report', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/votes`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(403);
  });

  it('lets a voter mark helpful, idempotently, and removes it via DELETE', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/votes`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .expect(201);
    // Idempotent: voting again does not error or create a second row.
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/votes`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .expect(201);

    const rows = await app.get(PrismaService).reportVote.findMany({ where: { reportId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].helpful).toBe(true);

    const summary = await request(app.getHttpServer())
      .get(`/reports/${reportId}/engagement`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .expect(200);
    expect(summary.body).toMatchObject({ helpfulCount: 1, myHelpful: true });

    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/votes`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/votes`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .expect(404);

    const afterDelete = await request(app.getHttpServer())
      .get(`/reports/${reportId}/engagement`)
      .expect(200);
    expect(afterDelete.body).toMatchObject({ helpfulCount: 0, myHelpful: false });
  });

  it('404s voting on a REMOVED report for a stranger', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REMOVED', reason: 'test cleanup' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/votes`)
      .set('Authorization', `Bearer ${voter.accessToken}`)
      .expect(404);
  });
});
