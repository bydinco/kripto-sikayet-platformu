import { INestApplication } from '@nestjs/common';
import { Role, StatusActorType } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

describe('Resolution request/approve flow (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let moderator: TestUser;
  let owner: TestUser;
  let stranger: TestUser;
  const entityIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'res-author');
    moderator = await registerAndLogin(app, 'res-mod');
    owner = await registerAndLogin(app, 'res-owner');
    stranger = await registerAndLogin(app, 'res-stranger');
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
      data: { type: 'COIN', slug: `coin-res-${Date.now()}-${Math.random()}`, name: 'Test Coin', ownerId: owner.userId },
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

  it('forbids anyone but the matching entity owner from requesting resolution', async () => {
    const entityId = await createOwnedEntity();
    const reportId = await createPublishedReport(entityId);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/resolution-request`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/resolution-request`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(403);
  });

  it('forbids requesting resolution on a report that is not PUBLISHED/DISPUTED', async () => {
    const entityId = await createOwnedEntity();
    const create = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't', body: 'b' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/reports/${create.body.id}/resolution-request`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(403);
  });

  it('rejects approval with no pending request, and approval by anyone but the author', async () => {
    const entityId = await createOwnedEntity();
    const reportId = await createPublishedReport(entityId);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/resolution-approve`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/resolution-request`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/resolution-approve`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(403);
  });

  it('resolves the report once the author approves, recording an AUTHOR history row and updating stats', async () => {
    const entityId = await createOwnedEntity();
    const reportId = await createPublishedReport(entityId);

    await request(app.getHttpServer())
      .post(`/reports/${reportId}/resolution-request`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/reports/${reportId}/resolution-approve`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(200);

    expect(res.body.status).toBe('RESOLVED');
    expect(res.body.resolvedAt).not.toBeNull();
    expect(res.body.resolutionRequestedAt).toBeNull();

    const history = await app.get(PrismaService).reportStatusHistory.findFirst({
      where: { reportId, toStatus: 'RESOLVED' },
    });
    expect(history?.actorType).toBe(StatusActorType.AUTHOR);
    expect(history?.actorId).toBe(author.userId);

    const stats = await app.get(PrismaService).entityStats.findUnique({ where: { entityId } });
    expect(stats?.resolvedReports).toBeGreaterThanOrEqual(1);
  });
});
