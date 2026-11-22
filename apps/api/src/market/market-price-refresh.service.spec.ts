import { ConfigService } from '@nestjs/config';
import { MarketPriceRefreshService } from './market-price-refresh.service.js';
import { MARKET_CACHE_KEY, MARKET_REFRESH_LOCK_KEY } from './market.constants.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MarketCache } from './market-cache.js';

function buildPrismaMock() {
  return { coin: { findMany: vi.fn() } };
}

function buildCacheMock() {
  return { get: vi.fn(), set: vi.fn(), acquireLock: vi.fn().mockResolvedValue(true), releaseLock: vi.fn() };
}

function buildConfig(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    COINGECKO_API_KEY: 'test-key',
    COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
    COINGECKO_API_HEADER: 'x-cg-demo-api-key',
    MARKET_REFRESH_INTERVAL_SECONDS: 120,
    ...overrides,
  };
  return { get: vi.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('MarketPriceRefreshService.refreshNow', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let cache: ReturnType<typeof buildCacheMock>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    cache = buildCacheMock();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  function service(config = buildConfig()) {
    return new MarketPriceRefreshService(prisma as unknown as PrismaService, cache as unknown as MarketCache, config);
  }

  it('does nothing when no API key is configured (feature off)', async () => {
    await service(buildConfig({ COINGECKO_API_KEY: '' })).refreshNow();
    expect(cache.acquireLock).not.toHaveBeenCalled();
    expect(prisma.coin.findMany).not.toHaveBeenCalled();
  });

  it('skips the run when another instance already holds the lock', async () => {
    cache.acquireLock.mockResolvedValue(false);
    await service().refreshNow();
    expect(prisma.coin.findMany).not.toHaveBeenCalled();
  });

  it('does nothing and releases nothing extra when there are no coingeckoId-mapped coins', async () => {
    prisma.coin.findMany.mockResolvedValue([]);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    await service().refreshNow();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.releaseLock).toHaveBeenCalledWith(MARKET_REFRESH_LOCK_KEY);
  });

  it('on success, writes a snapshot to Redis keyed by coingeckoId', async () => {
    prisma.coin.findMany.mockResolvedValue([{ coingeckoId: 'bitcoin' }, { coingeckoId: 'ethereum' }]);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 'bitcoin', current_price: 65000, price_change_percentage_24h: 1.5, market_cap: 1_000_000 },
          { id: 'ethereum', current_price: 3000, price_change_percentage_24h: -2.1, market_cap: 500_000 },
        ]),
        { status: 200 },
      ),
    );

    await service().refreshNow();

    expect(cache.set).toHaveBeenCalledTimes(1);
    const [key, value] = cache.set.mock.calls[0];
    expect(key).toBe(MARKET_CACHE_KEY);
    const snapshot = JSON.parse(value);
    expect(snapshot.entries.bitcoin).toEqual({ price: 65000, change24h: 1.5, marketCap: 1_000_000 });
    expect(snapshot.entries.ethereum).toEqual({ price: 3000, change24h: -2.1, marketCap: 500_000 });
    expect(cache.releaseLock).toHaveBeenCalledWith(MARKET_REFRESH_LOCK_KEY);
  });

  it('sends the configured API key header', async () => {
    prisma.coin.findMany.mockResolvedValue([{ coingeckoId: 'bitcoin' }]);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }));

    await service(buildConfig({ COINGECKO_API_HEADER: 'x-cg-pro-api-key', COINGECKO_API_KEY: 'secret-key' })).refreshNow();

    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('x-cg-pro-api-key')).toBe('secret-key');
  });

  it('on 429/error, keeps whatever was already cached instead of overwriting it', async () => {
    prisma.coin.findMany.mockResolvedValue([{ coingeckoId: 'bitcoin' }]);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 429 }));

    await service().refreshNow();

    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.releaseLock).toHaveBeenCalledWith(MARKET_REFRESH_LOCK_KEY);
  });

  it('on a network error, never throws and keeps the cache untouched', async () => {
    prisma.coin.findMany.mockResolvedValue([{ coingeckoId: 'bitcoin' }]);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(service().refreshNow()).resolves.toBeUndefined();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
