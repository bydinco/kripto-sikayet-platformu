import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

// Covers the admin-panel-facing additions: GET /reports?status= (mod/admin
// only), GET /reports/status-counts, GET /reports/:id/status-history,
// allowedTransitions on GET /reports/:id, and GET /moderation?reportId=.
describe('Moderation queue endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let moderator: TestUser;
  const entityIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'modq-author');
    moderator = await registerAndLogin(app, 'modq-mod');
    await setRole(app, moderator.userId, Role.MODERATOR);
    moderator.accessToken = await reLogin(app, moderator.email);
    // This file creates more than 3 concurrently-open reports for `author`
    // across its tests; back-date them past the new-account cap window
    // (see reports-lifecycle.e2e-spec.ts for the same pattern).
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
      .entity.create({ data: { type: 'COIN', slug: `coin-modq-${Date.now()}-${Math.random()}`, name: 'Test Coin' } });
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

  it('ignores ?status= for a plain visitor/author but honors it for a moderator', async () => {
    const entityId = await createEntity();
    const pendingId = await createPendingReport(entityId);

    const asAuthor = await request(app.getHttpServer())
      .get(`/reports?entityId=${entityId}&status=REJECTED`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(200);
    // author isn't a moderator, so the status filter is ignored: they only
    // ever see their own report (PENDING) or public ones, never a filtered
    // "REJECTED" set that would otherwise be empty.
    expect(asAuthor.body.map((r: { id: string }) => r.id)).toContain(pendingId);

    const asModerator = await request(app.getHttpServer())
      .get(`/reports?entityId=${entityId}&status=PENDING`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
    expect(asModerator.body.map((r: { id: string }) => r.id)).toContain(pendingId);

    const filteredOut = await request(app.getHttpServer())
      .get(`/reports?entityId=${entityId}&status=REJECTED`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
    expect(filteredOut.body.map((r: { id: string }) => r.id)).not.toContain(pendingId);
  });

  it('rejects an invalid ?status= value with 400', async () => {
    await request(app.getHttpServer())
      .get('/reports?status=NOT_A_STATUS')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(400);
  });

  it('restricts GET /reports/status-counts to moderator/admin and returns every status key', async () => {
    await request(app.getHttpServer())
      .get('/reports/status-counts')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(403);

    const res = await request(app.getHttpServer())
      .get('/reports/status-counts')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('PENDING');
    expect(res.body).toHaveProperty('PUBLISHED');
    expect(typeof res.body.PENDING).toBe('number');
  });

  it('returns allowedTransitions only for a moderator viewing GET /reports/:id', async () => {
    const reportId = await createPendingReport(await createEntity());

    const asAuthor = await request(app.getHttpServer())
      .get(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(200);
    expect(asAuthor.body.allowedTransitions).toBeUndefined();

    const asModerator = await request(app.getHttpServer())
      .get(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
    expect(asModerator.body.allowedTransitions.sort()).toEqual(['NEEDS_EVIDENCE', 'PUBLISHED', 'REJECTED'].sort());
  });

  it('exposes GET /reports/:id/status-history to moderator/admin only, in order', async () => {
    const reportId = await createPendingReport(await createEntity());
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ reportId, type: 'LINK', value: 'https://example.com/proof' });
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'PUBLISHED', reason: 'ok' })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/reports/${reportId}/status-history`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(403);

    const res = await request(app.getHttpServer())
      .get(`/reports/${reportId}/status-history`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].fromStatus).toBe('PENDING');
    expect(res.body[0].toStatus).toBe('PUBLISHED');
  });

  it('filters GET /moderation by reportId', async () => {
    const entityIdA = await createEntity();
    const entityIdB = await createEntity();
    const reportIdA = await createPendingReport(entityIdA);
    const reportIdB = await createPendingReport(entityIdB);
    await request(app.getHttpServer())
      .patch(`/reports/${reportIdA}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', reason: 'no merit' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/reports/${reportIdB}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', reason: 'no merit' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/moderation?reportId=${reportIdA}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].reportId).toBe(reportIdA);
  });
});
