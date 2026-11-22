import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MarketCache } from './market-cache.js';
import { MARKET_CACHE_KEY, MARKET_REFRESH_LOCK_KEY } from './market.constants.js';
import type { MarketSnapshot, MarketSnapshotEntry } from './market.service.js';

// CoinGecko's /coins/markets takes a comma-separated ids list on one query
// string — chunking keeps any single request well under practical URL
// length limits regardless of how many coins end up with a coingeckoId.
const COINGECKO_IDS_PER_BATCH = 200;
const DEFAULT_REFRESH_INTERVAL_SECONDS = 120;

interface CoinGeckoMarketRow {
  id: string;
  current_price: number | null;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
}

// The ONLY place that talks to CoinGecko. One timer per API instance, one
// HTTP call per batch, result shared via Redis — never a per-visitor
// request. CHECK COINGECKO'S PLAN/TERMS OF USE BEFORE RELYING ON THIS IN
// PRODUCTION (see CLAUDE.md's "Piyasa fiyat verisi" section); this was
// built against the free Demo API without that having been confirmed.
@Injectable()
export class MarketPriceRefreshService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketPriceRefreshService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: MarketCache,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    // No live timer under test: e2e/unit tests call refreshNow() directly
    // against mocked fetch, and a real interval here would otherwise keep
    // firing network calls across unrelated e2e files sharing one process
    // (vitest.config.e2e.ts runs them with fileParallelism:false).
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    if (!this.config.get<string>('COINGECKO_API_KEY')) return;

    const intervalMs = this.refreshIntervalMs();
    this.timer = setInterval(() => void this.refreshNow(), intervalMs);
    void this.refreshNow();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Never throws — a bad CoinGecko response or a Redis hiccup must never
  // affect anything else, same tolerance as RevalidateService /
  // safeRecomputeScore. Exported (rather than private) so tests can call it
  // directly instead of waiting on the interval.
  async refreshNow(): Promise<void> {
    const apiKey = this.config.get<string>('COINGECKO_API_KEY');
    if (!apiKey) return; // feature off — never fetch, never overwrite cache

    const locked = await this.cache.acquireLock(MARKET_REFRESH_LOCK_KEY, this.refreshIntervalMs());
    if (!locked) {
      this.logger.log('Piyasa fiyatı yenileme işi başka bir instance tarafında çalışıyor, atlanıyor.');
      return;
    }

    try {
      const coins = await this.prisma.coin.findMany({
        where: { coingeckoId: { not: null }, entity: { status: EntityStatus.ACTIVE } },
        select: { coingeckoId: true },
      });
      const ids = [...new Set(coins.map((c) => c.coingeckoId).filter((id): id is string => Boolean(id)))];
      if (ids.length === 0) return;

      const entries: Record<string, MarketSnapshotEntry> = {};
      for (let i = 0; i < ids.length; i += COINGECKO_IDS_PER_BATCH) {
        const batch = ids.slice(i, i + COINGECKO_IDS_PER_BATCH);
        const rows = await this.fetchBatch(batch, apiKey);
        if (rows === null) {
          // Request failed (429/network/bad response) — keep whatever is
          // already cached rather than overwrite it with a partial result.
          this.logger.warn('CoinGecko isteği başarısız, mevcut önbellek korunuyor.');
          return;
        }
        for (const row of rows) {
          entries[row.id] = {
            price: row.current_price ?? null,
            change24h: row.price_change_percentage_24h ?? null,
            marketCap: row.market_cap ?? null,
          };
        }
      }

      const snapshot: MarketSnapshot = { updatedAt: new Date().toISOString(), entries };
      await this.cache.set(MARKET_CACHE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      this.logger.error('Piyasa fiyatı yenileme işi hata verdi.', error instanceof Error ? error.stack : String(error));
    } finally {
      await this.cache.releaseLock(MARKET_REFRESH_LOCK_KEY);
    }
  }

  private refreshIntervalMs(): number {
    return (this.config.get<number>('MARKET_REFRESH_INTERVAL_SECONDS') ?? DEFAULT_REFRESH_INTERVAL_SECONDS) * 1000;
  }

  private async fetchBatch(ids: string[], apiKey: string): Promise<CoinGeckoMarketRow[] | null> {
    const baseUrl = this.config.get<string>('COINGECKO_BASE_URL') ?? 'https://api.coingecko.com/api/v3';
    const headerName = this.config.get<string>('COINGECKO_API_HEADER') ?? 'x-cg-demo-api-key';
    const url = `${baseUrl}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(','))}`;

    try {
      const res = await fetch(url, { headers: { [headerName]: apiKey } });
      if (!res.ok) {
        this.logger.warn(`CoinGecko ${res.status} döndü.`);
        return null;
      }
      return (await res.json()) as CoinGeckoMarketRow[];
    } catch (error) {
      this.logger.warn(`CoinGecko isteği atılamadı: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
