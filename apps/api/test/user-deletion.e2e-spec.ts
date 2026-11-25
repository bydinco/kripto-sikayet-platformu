import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  extractCookie,
  registerAndLogin,
  reLogin,
  setRole,
  TEST_PASSWORD,
  TestUser,
} from './test-helpers.js';

describe('User deletion (soft delete + anonymization) (e2e)', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  const entityIds: string[] = [];
  const allEmails: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    admin = await registerAndLogin(app, 'del-admin');
    allEmails.push(admin.email);
    await setRole(app, admin.userId, Role.ADMIN);
    admin.accessToken = await reLogin(app, admin.email);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.auditLog.deleteMany({ where: { targetType: 'User' } });
    await prisma.reportComment.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.reportVote.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.report.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.user.deleteMany({ where: { email: { in: allEmails } } });
    await app.close();
  });

  async function createEntity() {
    const entity = await app.get(PrismaService).entity.create({
      data: { type: 'COIN', slug: `coin-del-${Date.now()}-${Math.random()}`, name: 'Test Coin' },
    });
    entityIds.push(entity.id);
    return entity.id;
  }

  it('401s DELETE /users/me with the wrong password, leaving the account untouched', async () => {
    const user = await registerAndLogin(app, 'del-wrongpw');
    allEmails.push(user.email);

    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ password: 'not-the-real-password' })
      .expect(401);

    const prisma = app.get(PrismaService);
    const stillThere = await prisma.user.findUnique({ where: { id: user.userId } });
    expect(stillThere?.deletedAt).toBeNull();
    expect(stillThere?.email).toBe(user.email);
  });

  it('self-deletion: makes login/refresh impossible, anonymizes email+handle, revokes refresh tokens, writes AuditLog USER_SELF_DELETE', async () => {
    const user = await registerAndLogin(app, 'del-self');
    allEmails.push(user.email);
    const originalEmail = user.email;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: originalEmail, password: TEST_PASSWORD })
      .expect(200);
    const refreshCookie = extractCookie(login.headers['set-cookie'], 'refreshToken');

    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ password: TEST_PASSWORD })
      .expect(200);

    // Login with the original credentials no longer works.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: originalEmail, password: TEST_PASSWORD })
      .expect(401);

    // The refresh token issued before deletion is now rejected too.
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', refreshCookie).expect(401);

    const prisma = app.get(PrismaService);
    const deleted = await prisma.user.findUnique({ where: { id: user.userId } });
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.email).not.toBe(originalEmail);
    expect(deleted?.email).toMatch(/^deleted-.*@deleted\.invalid$/);
    expect(deleted?.handle).toMatch(/^deleted-/);

    const log = await prisma.auditLog.findFirst({
      where: { targetType: 'User', targetId: user.userId, action: 'USER_SELF_DELETE' },
    });
    expect(log).toMatchObject({ actorId: user.userId });
    // The original email/handle must never be recorded in the audit metadata.
    expect(JSON.stringify(log?.metadata ?? {})).not.toContain(originalEmail);

    // The original e-mail is free again for a brand new registration.
    const reregister = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: originalEmail, password: 'BrandNewPass123!', handle: `reuse_${Date.now()}` })
      .expect(201);
    expect(reregister.body.email).toBe(originalEmail);
  });

  it("preserves the deleted user's reports/comments, now shown under their anonymized handle", async () => {
    const author = await registerAndLogin(app, 'del-author');
    const commenter = await registerAndLogin(app, 'del-commenter');
    allEmails.push(author.email, commenter.email);
    const entityId = await createEntity();

    const createReport = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 'still here', body: 'body text' })
      .expect(201);
    const reportId = createReport.body.id as string;
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ reportId, type: 'LINK', value: `https://example.com/${Date.now()}` });
    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'PUBLISHED', reason: 'ok' })
      .expect(200);

    const comment = await request(app.getHttpServer())
      .post(`/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ body: 'a comment that should outlive deletion' })
      .expect(201);

    // Delete the commenter's account.
    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ password: TEST_PASSWORD })
      .expect(200);

    const prisma = app.get(PrismaService);
    const anonymizedCommenter = await prisma.user.findUnique({ where: { id: commenter.userId } });

    // Report itself is untouched (still there, still PUBLISHED).
    const reportStillThere = await request(app.getHttpServer()).get(`/reports/${reportId}`).expect(200);
    expect(reportStillThere.body.status).toBe('PUBLISHED');

    // The comment is still there, now under the anonymized handle.
    const comments = await request(app.getHttpServer()).get(`/reports/${reportId}/comments`).expect(200);
    const found = comments.body.find((c: { id: string }) => c.id === comment.body.id);
    expect(found).toBeDefined();
    expect(found.author.handle).toBe(anonymizedCommenter?.handle);
  });

  it('ADMIN-initiated deletion: 404s a non-existent user, 200s a normal target, 409s the last ADMIN', async () => {
    await request(app.getHttpServer())
      .delete('/users/not-a-real-id')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);

    const normalTarget = await registerAndLogin(app, 'del-admin-target');
    allEmails.push(normalTarget.email);
    await request(app.getHttpServer())
      .delete(`/users/${normalTarget.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const prisma = app.get(PrismaService);
    const deletedTarget = await prisma.user.findUnique({ where: { id: normalTarget.userId } });
    expect(deletedTarget?.deletedAt).not.toBeNull();

    // Last-admin case: same stale-token construction as the role-
    // assignment e2e spec. Two throwaway ADMINs (X, Y) besides `admin`
    // (kept untouched for later tests in this file) — X deletes Y
    // (succeeds, X remains), then Y's stale token (captured before its
    // own deletion, still carrying role: ADMIN) attempts to delete X,
    // the system's one real remaining ADMIN of the pair... but `admin`
    // is ALSO still a real ADMIN throughout, so the global admin count
    // is actually 2 (admin, X) at that point — not 1. To isolate the
    // count to exactly X, `admin` is demoted first via X and restored
    // via X again afterwards.
    const adminX = await registerAndLogin(app, 'del-admin-x');
    const adminY = await registerAndLogin(app, 'del-admin-y');
    allEmails.push(adminX.email, adminY.email);
    await setRole(app, adminX.userId, Role.ADMIN);
    await setRole(app, adminY.userId, Role.ADMIN);
    adminX.accessToken = await reLogin(app, adminX.email);
    const staleAdminYToken = await reLogin(app, adminY.email);

    await request(app.getHttpServer())
      .patch(`/users/${admin.userId}/role`)
      .set('Authorization', `Bearer ${adminX.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(200);

    // Now adminX and adminY are the only two ADMINs. X deletes Y:
    // succeeds (X remains, not the last-admin case).
    await request(app.getHttpServer())
      .delete(`/users/${adminY.userId}`)
      .set('Authorization', `Bearer ${adminX.accessToken}`)
      .expect(200);

    // adminX is now the system's only ADMIN. adminY's stale token
    // (captured before its own deletion) still carries role: ADMIN —
    // attempting to delete adminX with it must 409.
    await request(app.getHttpServer())
      .delete(`/users/${adminX.userId}`)
      .set('Authorization', `Bearer ${staleAdminYToken}`)
      .expect(409);
    const stillAdminX = await prisma.user.findUnique({ where: { id: adminX.userId } });
    expect(stillAdminX?.deletedAt).toBeNull();

    // Restore `admin` back to ADMIN (via adminX, the only one left) for
    // any tests that run after this one.
    await request(app.getHttpServer())
      .patch(`/users/${admin.userId}/role`)
      .set('Authorization', `Bearer ${adminX.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);
    admin.accessToken = await reLogin(app, admin.email);
  });

  it('excludes soft-deleted users from GET /users (ADMIN listing)', async () => {
    const user = await registerAndLogin(app, 'del-listing');
    allEmails.push(user.email);
    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ password: TEST_PASSWORD })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(list.body.map((u: { id: string }) => u.id)).not.toContain(user.userId);
  });
});
