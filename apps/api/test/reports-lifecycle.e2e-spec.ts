import { INestApplication } from '@nestjs/common';
import { Role, StatusActorType } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

// Each test uses its own freshly created Entity. The duplicate-report check
// (point 6) keys on entityId+authorId, and most tests below reuse the same
// `author`; sharing one Entity across tests would make unrelated test
// reports look like duplicates of each other.
describe('Reports lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let moderator: TestUser;
  let admin: TestUser;
  const entityIds: string[] = [];
  const extraUserEmails: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'life-author');
    moderator = await registerAndLogin(app, 'life-mod');
    admin = await registerAndLogin(app, 'life-admin');
    await setRole(app, moderator.userId, Role.MODERATOR);
    await setRole(app, admin.userId, Role.ADMIN);
    moderator.accessToken = await reLogin(app, moderator.email);
    admin.accessToken = await reLogin(app, admin.email);
    // Most tests below are not about the new-account open-report cap; only
    // the dedicated test for that cap should see `author` as "new".
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
    await prisma.user.deleteMany({
      where: { email: { in: [author.email, moderator.email, admin.email, ...extraUserEmails] } },
    });
    await app.close();
  });

  async function createEntity(): Promise<string> {
    const entity = await app
      .get(PrismaService)
      .entity.create({ data: { type: 'COIN', slug: `coin-life-${Date.now()}-${Math.random()}`, name: 'Test Coin' } });
    entityIds.push(entity.id);
    return entity.id;
  }

  async function createPendingReport(entityId: string, incidentAt?: string) {
    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't', body: 'b', ...(incidentAt ? { incidentAt } : {}) })
      .expect(201);
    return res.body.id as string;
  }

  function transition(reportId: string, token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function publishReport(entityId: string): Promise<string> {
    const reportId = await createPendingReport(entityId);
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ reportId, type: 'LINK', value: 'https://example.com/proof' });
    await transition(reportId, moderator.accessToken, { status: 'PUBLISHED', reason: 'ok' }).expect(200);
    return reportId;
  }

  it('refuses to publish without at least one approved evidence', async () => {
    const reportId = await createPendingReport(await createEntity());
    await transition(reportId, moderator.accessToken, { status: 'PUBLISHED', reason: 'looks fine' }).expect(400);
  });

  it('publishes once evidence exists, sets publishedAt, and records both logs', async () => {
    const entityId = await createEntity();
    const reportId = await createPendingReport(entityId);
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ reportId, type: 'LINK', value: 'https://example.com/proof' })
      .expect(201);

    const res = await transition(reportId, moderator.accessToken, {
      status: 'PUBLISHED',
      reason: 'evidence checks out',
    }).expect(200);
    expect(res.body.publishedAt).not.toBeNull();

    const prisma = app.get(PrismaService);
    const log = await prisma.moderationLog.findFirst({ where: { reportId } });
    expect(log?.action).toBe('APPROVE');
    expect(log?.reason).toBe('evidence checks out');

    const history = await prisma.reportStatusHistory.findFirst({
      where: { reportId, toStatus: 'PUBLISHED' },
    });
    expect(history?.fromStatus).toBe('PENDING');
    expect(history?.actorType).toBe(StatusActorType.MODERATOR);
    expect(history?.actorId).toBe(moderator.userId);
  });

  it('rejects a transition that is not in the state graph', async () => {
    const reportId = await createPendingReport(await createEntity());
    await transition(reportId, moderator.accessToken, { status: 'RESOLVED', reason: 'x' }).expect(400);
  });

  it('rejects REJECT/REMOVE without a reason', async () => {
    const reportId = await createPendingReport(await createEntity());
    await transition(reportId, moderator.accessToken, { status: 'REJECTED' }).expect(400);
  });

  it('allows RESOLVED -> REMOVED with a reason', async () => {
    const reportId = await publishReport(await createEntity());
    await transition(reportId, moderator.accessToken, { status: 'RESOLVED', reason: 'resolved by mod' }).expect(200);
    await transition(reportId, moderator.accessToken, { status: 'REMOVED', reason: 'policy violation' }).expect(200);
  });

  it('restricts REJECTED -> PENDING and REMOVED -> PUBLISHED to ADMIN', async () => {
    const rejectedReport = await createPendingReport(await createEntity());
    await transition(rejectedReport, moderator.accessToken, { status: 'REJECTED', reason: 'no merit' }).expect(200);

    await transition(rejectedReport, moderator.accessToken, { status: 'PENDING', reason: 'reopen' }).expect(403);
    await transition(rejectedReport, admin.accessToken, { status: 'PENDING', reason: 'reopen' }).expect(200);

    const removedReport = await publishReport(await createEntity());
    await transition(removedReport, moderator.accessToken, { status: 'REMOVED', reason: 'bad' }).expect(200);
    await transition(removedReport, moderator.accessToken, { status: 'PUBLISHED', reason: 'restore' }).expect(403);
    await transition(removedReport, admin.accessToken, { status: 'PUBLISHED', reason: 'restore' }).expect(200);
  });

  it('blocks a duplicate report about the same entity within 7 days and names the existing one', async () => {
    const entityId = await createEntity();
    const reportId = await createPendingReport(entityId, '2026-06-01T00:00:00.000Z');
    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't2', body: 'b2', incidentAt: '2026-06-05T00:00:00.000Z' })
      .expect(409);
    expect(res.body.existingReportId).toBe(reportId);
  });

  it('allows a new report about the same entity when the incident is more than 7 days apart', async () => {
    const entityId = await createEntity();
    await createPendingReport(entityId, '2026-01-01T00:00:00.000Z');
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't3', body: 'b3', incidentAt: '2026-02-01T00:00:00.000Z' })
      .expect(201);
  });

  it('does not let a REJECTED duplicate block a new report', async () => {
    const entityId = await createEntity();
    const reportId = await createPendingReport(entityId, '2026-03-01T00:00:00.000Z');
    await transition(reportId, moderator.accessToken, { status: 'REJECTED', reason: 'no merit' }).expect(200);
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't4', body: 'b4', incidentAt: '2026-03-02T00:00:00.000Z' })
      .expect(201);
  });

  it('caps a brand-new account at 3 concurrently open reports', async () => {
    const entityId = await createEntity();
    const freshUser = await registerAndLogin(app, 'life-fresh');
    extraUserEmails.push(freshUser.email);
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/reports')
        .set('Authorization', `Bearer ${freshUser.accessToken}`)
        .send({
          entityId,
          category: 'RUG_PULL',
          title: `fresh-${i}`,
          body: 'b',
          incidentAt: `2027-0${i + 1}-01T00:00:00.000Z`,
        })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${freshUser.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 'fresh-4', body: 'b', incidentAt: '2027-04-01T00:00:00.000Z' })
      .expect(403);
  });

  it('lets the author set a satisfaction rating exactly once after RESOLVED, and no one else', async () => {
    const reportId = await publishReport(await createEntity());
    await transition(reportId, moderator.accessToken, { status: 'RESOLVED', reason: 'done' }).expect(200);

    const stranger = await registerAndLogin(app, 'life-stranger');
    extraUserEmails.push(stranger.email);
    await transition(reportId, stranger.accessToken, { satisfactionRating: 5 }).expect(403);
    await transition(reportId, moderator.accessToken, { satisfactionRating: 5 }).expect(403);

    await transition(reportId, author.accessToken, { satisfactionRating: 4, satisfactionNote: 'ok' }).expect(200);
    await transition(reportId, author.accessToken, { satisfactionRating: 5 }).expect(403);
  });

  it('lets the author edit content while PENDING, but not status, and not once PUBLISHED', async () => {
    const reportId = await createPendingReport(await createEntity());
    await transition(reportId, author.accessToken, { title: 'edited' }).expect(200);
    await transition(reportId, author.accessToken, { status: 'PUBLISHED', reason: 'x' }).expect(403);

    const publishedId = await publishReport(await createEntity());
    await transition(publishedId, author.accessToken, { title: 'too late' }).expect(403);
  });
});
