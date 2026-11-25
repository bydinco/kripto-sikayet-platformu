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
    await prisma.auditLog.deleteMany({ where: { targetType: 'Entity', targetId: { in: entityIds } } });
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

  it('writes an AuditLog ENTITY_EDIT entry (before/after) for a field edit, but not for a no-op update', async () => {
    const entityId = await createEntity(editor.accessToken, 'auditedit');
    await request(app.getHttpServer())
      .patch(`/entities/${entityId}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ summary: 'first summary' })
      .expect(200);

    const prisma = app.get(PrismaService);
    const logs = await prisma.auditLog.findMany({ where: { targetType: 'Entity', targetId: entityId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('ENTITY_EDIT');
    expect(logs[0].actorId).toBe(editor.userId);
    expect(logs[0].metadata).toMatchObject({
      changedFields: { summary: { from: null, to: 'first summary' } },
    });

    // Sending the exact same value again is a no-op — no new log row.
    await request(app.getHttpServer())
      .patch(`/entities/${entityId}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ summary: 'first summary' })
      .expect(200);
    const logsAfterNoop = await prisma.auditLog.findMany({ where: { targetType: 'Entity', targetId: entityId } });
    expect(logsAfterNoop).toHaveLength(1);
  });

  it('writes an AuditLog ENTITY_EDIT entry for adding and for removing a link', async () => {
    const entityId = await createEntity(editor.accessToken, 'auditlink');
    const created = await request(app.getHttpServer())
      .post(`/entities/${entityId}/links`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ kind: 'WEBSITE', url: 'https://example.com/audited' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/entities/${entityId}/links/${created.body.id}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .expect(200);

    const prisma = app.get(PrismaService);
    const logs = await prisma.auditLog.findMany({
      where: { targetType: 'Entity', targetId: entityId },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs).toHaveLength(2);
    expect(logs[0].metadata).toMatchObject({ linkAdded: { kind: 'WEBSITE', url: 'https://example.com/audited' } });
    expect(logs[1].metadata).toMatchObject({ linkRemoved: { kind: 'WEBSITE', url: 'https://example.com/audited' } });
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

  it('excludes MERGED entities from the public list, but still resolves them directly by id', async () => {
    const prisma = app.get(PrismaService);
    const target = await prisma.entity.create({
      data: { type: 'COIN', slug: `coin-mergetarget-${Date.now()}`, name: 'Merge Target' },
    });
    const merged = await prisma.entity.create({
      data: {
        type: 'COIN',
        slug: `coin-merged-${Date.now()}`,
        name: 'Merged Away Coin',
        status: 'MERGED',
        mergedIntoId: target.id,
      },
    });
    entityIds.push(target.id, merged.id);

    const list = await request(app.getHttpServer())
      .get(`/entities?q=${encodeURIComponent('Merged Away Coin')}`)
      .expect(200);
    expect(list.body.map((e: { id: string }) => e.id)).not.toContain(merged.id);

    // Direct navigation by id still resolves it (e.g. an old bookmarked link).
    await request(app.getHttpServer()).get(`/entities/${merged.id}`).expect(200);
  });

  it('enforces a pagination cap on GET /entities regardless of the requested take', async () => {
    const res = await request(app.getHttpServer()).get('/entities?take=100000').expect(200);
    expect(res.body.length).toBeLessThanOrEqual(50);
  });

  it('never returns ContractAudit.raw (arbitrary third-party payload) on the public entity detail', async () => {
    const prisma = app.get(PrismaService);
    const chain = await prisma.chain.upsert({
      where: { slug: 'test-chain-entities-audit' },
      update: {},
      create: { slug: 'test-chain-entities-audit', name: 'Test Chain', explorerUrl: 'https://example.com' },
    });
    const entity = await prisma.entity.create({
      data: { type: 'COIN', slug: `coin-rawcheck-${Date.now()}`, name: 'Raw Check Coin' },
    });
    entityIds.push(entity.id);
    const coin = await prisma.coin.create({
      data: { entityId: entity.id, chainId: chain.id, symbol: 'RAW', contractAddress: `0xraw${entity.id}` },
    });
    await prisma.contractAudit.create({
      data: { coinId: coin.id, isHoneypot: false, raw: { internal: 'should-not-leak', apiKey: 'sk-fake-123' } },
    });

    const res = await request(app.getHttpServer()).get(`/entities/${entity.id}`).expect(200);
    const audit = res.body.coin.audits[0];
    expect(audit).toBeDefined();
    expect(audit.isHoneypot).toBe(false);
    expect(audit).not.toHaveProperty('raw');
  });

  it('PATCH /entities/:id with coingeckoId updates the Coin row when one exists', async () => {
    const prisma = app.get(PrismaService);
    const chain = await prisma.chain.upsert({
      where: { slug: 'test-chain-entities-coingecko' },
      update: {},
      create: { slug: 'test-chain-entities-coingecko', name: 'Test Chain', explorerUrl: 'https://example.com' },
    });
    const entity = await prisma.entity.create({
      data: { type: 'COIN', slug: `coin-coingecko-${Date.now()}`, name: 'Coingecko Check Coin' },
    });
    entityIds.push(entity.id);
    await prisma.coin.create({
      data: { entityId: entity.id, chainId: chain.id, symbol: 'CGC', contractAddress: `0xcgc${entity.id}` },
    });

    const res = await request(app.getHttpServer())
      .patch(`/entities/${entity.id}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ coingeckoId: 'bitcoin' })
      .expect(200);
    expect(res.body.coin.coingeckoId).toBe('bitcoin');

    // Empty string clears it.
    const cleared = await request(app.getHttpServer())
      .patch(`/entities/${entity.id}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ coingeckoId: '' })
      .expect(200);
    expect(cleared.body.coin.coingeckoId).toBeNull();
  });

  it('PATCH /entities/:id with coingeckoId silently no-ops when the entity has no Coin profile', async () => {
    const entityId = await createEntity(editor.accessToken, 'coingecko-nocoin');
    const res = await request(app.getHttpServer())
      .patch(`/entities/${entityId}`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ coingeckoId: 'bitcoin' })
      .expect(200);
    expect(res.body.coin).toBeNull();
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
