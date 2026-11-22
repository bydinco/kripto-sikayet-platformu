import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, setRole, uniqueEmail } from './test-helpers.js';

async function registerAndLogin(app: INestApplication, emailPrefix: string) {
  const email = uniqueEmail(emailPrefix);
  const password = 'supersecret123';
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, handle: `handle-${emailPrefix}-${Date.now()}` });
  const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  return { email, userId: login.body.user.id as string, accessToken: login.body.accessToken as string };
}

describe('Scoring (e2e)', () => {
  let app: INestApplication<App>;
  let moderator: Awaited<ReturnType<typeof registerAndLogin>>;
  let admin: Awaited<ReturnType<typeof registerAndLogin>>;
  let entityId: string;
  let modelId: string;

  beforeAll(async () => {
    app = await createTestApp();
    moderator = await registerAndLogin(app, 'scoring-mod');
    admin = await registerAndLogin(app, 'scoring-admin');
    await setRole(app, moderator.userId, Role.MODERATOR);
    await setRole(app, admin.userId, Role.ADMIN);

    for (const u of [moderator, admin]) {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: u.email, password: 'supersecret123' });
      u.accessToken = login.body.accessToken;
    }

    const prisma = app.get(PrismaService);
    const entity = await prisma.entity.create({
      data: { type: 'COIN', slug: `coin-score-${Date.now()}`, name: 'Test Coin' },
    });
    entityId = entity.id;
    // A high, randomized version avoids colliding with the real seeded v1
    // COIN model (entityType+version is unique) on a dev DB that has run
    // `seed:dev`.
    const model = await prisma.riskModel.create({
      data: { entityType: 'COIN', version: 900_000 + Math.floor(Math.random() * 90_000) },
    });
    modelId = model.id;
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.riskScore.deleteMany({ where: { entityId } });
    await prisma.riskModel.delete({ where: { id: modelId } });
    await prisma.entity.delete({ where: { id: entityId } });
    await prisma.user.deleteMany({ where: { email: { in: [moderator.email, admin.email] } } });
    await app.close();
  });

  it('forbids a moderator from writing a risk score (ADMIN only)', async () => {
    await request(app.getHttpServer())
      .post('/scoring')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ entityId, modelId, score: 80, level: 'HIGH_RISK_SIGNAL' })
      .expect(403);
  });

  it('lets an admin write a risk score', async () => {
    await request(app.getHttpServer())
      .post('/scoring')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ entityId, modelId, score: 80, level: 'HIGH_RISK_SIGNAL' })
      .expect(201);
  });

  it('allows anonymous read access to scores', async () => {
    await request(app.getHttpServer()).get('/scoring').expect(200);
  });
});
