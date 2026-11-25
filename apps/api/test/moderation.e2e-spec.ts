import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

// Security audit fix: moderatorId used to be a client-supplied field on
// CreateModerationDto, and PATCH/DELETE existed with no ownership check
// at all — any MODERATOR could attribute a log entry to someone else, or
// edit/delete an existing one. moderatorId now always comes from the
// caller's own JWT, and PATCH/DELETE were removed outright (unused by
// the web app or any test, and an append-only audit log shouldn't be
// editable/removable in the first place). See CLAUDE.md.
describe('Moderation log authorship (e2e)', () => {
  let app: INestApplication<App>;
  let moderator: TestUser;
  let otherModerator: TestUser;
  const createdLogIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    moderator = await registerAndLogin(app, 'modlog-mod');
    otherModerator = await registerAndLogin(app, 'modlog-other');
    await setRole(app, moderator.userId, Role.MODERATOR);
    await setRole(app, otherModerator.userId, Role.MODERATOR);
    moderator.accessToken = await reLogin(app, moderator.email);
    otherModerator.accessToken = await reLogin(app, otherModerator.email);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.moderationLog.deleteMany({ where: { id: { in: createdLogIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [moderator.email, otherModerator.email] } } });
    await app.close();
  });

  it('400s a POST /moderation body that includes moderatorId (whitelist rejects unknown fields)', async () => {
    await request(app.getHttpServer())
      .post('/moderation')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ action: 'APPROVE', moderatorId: otherModerator.userId })
      .expect(400);
  });

  it('always records the caller as moderatorId, never a client-supplied identity', async () => {
    const res = await request(app.getHttpServer())
      .post('/moderation')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ action: 'APPROVE', reason: 'manual log entry' })
      .expect(201);
    createdLogIds.push(res.body.id);
    expect(res.body.moderatorId).toBe(moderator.userId);
    expect(res.body.moderatorId).not.toBe(otherModerator.userId);
  });

  it('no longer exposes PATCH or DELETE on /moderation/:id', async () => {
    const created = await request(app.getHttpServer())
      .post('/moderation')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ action: 'APPROVE', reason: 'to attempt tampering with' })
      .expect(201);
    createdLogIds.push(created.body.id);

    await request(app.getHttpServer())
      .patch(`/moderation/${created.body.id}`)
      .set('Authorization', `Bearer ${otherModerator.accessToken}`)
      .send({ reason: 'tampered' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/moderation/${created.body.id}`)
      .set('Authorization', `Bearer ${otherModerator.accessToken}`)
      .expect(404);

    // Untouched: still exists, with its original reason.
    const log = await app.get(PrismaService).moderationLog.findUnique({ where: { id: created.body.id } });
    expect(log?.reason).toBe('to attempt tampering with');
  });
});
