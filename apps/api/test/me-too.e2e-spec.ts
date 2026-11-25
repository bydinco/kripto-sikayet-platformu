import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

describe('Report "me too" (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let other: TestUser;
  let moderator: TestUser;
  const entityIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'metoo-author');
    other = await registerAndLogin(app, 'metoo-other');
    moderator = await registerAndLogin(app, 'metoo-mod');
    await setRole(app, moderator.userId, Role.MODERATOR);
    moderator.accessToken = await reLogin(app, moderator.email);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.reportComment.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.reportStatusHistory.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.moderationLog.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.evidence.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.report.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entityStats.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [author.email, other.email, moderator.email] } } });
    await app.close();
  });

  async function createEntity(): Promise<string> {
    const entity = await app.get(PrismaService).entity.create({
      data: { type: 'COIN', slug: `coin-metoo-${Date.now()}-${Math.random()}`, name: 'Test Coin' },
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

  it('401s an anonymous "me too"', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer()).post(`/reports/${reportId}/me-too`).expect(401);
  });

  it('404s "me too" on a PENDING report for a stranger', async () => {
    const entityId = await createEntity();
    const reportId = await createPendingReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/me-too`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
  });

  it('403s the report author saying "me too" on their own report', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/me-too`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(403);
  });

  it('creates a "me too" (optional body), 409s on a second one, and removes it via DELETE', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);

    const first = await request(app.getHttpServer())
      .post(`/reports/${reportId}/me-too`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ body: 'happened to me too' })
      .expect(201);
    expect(first.body.isMeToo).toBe(true);

    // Decision (CLAUDE.md): a second me-too is 409, not idempotent.
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/me-too`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({})
      .expect(409);

    const summary = await request(app.getHttpServer())
      .get(`/reports/${reportId}/engagement`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(200);
    expect(summary.body).toMatchObject({ meTooCount: 1, myMeToo: true });

    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/me-too`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/me-too`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);

    const afterDelete = await request(app.getHttpServer()).get(`/reports/${reportId}/engagement`).expect(200);
    expect(afterDelete.body).toMatchObject({ meTooCount: 0, myMeToo: false });
  });

  it('accepts an empty body for "me too"', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/me-too`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({})
      .expect(201);
  });
});
