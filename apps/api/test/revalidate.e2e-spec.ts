import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerAndLogin, reLogin, setRole, TestUser } from './test-helpers.js';

const TEST_SECRET = 'e2e-revalidate-secret';

// RevalidateService reads REVALIDATE_SECRET from ConfigService, which
// snapshots process.env at ConfigModule.forRoot() — so this must be set
// BEFORE createTestApp(), and restored after, so it doesn't leak into
// later files in this sequential (fileParallelism:false) run.
describe('On-demand revalidation (e2e, mocked HTTP)', () => {
  let app: INestApplication<App>;
  let author: TestUser;
  let moderator: TestUser;
  let admin: TestUser;
  const entityIds: string[] = [];
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    process.env.REVALIDATE_SECRET = TEST_SECRET;
    app = await createTestApp();
    author = await registerAndLogin(app, 'revalidate-author');
    moderator = await registerAndLogin(app, 'revalidate-mod');
    admin = await registerAndLogin(app, 'revalidate-admin');
    await setRole(app, moderator.userId, Role.MODERATOR);
    await setRole(app, admin.userId, Role.ADMIN);
    moderator.accessToken = await reLogin(app, moderator.email);
    admin.accessToken = await reLogin(app, admin.email);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.reportStatusHistory.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.moderationLog.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.evidence.deleteMany({ where: { report: { entityId: { in: entityIds } } } });
    await prisma.report.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.notice.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [author.email, moderator.email, admin.email] } } });
    await app.close();
    delete process.env.REVALIDATE_SECRET;
  });

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function createEntity(): Promise<string> {
    const entity = await app.get(PrismaService).entity.create({
      data: { type: 'COIN', slug: `coin-revalidate-${Date.now()}-${Math.random()}`, name: 'Test Coin' },
    });
    entityIds.push(entity.id);
    return entity.id;
  }

  function revalidateCallsContaining(tag: string) {
    return fetchSpy.mock.calls.filter(([url, init]) => {
      if (!String(url).includes('/api/revalidate')) return false;
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      return (body.tags ?? []).includes(tag);
    });
  }

  it('calls the web revalidate endpoint with the right secret header when a report is REMOVED', async () => {
    const entityId = await createEntity();
    const create = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't', body: 'b' })
      .expect(201);
    const reportId = create.body.id as string;

    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ reportId, type: 'LINK', value: 'https://example.com/proof' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'PUBLISHED', reason: 'ok' })
      .expect(200);

    fetchSpy.mockClear(); // only assert on the REMOVED transition's own calls

    await request(app.getHttpServer())
      .patch(`/reports/${reportId}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REMOVED', reason: 'policy violation' })
      .expect(200);

    const reportCalls = revalidateCallsContaining(`report:${reportId}`);
    expect(reportCalls.length).toBeGreaterThan(0);

    const [url, init] = reportCalls[0];
    expect(String(url)).toContain('/api/revalidate');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-revalidate-secret')).toBe(TEST_SECRET);

    const body = JSON.parse(init?.body as string);
    expect(body.tags).toContain(`report:${reportId}`);
    expect(body.tags).toContain(`entity-id:${entityId}`);
    expect(body.tags).toContain('home');

    // recomputeScore (triggered by the same transition) fires its own,
    // separately-tagged call.
    expect(revalidateCallsContaining(`entity-id:${entityId}`).length).toBeGreaterThan(0);
  });

  it('never throws/breaks the transition when the web app is unreachable', async () => {
    fetchSpy.mockRejectedValue(new Error('connection refused'));
    const entityId = await createEntity();
    const create = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ entityId, category: 'RUG_PULL', title: 't', body: 'b' })
      .expect(201);

    // The transition itself must still succeed even though every
    // revalidate call rejects.
    await request(app.getHttpServer())
      .patch(`/reports/${create.body.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', reason: 'no merit' })
      .expect(200);
  });

  it('revalidates methodology/home/scoring tags on model activate', async () => {
    const model = await app.get(PrismaService).riskModel.create({
      data: { entityType: 'INVESTMENT_PLATFORM', version: 1 },
    });

    await request(app.getHttpServer())
      .patch(`/scoring/models/${model.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ active: true })
      .expect(200);

    const calls = revalidateCallsContaining('methodology');
    expect(calls.length).toBeGreaterThan(0);
    const body = JSON.parse(calls[0][1]?.body as string);
    expect(body.tags).toEqual(expect.arrayContaining(['methodology', 'home', 'scoring']));

    await app.get(PrismaService).riskModel.delete({ where: { id: model.id } });
  });

  it('resolves the slug for an entityId-only Notice and revalidates both entity:<slug> and entity-id:<id>', async () => {
    const entityId = await createEntity();
    const entity = await app.get(PrismaService).entity.findUniqueOrThrow({ where: { id: entityId } });

    const notice = await request(app.getHttpServer())
      .post('/notices')
      .send({
        type: 'REMOVAL_REQUEST',
        submitterName: 'Rights Holder',
        submitterEmail: 'rights@example.com',
        claim: 'Please remove this.',
        entityId,
      })
      .expect(201);

    fetchSpy.mockClear();

    await request(app.getHttpServer())
      .patch(`/notices/${notice.body.id}`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'ACCEPTED', decision: 'Reviewed.' })
      .expect(200);

    const slugCalls = revalidateCallsContaining(`entity:${entity.slug}`);
    expect(slugCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(slugCalls[0][1]?.body as string);
    expect(body.tags).toEqual(expect.arrayContaining([`entity-id:${entityId}`, `entity:${entity.slug}`]));
    // No reportId on this notice — must not fabricate a report: tag.
    expect(body.tags.some((t: string) => t.startsWith('report:'))).toBe(false);
  });
});
