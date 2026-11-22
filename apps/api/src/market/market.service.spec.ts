import { ConfigService } from '@nestjs/config';
import { MarketService } from './market.service.js';
import { MARKET_CACHE_KEY } from './market.constants.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MarketCache } from './market-cache.js';

function buildPrismaMock() {
  return { coin: { findMany: vi.fn(), findFirst: vi.fn() } };
}

function buildCacheMock() {
  return { get: vi.fn() };
}

function buildConfig(staleThresholdMinutes = 15) {
  return { get: vi.fn(() => staleThresholdMinutes) } as unknown as ConfigService;
}

function freshSnapshot(entries: Record<string, unknown>, ageMs = 0) {
  return JSON.stringify({ updatedAt: new Date(Date.now() - ageMs).toISOString(), entries });
}

describe('MarketService.listPrices', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let cache: ReturnType<typeof buildCacheMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    cache = buildCacheMock();
  });

  function service() {
    return new MarketService(prisma as unknown as PrismaService, cache as unknown as MarketCache, buildConfig());
  }

  it('returns an empty list when nothing has been cached yet (e.g. no API key configured)', async () => {
    cache.get.mockResolvedValue(null);
    const result = await service().listPrices();
    expect(result).toEqual([]);
    expect(prisma.coin.findMany).not.toHaveBeenCalled();
  });

  it('only includes coins whose entity is ACTIVE (passed down via the Prisma where clause)', async () => {
    cache.get.mockResolvedValue(freshSnapshot({ bitcoin: { price: 65000, change24h: 1, marketCap: 1 } }));
    prisma.coin.findMany.mockResolvedValue([
      { coingeckoId: 'bitcoin', symbol: 'BTC', entity: { id: 'e1', slug: 'bitcoin' } },
    ]);

    await service().listPrices();

    const where = prisma.coin.findMany.mock.calls[0][0].where;
    expect(where.entity.status).toBe('ACTIVE');
  });

  it('caps take at the hard maximum regardless of what is requested', async () => {
    cache.get.mockResolvedValue(
      freshSnapshot(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`c${i}`, { price: 1, change24h: 0, marketCap: 0 }]))),
    );
    prisma.coin.findMany.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => ({ coingeckoId: `c${i}`, symbol: `S${i}`, entity: { id: `e${i}`, slug: `s${i}` } })),
    );

    const result = await service().listPrices(1000);
    expect(result.length).toBe(50);
  });

  it('omits a coin with no cached price data (no fabricated numbers)', async () => {
    cache.get.mockResolvedValue(freshSnapshot({}));
    prisma.coin.findMany.mockResolvedValue([
      { coingeckoId: 'bitcoin', symbol: 'BTC', entity: { id: 'e1', slug: 'bitcoin' } },
    ]);

    const result = await service().listPrices();
    expect(result).toEqual([]);
  });

  it('hides everything once the cached snapshot is older than the stale threshold', async () => {
    cache.get.mockResolvedValue(freshSnapshot({ bitcoin: { price: 65000, change24h: 1, marketCap: 1 } }, 20 * 60_000));
    prisma.coin.findMany.mockResolvedValue([
      { coingeckoId: 'bitcoin', symbol: 'BTC', entity: { id: 'e1', slug: 'bitcoin' } },
    ]);

    const result = await service().listPrices();
    expect(result).toEqual([]);
  });

  it('returns fresh data for a coin that has a cached price', async () => {
    cache.get.mockResolvedValue(freshSnapshot({ bitcoin: { price: 65000, change24h: 1.5, marketCap: 1_000_000 } }));
    prisma.coin.findMany.mockResolvedValue([
      { coingeckoId: 'bitcoin', symbol: 'BTC', entity: { id: 'e1', slug: 'bitcoin' } },
    ]);

    const result = await service().listPrices();
    expect(result).toEqual([
      { id: 'e1', slug: 'bitcoin', symbol: 'BTC', price: 65000, change24h: 1.5, marketCap: 1_000_000, updatedAt: expect.any(String), stale: false },
    ]);
  });
});

describe('MarketService.getPrice', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let cache: ReturnType<typeof buildCacheMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    cache = buildCacheMock();
  });

  function service() {
    return new MarketService(prisma as unknown as PrismaService, cache as unknown as MarketCache, buildConfig());
  }

  it('returns a null/stale shape (never throws, no 404) for an unknown slug', async () => {
    prisma.coin.findFirst.mockResolvedValue(null);
    const result = await service().getPrice('nonexistent');
    expect(result).toEqual({
      id: null,
      slug: 'nonexistent',
      symbol: null,
      price: null,
      change24h: null,
      marketCap: null,
      updatedAt: null,
      stale: true,
    });
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('returns stale:true with null fields when the cache has no entry for this coin', async () => {
    prisma.coin.findFirst.mockResolvedValue({ coingeckoId: 'bitcoin', symbol: 'BTC', entity: { id: 'e1', slug: 'bitcoin' } });
    cache.get.mockResolvedValue(freshSnapshot({}));

    const result = await service().getPrice('bitcoin');
    expect(result.price).toBeNull();
    expect(result.stale).toBe(true);
  });

  it('returns the price with stale:false when cached data is fresh', async () => {
    prisma.coin.findFirst.mockResolvedValue({ coingeckoId: 'bitcoin', symbol: 'BTC', entity: { id: 'e1', slug: 'bitcoin' } });
    cache.get.mockResolvedValue(freshSnapshot({ bitcoin: { price: 65000, change24h: 1, marketCap: 1 } }));

    const result = await service().getPrice('bitcoin');
    expect(result).toEqual({
      id: 'e1',
      slug: 'bitcoin',
      symbol: 'BTC',
      price: 65000,
      change24h: 1,
      marketCap: 1,
      updatedAt: expect.any(String),
      stale: false,
    });
  });

  it('marks the cache key used so Redis reads stay keyed consistently', async () => {
    prisma.coin.findFirst.mockResolvedValue({ coingeckoId: 'bitcoin', symbol: 'BTC', entity: { id: 'e1', slug: 'bitcoin' } });
    cache.get.mockResolvedValue(null);
    await service().getPrice('bitcoin');
    expect(cache.get).toHaveBeenCalledWith(MARKET_CACHE_KEY);
  });
});
