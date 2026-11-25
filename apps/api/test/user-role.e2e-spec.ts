import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, extractCookie, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

describe('Role assignment: PATCH /users/:id/role (e2e)', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let secondAdmin: TestUser;
  let moderator: TestUser;
  let plainUser: TestUser;
  const allEmails: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    admin = await registerAndLogin(app, 'role-admin');
    secondAdmin = await registerAndLogin(app, 'role-admin2');
    moderator = await registerAndLogin(app, 'role-mod');
    plainUser = await registerAndLogin(app, 'role-user');
    allEmails.push(admin.email, secondAdmin.email, moderator.email, plainUser.email);

    await setRole(app, admin.userId, Role.ADMIN);
    await setRole(app, secondAdmin.userId, Role.ADMIN);
    await setRole(app, moderator.userId, Role.MODERATOR);
    admin.accessToken = await reLogin(app, admin.email);
    secondAdmin.accessToken = await reLogin(app, secondAdmin.email);
    moderator.accessToken = await reLogin(app, moderator.email);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.auditLog.deleteMany({ where: { targetType: 'User', targetId: { in: [plainUser.userId, moderator.userId, secondAdmin.userId] } } });
    await prisma.user.deleteMany({ where: { email: { in: allEmails } } });
    await app.close();
  });

  it('403s a non-ADMIN caller', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${plainUser.userId}/role`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(403);
  });

  it('403s an ADMIN trying to change their own role', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${admin.userId}/role`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(403);
  });

  it('400s an unknown role value', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${plainUser.userId}/role`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'SUPERUSER' })
      .expect(400);
  });

  it('404s a non-existent target user', async () => {
    await request(app.getHttpServer())
      .patch('/users/not-a-real-id/role')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(404);
  });

  it('409s demoting the system\'s last ADMIN; demoting a non-last one succeeds', async () => {
    // Three throwaway ADMINs (A, B, C), independent of admin/secondAdmin
    // which later tests rely on keeping their original role.
    //
    // Only an ADMIN can call this endpoint, and an ADMIN can't change
    // their own role (checked above) — so the only way to ever present
    // "a caller demoting someone else's ADMIN role while exactly one
    // real ADMIN remains" is a caller whose access token still carries
    // role: ADMIN from before their own demotion (the JWT is never
    // re-checked against the DB — see CLAUDE.md). B's token, captured
    // right after login and never refreshed, is exactly that.
    const adminA = await registerAndLogin(app, 'role-admin-a');
    const adminB = await registerAndLogin(app, 'role-admin-b');
    const adminC = await registerAndLogin(app, 'role-admin-c');
    allEmails.push(adminA.email, adminB.email, adminC.email);
    await setRole(app, adminA.userId, Role.ADMIN);
    await setRole(app, adminB.userId, Role.ADMIN);
    await setRole(app, adminC.userId, Role.ADMIN);
    adminA.accessToken = await reLogin(app, adminA.email);
    adminB.accessToken = await reLogin(app, adminB.email); // captured now, used stale later
    adminC.accessToken = await reLogin(app, adminC.email);

    // This file's own fixtures (admin, secondAdmin) are ALSO real ADMINs
    // — demote them out of the way first, via adminA, so the count below
    // is scoped to exactly adminA/B/C. Restored at the end of this test.
    await request(app.getHttpServer())
      .patch(`/users/${admin.userId}/role`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/users/${secondAdmin.userId}/role`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(200);

    // A demotes C — three ADMINs (A, B, C) down to two (A, B): not the
    // last, succeeds.
    await request(app.getHttpServer())
      .patch(`/users/${adminC.userId}/role`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(200);

    // A demotes B — down to one (A): still not the last AT THE MOMENT
    // of this call (A + B both ADMIN when it runs), succeeds.
    await request(app.getHttpServer())
      .patch(`/users/${adminB.userId}/role`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(200);

    // A is now the system's only ADMIN. B's stale token (still carrying
    // role: ADMIN) attempts to demote A — this is the real 409 case.
    await request(app.getHttpServer())
      .patch(`/users/${adminA.userId}/role`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(409);

    // A is still ADMIN, confirming the 409 actually blocked the write.
    const prisma = app.get(PrismaService);
    const stillAdmin = await prisma.user.findUnique({ where: { id: adminA.userId } });
    expect(stillAdmin?.role).toBe('ADMIN');

    // Restore admin/secondAdmin back to ADMIN (via adminA, the only one
    // still ADMIN) for the remaining tests in this file.
    await request(app.getHttpServer())
      .patch(`/users/${admin.userId}/role`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/users/${secondAdmin.userId}/role`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);
    admin.accessToken = await reLogin(app, admin.email);
    secondAdmin.accessToken = await reLogin(app, secondAdmin.email);
  });

  it('on success: updates the role, revokes every existing refresh token, and writes an AuditLog USER_ROLE_SET entry', async () => {
    const target = await registerAndLogin(app, 'role-target');
    allEmails.push(target.email);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: target.email, password: 'supersecret123' })
      .expect(200);
    const oldRefreshCookie = extractCookie(login.headers['set-cookie'], 'refreshToken');

    const res = await request(app.getHttpServer())
      .patch(`/users/${target.userId}/role`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'MODERATOR' })
      .expect(200);
    expect(res.body.role).toBe('MODERATOR');
    expect(res.body.passwordHash).toBeUndefined();

    const prisma = app.get(PrismaService);
    const log = await prisma.auditLog.findFirst({
      where: { targetType: 'User', targetId: target.userId, action: 'USER_ROLE_SET' },
    });
    expect(log).toMatchObject({ actorId: admin.userId, metadata: { fromRole: 'USER', toRole: 'MODERATOR' } });

    // The refresh token issued before the role change is now revoked.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', oldRefreshCookie)
      .expect(401);
  });
});
