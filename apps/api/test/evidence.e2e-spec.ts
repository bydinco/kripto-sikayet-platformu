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

describe('Evidence (e2e)', () => {
  let app: INestApplication<App>;
  let author: Awaited<ReturnType<typeof registerAndLogin>>;
  let stranger: Awaited<ReturnType<typeof registerAndLogin>>;
  let moderator: Awaited<ReturnType<typeof registerAndLogin>>;
  let entityId: string;
  let pendingReportId: string;
  let publishedReportId: string;
  let pendingEvidenceId: string;
  let publishedEvidenceId: string;

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'evidence-author');
    stranger = await registerAndLogin(app, 'evidence-stranger');
    moderator = await registerAndLogin(app, 'evidence-mod');
    await setRole(app, moderator.userId, Role.MODERATOR);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: moderator.email, password: 'supersecret123' });
    moderator.accessToken = login.body.accessToken;

    const prisma = app.get(PrismaService);
    const entity = await prisma.entity.create({
      data: { type: 'COIN', slug: `coin-ev-${Date.now()}`, name: 'Test Coin' },
    });
    entityId = entity.id;

    const pending = await prisma.report.create({
      data: { entityId, authorId: author.userId, category: 'RUG_PULL', title: 'pending', body: 'b' },
    });
    pendingReportId = pending.id;

    const published = await prisma.report.create({
      data: {
        entityId,
        authorId: author.userId,
        category: 'RUG_PULL',
        title: 'published',
        body: 'b',
        status: 'PUBLISHED',
      },
    });
    publishedReportId = published.id;

    const pendingEvidence = await prisma.evidence.create({
      data: { reportId: pendingReportId, type: 'LINK', value: 'https://example.com/pending' },
    });
    pendingEvidenceId = pendingEvidence.id;

    const publishedEvidence = await prisma.evidence.create({
      data: { reportId: publishedReportId, type: 'LINK', value: 'https://example.com/published' },
    });
    publishedEvidenceId = publishedEvidence.id;
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.evidence.deleteMany({ where: { reportId: { in: [pendingReportId, publishedReportId] } } });
    await prisma.report.deleteMany({ where: { entityId } });
    await prisma.entity.delete({ where: { id: entityId } });
    await prisma.user.deleteMany({ where: { email: { in: [author.email, stranger.email, moderator.email] } } });
    await app.close();
  });

  it('shows evidence on a PUBLISHED report to anonymous visitors', async () => {
    await request(app.getHttpServer()).get(`/evidence/${publishedEvidenceId}`).expect(200);
  });

  it('hides evidence on a non-PUBLISHED report from anonymous visitors', async () => {
    await request(app.getHttpServer()).get(`/evidence/${pendingEvidenceId}`).expect(403);
  });

  it('hides evidence on a non-PUBLISHED report from an unrelated logged-in user', async () => {
    await request(app.getHttpServer())
      .get(`/evidence/${pendingEvidenceId}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(403);
  });

  it("shows the report's own author the evidence on their non-PUBLISHED report", async () => {
    await request(app.getHttpServer())
      .get(`/evidence/${pendingEvidenceId}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(200);
  });

  it('shows a moderator evidence on any report regardless of status', async () => {
    await request(app.getHttpServer())
      .get(`/evidence/${pendingEvidenceId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
  });

  it.each(['not-a-url', 'javascript:alert(1)', 'ftp://example.com/file'])(
    'rejects a non-http(s) LINK value: %s',
    async (value) => {
      await request(app.getHttpServer())
        .post('/evidence')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ reportId: pendingReportId, type: 'LINK', value })
        .expect(400);
    },
  );

  it('accepts a valid http(s) LINK value', async () => {
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ reportId: pendingReportId, type: 'LINK', value: 'https://example.com/new-proof' })
      .expect(201);
  });

  it('does not require value to be a URL for non-LINK types', async () => {
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ reportId: pendingReportId, type: 'TX_HASH', value: '0xabc123' })
      .expect(201);
  });
});
