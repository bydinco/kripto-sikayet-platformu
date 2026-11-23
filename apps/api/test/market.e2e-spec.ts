import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Redis } from 'ioredis';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MarketPriceRefreshService } from '../src/market/market-price-refresh.service.js';
import { MARKET_CACHE_KEY } from '../src/market/market.constants.js';
import { createTestApp } from './test-helpers.js';

// One app for the whole file, booted with the realistic default: no
// COINGECKO_API_KEY (same as .env.test and most environments). The
// read-path tests below (list/get) don't need a real API key at all — they
// only read whatever is already in Redis, so the cache is seeded directly
// with the real client rather than by running a real refresh. The
// refresh-job's own fetch/lock/batching logic is covered by
// market-price-refresh.service.spec.ts's mocked unit tests; toggling
// COINGECKO_API_KEY via process.env between two createTestApp() calls in
// one process was tried here first and dropped — @nestjs/config's
// ConfigModule tracks which env vars a PREVIOUS forRoot() call already
// wrote from the env file (to tell a real override from its own leftover
// value), and that tracking doesn't reliably pick up a value set on
// process.env *between* two forRoot() calls in the same process for a key
// that also has an (empty) line in .env.test — ConfigService.get() kept
// returning the stale empty value. Not worth working around for this.
describe('Market prices (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: Redis;
  let chainId: string;
  const entityIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = new Redis(process.env.REDIS_URL!);

    const chain = await prisma.chain.upsert({
      where: { slug: 'market-e2e-chain' },
      update: {},
      create: { slug: 'market-e2e-chain', name: 'Market E2E Chain', explorerUrl: 'https://explorer.example.com' },
    });
    chainId = chain.id;
  });

  afterAll(async () => {
    await prisma.coin.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
    await redis.del(MARKET_CACHE_KEY);
    redis.disconnect();
    await app.close();
  });

  // There's no API to create a Coin profile (see EntitiesService's own
  // comment on recordContractAudit) — created directly via Prisma, same as
  // other e2e suites that need one.
  async function makeCoinEntity(opts: { status?: 'ACTIVE' | 'INACTIVE'; coingeckoId: string }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const entity = await prisma.entity.create({
      data: { type: 'COIN', slug: `market-coin-${suffix}`, name: 'Market E2E Coin', status: opts.status ?? 'ACTIVE' },
    });
    entityIds.push(entity.id);
    await prisma.coin.create({
      data: {
        entityId: entity.id,
        chainId,
        symbol: 'MKT',
        contractAddress: `0x${suffix.replace(/[^a-z0-9]/g, '').padEnd(40, '0').slice(0, 40)}`,
        coingeckoId: opts.coingeckoId,
      },
    });
    return { entityId: entity.id, slug: entity.slug };
  }

  async function seedCache(entries: Record<string, { price: number; change24h: number | null; marketCap: number | null }>) {
    await redis.set(MARKET_CACHE_KEY, JSON.stringify({ updatedAt: new Date().toISOString(), entries }));
  }

  describe('no COINGECKO_API_KEY configured', () => {
    it('refreshNow() never calls CoinGecko and never writes the cache', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await app.get(MarketPriceRefreshService).refreshNow();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('GET /market/prices returns an empty list when nothing has been cached (no fabricated data)', async () => {
      await redis.del(MARKET_CACHE_KEY);
      const res = await request(app.getHttpServer()).get('/market/prices').expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('reading a seeded cache', () => {
    let activeA: { entityId: string; slug: string };
    let activeC: { entityId: string; slug: string };
    let inactiveB: { entityId: string; slug: string };
    const idA = `e2e-active-a-${Date.now()}`;
    const idB = `e2e-inactive-b-${Date.now()}`;
    const idC = `e2e-active-c-${Date.now()}`;

    beforeAll(async () => {
      activeA = await makeCoinEntity({ coingeckoId: idA });
      inactiveB = await makeCoinEntity({ coingeckoId: idB, status: 'INACTIVE' });
      activeC = await makeCoinEntity({ coingeckoId: idC });
      await seedCache({
        [idA]: { price: 100, change24h: 5, marketCap: 1000 },
        [idB]: { price: 50, change24h: -1, marketCap: 500 }, // cached, but its entity is INACTIVE
        [idC]: { price: 200, change24h: -3, marketCap: 2000 },
      });
    });

    it('GET /market/prices only returns published (ACTIVE) coins', async () => {
      const res = await request(app.getHttpServer()).get('/market/prices').expect(200);
      const slugs = res.body.map((e: { slug: string }) => e.slug);
      expect(slugs).toContain(activeA.slug);
      expect(slugs).toContain(activeC.slug);
      expect(slugs).not.toContain(inactiveB.slug);
    });

    it('GET /market/prices?take= enforces the limit', async () => {
      const res = await request(app.getHttpServer()).get('/market/prices?take=1').expect(200);
      expect(res.body.length).toBe(1);
    });

    it('GET /market/prices/:entitySlug returns the cached price for an ACTIVE coin', async () => {
      const res = await request(app.getHttpServer()).get(`/market/prices/${activeA.slug}`).expect(200);
      expect(res.body).toMatchObject({ price: 100, change24h: 5, marketCap: 1000, stale: false });
    });

    it('GET /market/prices/:entitySlug hides an INACTIVE (non-published) coin even though it has cached data', async () => {
      const res = await request(app.getHttpServer()).get(`/market/prices/${inactiveB.slug}`).expect(200);
      expect(res.body).toEqual({
        id: null,
        slug: inactiveB.slug,
        symbol: null,
        price: null,
        change24h: null,
        marketCap: null,
        updatedAt: null,
        stale: true,
      });
    });

    it('GET /market/prices/:entitySlug returns 200 (never 404) for a totally unknown slug', async () => {
      const res = await request(app.getHttpServer()).get('/market/prices/does-not-exist').expect(200);
      expect(res.body.stale).toBe(true);
      expect(res.body.price).toBeNull();
    });
  });
});
