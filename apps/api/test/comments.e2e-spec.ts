import { INestApplication } from '@nestjs/common';
import { ModerationAction, Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

describe('Report comments (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let commenter: TestUser;
  let stranger: TestUser;
  let moderator: TestUser;
  const entityIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'comment-author');
    commenter = await registerAndLogin(app, 'comment-commenter');
    stranger = await registerAndLogin(app, 'comment-stranger');
    moderator = await registerAndLogin(app, 'comment-mod');
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
    await prisma.user.deleteMany({
      where: { email: { in: [author.email, commenter.email, stranger.email, moderator.email] } },
    });
    await app.close();
  });

  async function createEntity(): Promise<string> {
    const entity = await app.get(PrismaService).entity.create({
      data: { type: 'COIN', slug: `coin-comment-${Date.now()}-${Math.random()}`, name: 'Test Coin' },
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

  it('401s an anonymous comment POST', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer()).post(`/reports/${reportId}/comments`).send({ body: 'hi there' }).expect(401);
  });

  it('404s commenting on (and listing) a PENDING report for a stranger', async () => {
    const entityId = await createEntity();
    const reportId = await createPendingReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ body: 'hi there' })
      .expect(404);
    await request(app.getHttpServer()).get(`/reports/${reportId}/comments`).expect(404);
  });

  it('400s a body shorter than 2 characters or longer than 1000', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ body: 'a' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ body: 'a'.repeat(1001) })
      .expect(400);
  });

  it('400s a body with more than 2 URLs', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ body: 'see https://a.example and https://b.example and https://c.example' })
      .expect(400);
  });

  it('lets the report author comment on their own report, and never leaks email/userId', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);

    const res = await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ body: 'an update from me' })
      .expect(201);

    expect(res.body).toMatchObject({ body: 'an update from me', isMeToo: false, isReportAuthor: true });
    expect(res.body.author).toEqual({ handle: expect.any(String) });
    expect(res.body.userId).toBeUndefined();
    expect(res.body.email).toBeUndefined();
    expect(res.body.author.email).toBeUndefined();
    expect(res.body.author.id).toBeUndefined();

    const list = await request(app.getHttpServer()).get(`/reports/${reportId}/comments`).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].userId).toBeUndefined();
  });

  it('lets the author delete their own comment, and forbids a stranger from deleting it', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    const posted = await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ body: 'delete me later' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/comments/${posted.body.id}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/comments/${posted.body.id}`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({})
      .expect(200);

    const list = await request(app.getHttpServer()).get(`/reports/${reportId}/comments`).expect(200);
    expect(list.body.map((c: { id: string }) => c.id)).not.toContain(posted.body.id);

    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/comments/${posted.body.id}`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({})
      .expect(404);
  });

  it('400s a moderator hiding a comment without a reason, 200s with one, writes HIDE_COMMENT, and hides it from the public list and count', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    const posted = await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ body: 'please hide this' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/comments/${posted.body.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/comments/${posted.body.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ reason: 'abusive content' })
      .expect(200);

    const log = await app.get(PrismaService).moderationLog.findFirst({
      where: { commentId: posted.body.id, action: ModerationAction.HIDE_COMMENT },
    });
    expect(log).toMatchObject({ reportId, reason: 'abusive content', moderatorId: moderator.userId });

    const list = await request(app.getHttpServer()).get(`/reports/${reportId}/comments`).expect(200);
    expect(list.body.map((c: { id: string }) => c.id)).not.toContain(posted.body.id);

    const summary = await request(app.getHttpServer()).get(`/reports/${reportId}/engagement`).expect(200);
    expect(summary.body.commentCount).toBe(0);
  });

  it('404s hiding a comment that no longer exists/is already hidden', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer())
      .delete(`/reports/${reportId}/comments/not-a-real-id`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ reason: 'n/a' })
      .expect(404);
  });

  it('separates comment count from me-too count in the engagement summary', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ body: 'a plain comment' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/me-too`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({})
      .expect(201);

    const summary = await request(app.getHttpServer()).get(`/reports/${reportId}/engagement`).expect(200);
    expect(summary.body).toMatchObject({ commentCount: 1, meTooCount: 1 });

    // Both a plain comment and a me-too row show up in the comment feed,
    // flagged by isMeToo.
    const list = await request(app.getHttpServer()).get(`/reports/${reportId}/comments`).expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((c: { isMeToo: boolean }) => c.isMeToo)).toHaveLength(1);
  });

  it('429s once the daily comment quota (30) is reached for an established account', async () => {
    const entityId = await createEntity();
    const reportId = await createPublishedReport(entityId);
    const prisma = app.get(PrismaService);

    // Established account: not "new" (createdAt well over 24h ago).
    await prisma.user.update({
      where: { id: commenter.userId },
      data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });
    // Seed 30 comments directly — faster than 30 sequential HTTP round
    // trips, and still exercises the real count-based check in the
    // service on the 31st, real HTTP request below.
    await prisma.reportComment.createMany({
      data: Array.from({ length: 30 }, () => ({ reportId, userId: commenter.userId, body: 'filler', isMeToo: false })),
    });

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ body: 'one too many' })
      .expect(429);
  });
});
