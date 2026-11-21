import { INestApplication } from '@nestjs/common';
import { Role, StatusActorType } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

describe('Entity responses (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let moderator: TestUser;
  let owner: TestUser;
  let stranger: TestUser;
  const entityIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'resp-author');
    moderator = await registerAndLogin(app, 'resp-mod');
    owner = await registerAndLogin(app, 'resp-owner');
    stranger = await registerAndLogin(app, 'resp-stranger');
    await setRole(app, moderator.userId, Role.MODERATOR);
    await setRole(app, owner.userId, Role.ENTITY_OWNER);
    moderator.accessToken = await reLogin(app, moderator.email);
    owner.accessToken = await reLogin(app, owner.email);
    await app.get(PrismaService).user.update({
      where: { id: author.userId },
      data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.entityResponse.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.reportStatusHistory.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.moderationLog.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.evidence.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.report.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entityStats.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.user.deleteMany({
      where: { email: { in: [author.email, moderator.email, owner.email, stranger.email] } },
    });
    await app.close();
  });

  async function createOwnedEntity(): Promise<string> {
    const entity = await app.get(PrismaService).entity.create({
      data: {
        type: 'COIN',
        slug: `coin-resp-${Date.now()}-${Math.random()}`,
        name: 'Test Coin',
        ownerId: owner.userId,
      },
    });
    entityIds.push(entity.id);
    return entity.id;
  }

  async function createPublishedReport(entityId: string): Promise<string> {
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
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'PUBLISHED', reason: 'ok' })
      .expect(200);
    return reportId;
  }

  it('forbids a user who is neither the entity owner nor a moderator from responding', async () => {
    const entityId = await createOwnedEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/responses`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ body: 'nice try' })
      .expect(403);
  });

  it('forbids responding to a report that is not PUBLISHED/DISPUTED', async () => {
    const entityId = await createOwnedEntity();
    const create = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't', body: 'b' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/reports/${create.body.id}/responses`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ body: 'too early' })
      .expect(403);
  });

  it('lets the matching entity owner respond, and moves the report to DISPUTED with an ENTITY history row', async () => {
    const entityId = await createOwnedEntity();
    const reportId = await createPublishedReport(entityId);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/responses`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ body: 'we dispute this', isDispute: true })
      .expect(201);

    const report = await app.get(PrismaService).report.findUnique({ where: { id: reportId } });
    expect(report?.status).toBe('DISPUTED');

    const history = await app.get(PrismaService).reportStatusHistory.findFirst({
      where: { reportId, toStatus: 'DISPUTED' },
    });
    expect(history?.actorType).toBe(StatusActorType.ENTITY);
    expect(history?.actorId).toBe(owner.userId);

    // The dispute must not hide the report or its responses from the public.
    await request(app.getHttpServer()).get(`/reports/${reportId}`).expect(200);
    const responses = await request(app.getHttpServer()).get(`/reports/${reportId}/responses`).expect(200);
    expect(responses.body).toHaveLength(1);
    expect(responses.body[0].disputed).toBe(true);
  });

  it("forbids an entity owner from responding to a report about an entity they don't own", async () => {
    const entityId = await createOwnedEntity();
    const reportId = await createPublishedReport(entityId);
    const otherOwner = await registerAndLogin(app, 'resp-other-owner');
    await setRole(app, otherOwner.userId, Role.ENTITY_OWNER);
    otherOwner.accessToken = await reLogin(app, otherOwner.email);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/responses`)
      .set('Authorization', `Bearer ${otherOwner.accessToken}`)
      .send({ body: 'not mine to answer' })
      .expect(403);

    await app.get(PrismaService).user.deleteMany({ where: { email: otherOwner.email } });
  });

  it('lets a moderator respond with isDispute and records a MODERATOR history row', async () => {
    const entityId = await createOwnedEntity();
    const reportId = await createPublishedReport(entityId);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/responses`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ body: 'flagged by staff', isDispute: true })
      .expect(201);

    const history = await app.get(PrismaService).reportStatusHistory.findFirst({
      where: { reportId, toStatus: 'DISPUTED' },
    });
    expect(history?.actorType).toBe(StatusActorType.MODERATOR);
  });

  it('lists responses publicly and recomputes entity stats', async () => {
    const entityId = await createOwnedEntity();
    const reportId = await createPublishedReport(entityId);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/responses`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ body: 'thanks for flagging' })
      .expect(201);

    const res = await request(app.getHttpServer()).get(`/reports/${reportId}/responses`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].body).toBe('thanks for flagging');

    const stats = await app.get(PrismaService).entityStats.findUnique({ where: { entityId } });
    expect(stats?.respondedReports).toBeGreaterThanOrEqual(1);
  });
});
