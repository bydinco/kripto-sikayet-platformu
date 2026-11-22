import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, uniqueEmail } from './test-helpers.js';

// Separate from auth.e2e-spec.ts because it needs its own Nest app instance
// built with COOKIE_DOMAIN set — ConfigModule reads process.env once per
// app, at construction time.
describe('Auth cookies with COOKIE_DOMAIN set (e2e)', () => {
  let app: INestApplication<App>;
  const email = uniqueEmail('cookie-domain');
  const password = 'supersecret123';
  const previousCookieDomain = process.env.COOKIE_DOMAIN;

  beforeAll(async () => {
    process.env.COOKIE_DOMAIN = 'example.com';
    app = await createTestApp();
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, handle: `handle-cd-${Date.now()}` });
  });

  afterAll(async () => {
    await app.get(PrismaService).user.deleteMany({ where: { email } });
    await app.close();
    if (previousCookieDomain === undefined) {
      delete process.env.COOKIE_DOMAIN;
    } else {
      process.env.COOKIE_DOMAIN = previousCookieDomain;
    }
  });

  it('stamps both refreshToken and session_hint with Domain=example.com', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);

    const cookies = res.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    const hintCookie = cookies.find((c) => c.startsWith('session_hint='));
    expect(refreshCookie).toContain('Domain=example.com');
    expect(hintCookie).toContain('Domain=example.com');
  });
});
