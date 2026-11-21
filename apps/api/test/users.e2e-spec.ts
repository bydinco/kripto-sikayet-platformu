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

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let userA: Awaited<ReturnType<typeof registerAndLogin>>;
  let userB: Awaited<ReturnType<typeof registerAndLogin>>;
  let admin: Awaited<ReturnType<typeof registerAndLogin>>;

  beforeAll(async () => {
    app = await createTestApp();
    userA = await registerAndLogin(app, 'users-a');
    userB = await registerAndLogin(app, 'users-b');
    admin = await registerAndLogin(app, 'users-admin');
    await setRole(app, admin.userId, Role.ADMIN);
    // role changed after the token was issued; log in again for a fresh one
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: admin.email, password: 'supersecret123' });
    admin.accessToken = login.body.accessToken;
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email, admin.email] } } });
    await app.close();
  });

  it('forbids a non-admin from listing all users', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(403);
  });

  it('allows an admin to list all users', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
  });

  it('allows a user to read their own profile', async () => {
    const res = await request(app.getHttpServer())
      .get(`/users/${userA.userId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(res.body.id).toBe(userA.userId);
  });

  it('forbids a user from reading someone else\'s profile', async () => {
    await request(app.getHttpServer())
      .get(`/users/${userB.userId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(403);
  });
});
