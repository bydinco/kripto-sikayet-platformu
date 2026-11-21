import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, setRole, uniqueEmail } from './test-helpers.js';

async function registerAndLogin(app: INestApplication, emailPrefix: string) {
  const email = uniqueEmail(emailPrefix);
  const password = 'supersecret123';
  const register = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, handle: `handle-${emailPrefix}-${Date.now()}` });
  const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  return { email, userId: register.body.id as string, accessToken: login.body.accessToken as string };
}

describe('Reports (e2e)', () => {
  let app: INestApplication<App>;
  let author: Awaited<ReturnType<typeof registerAndLogin>>;
  let stranger: Awaited<ReturnType<typeof registerAndLogin>>;
  let moderator: Awaited<ReturnType<typeof registerAndLogin>>;
  let entityId: string;

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'reports-author');
    stranger = await registerAndLogin(app, 'reports-stranger');
    moderator = await registerAndLogin(app, 'reports-mod');
    await setRole(app, moderator.userId, Role.MODERATOR);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: moderator.email, password: 'supersecret123' });
    moderator.accessToken = login.body.accessToken;

    const entity = await app.get(PrismaService).entity.create({
      data: { type: 'COIN', slug: `coin-${Date.now()}`, name: 'Test Coin' },
    });
    entityId = entity.id;
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.report.deleteMany({ where: { entityId } });
    await prisma.entity.delete({ where: { id: entityId } });
    await prisma.user.deleteMany({ where: { email: { in: [author.email, stranger.email, moderator.email] } } });
    await app.close();
  });

  it('requires login to create a report', async () => {
    await request(app.getHttpServer())
      .post('/reports')
      .send({ entityId, category: 'RUG_PULL', title: 'x', body: 'y' })
      .expect(401);
  });

  it('creates a report as the authenticated author (authorId taken from the token)', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 'Pending report', body: 'details' })
      .expect(201);

    expect(res.body.authorId).toBe(author.userId);
    expect(res.body.status).toBe('PENDING');
  });

  it("lets the author edit their own PENDING report, but not someone else's", async () => {
    const prisma = app.get(PrismaService);
    const report = await prisma.report.create({
      data: { entityId, authorId: author.userId, category: 'RUG_PULL', title: 'edit me', body: 'b' },
    });

    await request(app.getHttpServer())
      .patch(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ title: 'hijacked' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ title: 'edited by author' })
      .expect(200);
  });

  it('forbids the author from setting moderator-only fields', async () => {
    const prisma = app.get(PrismaService);
    const report = await prisma.report.create({
      data: { entityId, authorId: author.userId, category: 'RUG_PULL', title: 't', body: 'b' },
    });

    await request(app.getHttpServer())
      .patch(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(403);
  });

  it('forbids the author from editing a report that is no longer PENDING/NEEDS_EVIDENCE', async () => {
    const prisma = app.get(PrismaService);
    const report = await prisma.report.create({
      data: {
        entityId,
        authorId: author.userId,
        category: 'RUG_PULL',
        title: 't',
        body: 'b',
        status: 'PUBLISHED',
      },
    });

    await request(app.getHttpServer())
      .patch(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ title: 'too late' })
      .expect(403);
  });

  it('lets a moderator change any field, including status', async () => {
    const prisma = app.get(PrismaService);
    const report = await prisma.report.create({
      data: { entityId, authorId: author.userId, category: 'RUG_PULL', title: 't', body: 'b' },
    });

    const res = await request(app.getHttpServer())
      .patch(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);

    expect(res.body.status).toBe('PUBLISHED');
  });

  it('only lets moderator/admin delete a report', async () => {
    const prisma = app.get(PrismaService);
    const report = await prisma.report.create({
      data: { entityId, authorId: author.userId, category: 'RUG_PULL', title: 't', body: 'b' },
    });

    await request(app.getHttpServer())
      .delete(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
  });

  it('only lists PUBLISHED reports publicly', async () => {
    const prisma = app.get(PrismaService);
    await prisma.report.create({
      data: { entityId, authorId: author.userId, category: 'RUG_PULL', title: 'hidden', body: 'b' },
    });
    const published = await prisma.report.create({
      data: {
        entityId,
        authorId: author.userId,
        category: 'RUG_PULL',
        title: 'visible',
        body: 'b',
        status: 'PUBLISHED',
      },
    });

    const res = await request(app.getHttpServer()).get('/reports').expect(200);
    const ids = res.body.map((r: { id: string }) => r.id);
    expect(ids).toContain(published.id);
    expect(res.body.every((r: { status: string }) => r.status === 'PUBLISHED')).toBe(true);
  });
});
