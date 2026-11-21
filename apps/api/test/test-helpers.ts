import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// The login/register/notices rate limiter is skipped when NODE_ENV=test
// (see ThrottlerModule.forRoot in app.module.ts) — e2e tests legitimately
// call those routes far more than a real client would in the same window.
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

export async function setRole(app: INestApplication, userId: string, role: Role): Promise<void> {
  await app.get(PrismaService).user.update({ where: { id: userId }, data: { role } });
}

export function extractCookie(setCookieHeader: string[] | string | undefined, name: string): string {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader ?? ''];
  const match = headers.map((h) => h.match(new RegExp(`${name}=([^;]+)`))).find(Boolean);
  if (!match) {
    throw new Error(`Cookie ${name} not found in Set-Cookie header`);
  }
  return `${name}=${match[1]}`;
}
