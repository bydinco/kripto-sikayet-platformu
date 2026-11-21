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

describe('Notices (e2e)', () => {
  let app: INestApplication<App>;
  let user: Awaited<ReturnType<typeof registerAndLogin>>;
  let moderator: Awaited<ReturnType<typeof registerAndLogin>>;
  let noticeId: string;

  beforeAll(async () => {
    app = await createTestApp();
    user = await registerAndLogin(app, 'notices-user');
    moderator = await registerAndLogin(app, 'notices-mod');
    await setRole(app, moderator.userId, Role.MODERATOR);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: moderator.email, password: 'supersecret123' });
    moderator.accessToken = login.body.accessToken;
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    if (noticeId) await prisma.notice.deleteMany({ where: { id: noticeId } });
    await prisma.user.deleteMany({ where: { email: { in: [user.email, moderator.email] } } });
    await app.close();
  });

  it('accepts a notice from an anonymous third party and returns only id+status', async () => {
    const res = await request(app.getHttpServer())
      .post('/notices')
      .send({
        type: 'COPYRIGHT',
        submitterName: 'Rights Holder',
        submitterEmail: 'rights@example.com',
        claim: 'This content infringes our copyright.',
      })
      .expect(201);

    expect(Object.keys(res.body).sort()).toEqual(['id', 'status']);
    noticeId = res.body.id;
  });

  it('requires login to list notices', async () => {
    await request(app.getHttpServer()).get('/notices').expect(401);
  });

  it('forbids a plain USER from listing notices', async () => {
    await request(app.getHttpServer())
      .get('/notices')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);
  });

  it('lets a moderator list notices', async () => {
    await request(app.getHttpServer())
      .get('/notices')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .expect(200);
  });
});
