import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, extractCookie, uniqueEmail } from './test-helpers.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const email = uniqueEmail('auth');
  const password = 'supersecret123';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.get(PrismaService).user.deleteMany({ where: { email } });
    await app.close();
  });

  it('registers a new user without leaking passwordHash', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, handle: `handle-${Date.now()}` })
      .expect(201);

    expect(res.body.email).toBe(email);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.role).toBe('USER');
  });

  it('rejects a role field in the register body (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail('auth-role'), password, handle: `handle-${Date.now()}-b`, role: 'ADMIN' })
      .expect(400);
  });

  it('logs in with correct credentials and sets a refresh cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects wrong password and unknown email with the exact same message', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);

    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail('nobody'), password: 'whatever123' })
      .expect(401);

    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('rejects /auth/me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns the current user on /auth/me with a valid token', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(res.body.email).toBe(email);
  });

  it('rotates the refresh token', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    const firstCookie = extractCookie(login.headers['set-cookie'], 'refreshToken');

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = extractCookie(refreshed.headers['set-cookie'], 'refreshToken');

    expect(secondCookie).not.toBe(firstCookie);
  });

  it('treats an immediate reuse of a just-rotated token as a benign race (401, other session kept alive)', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    const firstCookie = extractCookie(login.headers['set-cookie'], 'refreshToken');

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = extractCookie(refreshed.headers['set-cookie'], 'refreshToken');

    // Reusing the just-revoked first token immediately (e.g. a second
    // browser tab) is within the grace window: it fails, but it must NOT
    // kill the session that came from the rotation.
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', firstCookie).expect(401);
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', secondCookie).expect(200);
  });

  it('treats reuse of a token revoked long ago as theft and kills every session', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    const firstCookie = extractCookie(login.headers['set-cookie'], 'refreshToken');

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = extractCookie(refreshed.headers['set-cookie'], 'refreshToken');

    // Simulate the revocation having happened well outside the grace window.
    const prisma = app.get(PrismaService);
    const firstToken = firstCookie.split('=')[1];
    const tokenHash = createHash('sha256').update(firstToken).digest('hex');
    await prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date(Date.now() - 15_000) },
    });

    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', firstCookie).expect(401);
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', secondCookie).expect(401);
  });

  it('logs out and revokes the refresh token', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    const cookie = extractCookie(login.headers['set-cookie'], 'refreshToken');

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie).expect(401);
  });
});
