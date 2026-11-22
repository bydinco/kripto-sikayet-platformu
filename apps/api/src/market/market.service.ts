import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MarketCache } from './market-cache.js';
import { MARKET_CACHE_KEY } from './market.constants.js';

export interface MarketSnapshotEntry {
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
}

// Keyed by CoinGecko id — one JSON blob, written whole by the refresh job.
export interface MarketSnapshot {
  updatedAt: string; // ISO, set when the refresh job last wrote successfully
  entries: Record<string, MarketSnapshotEntry>;
}

export interface MarketPriceEntry {
  id: string | null;
  slug: string;
  symbol: string | null;
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  updatedAt: string | null;
  stale: boolean;
}

const DEFAULT_TAKE = 10;
const MAX_TAKE = 50;
const DEFAULT_STALE_THRESHOLD_MINUTES = 15;

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: MarketCache,
    private readonly config: ConfigService,
  ) {}

  // Public — no API key configured, Redis unreachable, or nothing refreshed
  // yet all collapse to the same "no data" result here, never a thrown
  // error and never fabricated numbers.
  async listPrices(take?: number): Promise<MarketPriceEntry[]> {
    const safeTake = Number.isFinite(take) && take! > 0 ? Math.min(take!, MAX_TAKE) : DEFAULT_TAKE;

    const snapshot = await this.readSnapshot();
    if (!snapshot || this.isStale(snapshot)) return [];

    const coins = await this.prisma.coin.findMany({
      where: { coingeckoId: { not: null }, entity: { status: EntityStatus.ACTIVE } },
      select: { coingeckoId: true, symbol: true, entity: { select: { id: true, slug: true } } },
    });

    const entries: MarketPriceEntry[] = [];
    for (const coin of coins) {
      const data = coin.coingeckoId ? snapshot.entries[coin.coingeckoId] : undefined;
      if (!data || data.price === null) continue; // no fresh price for this coin — omit, don't fabricate

      entries.push({
        id: coin.entity.id,
        slug: coin.entity.slug,
        symbol: coin.symbol,
        price: data.price,
        change24h: data.change24h,
        marketCap: data.marketCap,
        updatedAt: snapshot.updatedAt,
        stale: false,
      });
      if (entries.length >= safeTake) break;
    }
    return entries;
  }

  // Public — always 200, never 404: an unknown slug, a non-COIN entity, a
  // COIN with no coingeckoId, or no cached data yet all come back as the
  // same null-fields/stale:true shape, so the web box can just hide itself.
  async getPrice(entitySlug: string): Promise<MarketPriceEntry> {
    const coin = await this.prisma.coin.findFirst({
      where: { coingeckoId: { not: null }, entity: { slug: entitySlug, status: EntityStatus.ACTIVE } },
      select: { coingeckoId: true, symbol: true, entity: { select: { id: true, slug: true } } },
    });
    if (!coin) {
      return { id: null, slug: entitySlug, symbol: null, price: null, change24h: null, marketCap: null, updatedAt: null, stale: true };
    }

    const snapshot = await this.readSnapshot();
    const stale = !snapshot || this.isStale(snapshot);
    const data = !stale && coin.coingeckoId ? snapshot!.entries[coin.coingeckoId] : undefined;
    const hasPrice = data !== undefined && data.price !== null;

    return {
      id: coin.entity.id,
      slug: coin.entity.slug,
      symbol: coin.symbol,
      price: hasPrice ? data!.price : null,
      change24h: hasPrice ? data!.change24h : null,
      marketCap: hasPrice ? data!.marketCap : null,
      updatedAt: hasPrice ? snapshot!.updatedAt : null,
      stale: stale || !hasPrice,
    };
  }

  private async readSnapshot(): Promise<MarketSnapshot | null> {
    const raw = await this.cache.get(MARKET_CACHE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MarketSnapshot;
    } catch {
      return null;
    }
  }

  private isStale(snapshot: MarketSnapshot): boolean {
    const thresholdMinutes = this.config.get<number>('MARKET_STALE_THRESHOLD_MINUTES') ?? DEFAULT_STALE_THRESHOLD_MINUTES;
    return Date.now() - new Date(snapshot.updatedAt).getTime() > thresholdMinutes * 60_000;
  }
}
