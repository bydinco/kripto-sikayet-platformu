import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import sharp from 'sharp';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

// Matches apps/api/.env.test's STORAGE_LOCAL_DIR — cleaned up in afterAll.
const STORAGE_DIR = resolve(process.cwd(), 'storage-local-test');

function getBinary(server: App, path: string, token?: string) {
  const req = request(server).get(path);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req.buffer().parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}

describe('Evidence file upload (e2e)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let stranger: TestUser;
  let moderator: TestUser;
  const entityIds: string[] = [];

  let pngBuffer: Buffer;
  let gpsJpegBuffer: Buffer;
  const fakeExeBuffer = Buffer.from(`MZ${'not-a-real-image'.repeat(20)}`);

  beforeAll(async () => {
    app = await createTestApp();
    author = await registerAndLogin(app, 'evfile-author');
    stranger = await registerAndLogin(app, 'evfile-stranger');
    moderator = await registerAndLogin(app, 'evfile-mod');
    await setRole(app, moderator.userId, Role.MODERATOR);
    moderator.accessToken = await reLogin(app, moderator.email);

    // This suite creates many reports for the same author across many
    // tests without resolving them — bypass the new-account open-report
    // cap (3, see ReportsService) the same way evidence-approval.e2e-spec
    // does.
    await app.get(PrismaService).user.update({
      where: { id: author.userId },
      data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });

    pngBuffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();
    gpsJpegBuffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'green' } })
      .jpeg()
      .withExif({ IFD0: { Make: 'TestCam' }, IFD3: { GPSLatitude: '41/1,0/1,0/1', GPSLatitudeRef: 'N' } })
      .toBuffer();
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.moderationLog.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.reportStatusHistory.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.evidence.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.report.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [author.email, stranger.email, moderator.email] } } });
    await rm(STORAGE_DIR, { recursive: true, force: true });
    await app.close();
  });

  async function createEntity(): Promise<string> {
    const entity = await app
      .get(PrismaService)
      .entity.create({ data: { type: 'COIN', slug: `coin-evfile-${Date.now()}-${Math.random()}`, name: 'Test Coin' } });
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

  function uploadFile(reportId: string, token: string, buffer: Buffer, filename = 'evidence.png') {
    return request(app.getHttpServer())
      .post(`/reports/${reportId}/evidence/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, filename);
  }

  it('accepts a real PNG and stores a server-generated storageKey, never the filename', async () => {
    const reportId = await createPendingReport(await createEntity());
    const res = await uploadFile(reportId, author.accessToken, pngBuffer, 'my secret report.png').expect(201);
    expect(res.body.type).toBe('SCREENSHOT');
    expect(res.body.mimeType).toBe('image/png');
    expect(res.body.storageKey).toMatch(/^evidence\/[0-9a-f-]+\.png$/);
    expect(res.body.storageKey).not.toContain('secret');
  });

  it('rejects content that is not actually an allowed image type, even with a .png filename/field', async () => {
    const reportId = await createPendingReport(await createEntity());
    await uploadFile(reportId, author.accessToken, fakeExeBuffer, 'totally-a.png').expect(400);
  });

  it('rejects a file over the 5MB limit', async () => {
    const reportId = await createPendingReport(await createEntity());
    const oversized = Buffer.concat([pngBuffer, Buffer.alloc(6 * 1024 * 1024)]);
    // multer's LIMIT_FILE_SIZE is translated by Nest into a built-in
    // PayloadTooLargeException (413), not something this feature maps itself.
    await uploadFile(reportId, author.accessToken, oversized).expect(413);
  });

  it('rejects the 6th file on the same report', async () => {
    const reportId = await createPendingReport(await createEntity());
    for (let i = 0; i < 5; i++) {
      await uploadFile(reportId, author.accessToken, pngBuffer).expect(201);
    }
    await uploadFile(reportId, author.accessToken, pngBuffer).expect(400);
  });

  it('rejects a non-author uploader', async () => {
    const reportId = await createPendingReport(await createEntity());
    await uploadFile(reportId, stranger.accessToken, pngBuffer).expect(403);
  });

  it('rejects upload once the report has left PENDING/NEEDS_EVIDENCE', async () => {
    const reportId = await createPendingReport(await createEntity());
    await uploadFile(reportId, author.accessToken, pngBuffer).expect(201);
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'PUBLISHED', reason: 'ok' })
      .expect(200);
    await uploadFile(reportId, author.accessToken, pngBuffer).expect(403);
  });

  it('strips EXIF/GPS metadata from the stored file', async () => {
    const reportId = await createPendingReport(await createEntity());
    const uploaded = await uploadFile(reportId, author.accessToken, gpsJpegBuffer, 'gps.jpg').expect(201);

    const original = await sharp(gpsJpegBuffer).metadata();
    expect(original.exif).toBeDefined();

    const fileRes = await getBinary(
      app.getHttpServer(),
      `/evidence/${uploaded.body.id}/file`,
      author.accessToken,
    ).expect(200);
    const storedMeta = await sharp(fileRes.body as Buffer).metadata();
    expect(storedMeta.exif).toBeUndefined();
  });

  it('cleans up the author file evidence from storage on delete', async () => {
    const reportId = await createPendingReport(await createEntity());
    const uploaded = await uploadFile(reportId, author.accessToken, pngBuffer).expect(201);
    const storageKey = uploaded.body.storageKey as string;
    const relativePath = storageKey.split('/')[1];

    await request(app.getHttpServer())
      .delete(`/evidence/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(200);

    const files = await readdir(resolve(STORAGE_DIR, 'evidence')).catch(() => [] as string[]);
    expect(files).not.toContain(relativePath);
  });

  it("does not allow the author to delete their file evidence once it's no longer PENDING/NEEDS_EVIDENCE", async () => {
    const reportId = await createPendingReport(await createEntity());
    const uploaded = await uploadFile(reportId, author.accessToken, pngBuffer).expect(201);
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'PUBLISHED', reason: 'ok' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/evidence/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/evidence/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
  });

  describe('GET /evidence/:id/file authorization matrix', () => {
    it('404s anonymous/stranger for unapproved evidence, 200s for author and moderator (and audit-logs the moderator view)', async () => {
      const reportId = await createPendingReport(await createEntity());
      const uploaded = await uploadFile(reportId, author.accessToken, pngBuffer).expect(201);
      const evidenceId = uploaded.body.id as string;

      // Force it unapproved to exercise the gated path (file evidence is
      // approved by default while PENDING — a moderator can still revoke).
      await request(app.getHttpServer())
        .patch(`/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ approved: false })
        .expect(200);

      await request(app.getHttpServer()).get(`/evidence/${evidenceId}/file`).expect(404);
      await request(app.getHttpServer())
        .get(`/evidence/${evidenceId}/file`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);
      await getBinary(app.getHttpServer(), `/evidence/${evidenceId}/file`, author.accessToken).expect(200);
      await getBinary(app.getHttpServer(), `/evidence/${evidenceId}/file`, moderator.accessToken).expect(200);

      const log = await app
        .get(PrismaService)
        .moderationLog.findFirst({ where: { reportId, moderatorId: moderator.userId, action: 'VIEW_EVIDENCE' } });
      expect(log).toBeTruthy();
    });

    it('200s anonymous for approved evidence on a publicly visible report, with a short public Cache-Control', async () => {
      const reportId = await createPendingReport(await createEntity());
      const uploaded = await uploadFile(reportId, author.accessToken, pngBuffer).expect(201);
      await request(app.getHttpServer())
        .patch(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ status: 'PUBLISHED', reason: 'ok' })
        .expect(200);

      const res = await getBinary(app.getHttpServer(), `/evidence/${uploaded.body.id}/file`).expect(200);
      // Must stay short — a downstream cache/browser should never keep
      // serving a 200 for long after the report could go REMOVED or the
      // evidence unapproved. No `immutable`, no long max-age.
      const cacheControl = res.headers['cache-control'] as string;
      expect(cacheControl).toMatch(/^public, max-age=\d+$/);
      const maxAge = Number(cacheControl.match(/max-age=(\d+)/)![1]);
      expect(maxAge).toBeGreaterThan(0);
      expect(maxAge).toBeLessThanOrEqual(300);
      expect(cacheControl).not.toContain('immutable');
    });

    it('sends Cache-Control: no-store for a non-public file (e.g. the author viewing their own pre-publication upload)', async () => {
      const reportId = await createPendingReport(await createEntity());
      const uploaded = await uploadFile(reportId, author.accessToken, pngBuffer).expect(201);
      const res = await getBinary(
        app.getHttpServer(),
        `/evidence/${uploaded.body.id}/file`,
        author.accessToken,
      ).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('flips from 200 to 404 for anonymous the instant the report is REMOVED — no app-level caching delay', async () => {
      const reportId = await createPendingReport(await createEntity());
      const uploaded = await uploadFile(reportId, author.accessToken, pngBuffer).expect(201);
      await request(app.getHttpServer())
        .patch(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ status: 'PUBLISHED', reason: 'ok' })
        .expect(200);

      // Proves the flip is live, not "was always 404": confirm 200 first.
      await getBinary(app.getHttpServer(), `/evidence/${uploaded.body.id}/file`).expect(200);

      await request(app.getHttpServer())
        .patch(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ status: 'REMOVED', reason: 'takedown' })
        .expect(200);

      await request(app.getHttpServer()).get(`/evidence/${uploaded.body.id}/file`).expect(404);
    });
  });
});
