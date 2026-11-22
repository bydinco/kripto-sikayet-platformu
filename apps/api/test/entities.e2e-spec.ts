import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

describe('Entities catalog panel (e2e)', () => {
  let app: INestApplication<App>;
  let editor: TestUser;
  let admin: TestUser;
  let plainUser: TestUser;
  const entityIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    editor = await registerAndLogin(app, 'ent-editor');
    admin = await registerAndLogin(app, 'ent-admin');
    plainUser = await registerAndLogin(app, 'ent-user');
    await setRole(app, editor.userId, Role.EDITOR);
    await setRole(app, admin.userId, Role.ADMIN);
    editor.accessToken = await reLogin(app, editor.email);
    admin.accessToken = await reLogin(app, admin.email);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.entityLink.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [editor.email, admin.email, plainUser.email] } } });
    await app.close();
  });

  async function createEntity(token: string, slugSuffix: string) {
    const res = await request(app.getHttpServer())
      .post('/entities')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'COIN', slug: `coin-${slugSuffix}-${Date.now()}`, name: 'Test Coin' })
      .expect(201);
    entityIds.push(res.body.id);
    return res.body.id as string;
  }

  it('forbids a plain USER from creating an entity', async () => {
    await request(app.getHttpServer())
      .post('/entities')
      .set('Authorization', `Bearer ${plainUser.accessToken}`)
      .send({ type: 'COIN', slug: `coin-forbidden-${Date.now()}`, name: 'x' })
      .expect(403);
  });

  it('returns a clear conflict error on a duplicate slug instead of a raw 500', async () => {
    const slug = `coin-dup-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/entities')
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ type: 'COIN', slug, name: 'First' })
      .expect(201)
      .then((res) => entityIds.push(res.body.id));

    await request(app.getHttpServer())
      .post('/entities')
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ type: 'COIN', slug, name: 'Second' })
      .expect(409);
  });

  it('forbids an EDITOR from setting `verified`, but allows ADMIN', async () => {
    const entityId = await createEntity(editor.accessToken, 'verify');

    await request(app.getHttpServer())
      .patch(`/entities/${entityId}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ verified: true })
      .expect(403);

    const res = await request(app.getHttpServer())
      .patch(`/entities/${entityId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ verified: true })
      .expect(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.verifiedAt).not.toBeNull();

    const unset = await request(app.getHttpServer())
      .patch(`/entities/${entityId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ verified: false })
      .expect(200);
    expect(unset.body.verified).toBe(false);
    expect(unset.body.verifiedAt).toBeNull();
  });

  it('lets EDITOR still update non-verified fields', async () => {
    const entityId = await createEntity(editor.accessToken, 'editfields');
    const res = await request(app.getHttpServer())
      .patch(`/entities/${entityId}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ summary: 'updated summary' })
      .expect(200);
    expect(res.body.summary).toBe('updated summary');
  });

  it.each(['javascript:alert(1)', 'not-a-url', 'ftp://example.com'])(
    'rejects a non-http(s) EntityLink.url: %s',
    async (url) => {
      const entityId = await createEntity(editor.accessToken, 'linkbad');
      await request(app.getHttpServer())
        .post(`/entities/${entityId}/links`)
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .send({ kind: 'WEBSITE', url })
        .expect(400);
    },
  );

  it('creates and deletes an EntityLink with a valid http(s) url', async () => {
    const entityId = await createEntity(editor.accessToken, 'linkgood');
    const create = await request(app.getHttpServer())
      .post(`/entities/${entityId}/links`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ kind: 'WEBSITE', url: 'https://example.com' })
      .expect(201);

    const detail = await request(app.getHttpServer()).get(`/entities/${entityId}`).expect(200);
    expect(detail.body.links.map((l: { id: string }) => l.id)).toContain(create.body.id);

    await request(app.getHttpServer())
      .delete(`/entities/${entityId}/links/${create.body.id}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .expect(200);
  });

  it('filters GET /entities by type, and rejects an invalid type with 400', async () => {
    const coinId = await createEntity(editor.accessToken, 'typefilter-coin');
    const res = await request(app.getHttpServer()).get('/entities?type=COIN').expect(200);
    expect(res.body.map((e: { id: string }) => e.id)).toContain(coinId);
    expect(res.body.every((e: { type: string }) => e.type === 'COIN')).toBe(true);

    await request(app.getHttpServer()).get('/entities?type=NOT_A_TYPE').expect(400);
  });

  it('404s deleting a link that does not belong to the given entity', async () => {
    const entityIdA = await createEntity(editor.accessToken, 'linkcross-a');
    const entityIdB = await createEntity(editor.accessToken, 'linkcross-b');
    const link = await request(app.getHttpServer())
      .post(`/entities/${entityIdA}/links`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ kind: 'WEBSITE', url: 'https://example.com/a' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/entities/${entityIdB}/links/${link.body.id}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .expect(404);
  });
});
