import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { buildHelmetOptions } from '../src/security-headers.js';

export const TEST_PASSWORD = 'supersecret123';

// The login/register/notices rate limiter is skipped when NODE_ENV=test
// (see ThrottlerModule.forRoot in app.module.ts) — e2e tests legitimately
// call those routes far more than a real client would in the same window.
// Mirrors main.ts's bootstrap() (helmet + cookieParser + ValidationPipe),
// which this helper builds independently of rather than calling — so
// e2e tests exercise the same middleware stack main.ts does.
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  app.use(helmet(buildHelmetOptions(process.env.NODE_ENV, false)));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useBodyParser('json', { limit: '100kb' });
  await app.init();
  return app;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

export async function setRole(app: INestApplication, userId: string, role: Role): Promise<void> {
  await app.get(PrismaService).user.update({ where: { id: userId }, data: { role } });
}

export interface TestUser {
  email: string;
  userId: string;
  accessToken: string;
}

export async function registerAndLogin(app: INestApplication, emailPrefix: string): Promise<TestUser> {
  const email = uniqueEmail(emailPrefix);
  const register = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: TEST_PASSWORD, handle: `handle-${emailPrefix}-${Date.now()}` });
  const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: TEST_PASSWORD });
  return { email, userId: register.body.id as string, accessToken: login.body.accessToken as string };
}

// Role is embedded in the JWT, so a role change made directly in the DB
// (via setRole) only takes effect once the user logs in again.
export async function reLogin(app: INestApplication, email: string): Promise<string> {
  const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: TEST_PASSWORD });
  return login.body.accessToken as string;
}

export function extractCookie(setCookieHeader: string[] | string | undefined, name: string): string {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader ?? ''];
  const match = headers.map((h) => h.match(new RegExp(`${name}=([^;]+)`))).find(Boolean);
  if (!match) {
    throw new Error(`Cookie ${name} not found in Set-Cookie header`);
  }
  return `${name}=${match[1]}`;
}
