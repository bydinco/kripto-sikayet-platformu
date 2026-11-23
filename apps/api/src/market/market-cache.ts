import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

// Thin, failure-tolerant wrapper around the Redis client used to hold the
// single market-price snapshot and the refresh job's cross-instance lock.
// Every method swallows its own errors (logs and returns a safe default)
// instead of throwing, and the whole feature degrades to "no data" when
// REDIS_URL is unset — same never-break-the-main-flow philosophy as
// RevalidateService. See CLAUDE.md's "Piyasa fiyat verisi" section.
@Injectable()
export class MarketCache implements OnModuleDestroy {
  private readonly logger = new Logger(MarketCache.name);
  private readonly client: Redis | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    this.client = url ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
    this.client?.on('error', (error: Error) => this.logger.warn(`Redis bağlantı hatası: ${error.message}`));
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.warn(`Redis GET başarısız (${key}): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, value);
    } catch (error) {
      this.logger.warn(`Redis SET başarısız (${key}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Best-effort distributed lock (SET NX PX) — enough to stop two API
  // instances from both hitting CoinGecko on the same tick. Not a full
  // Redlock, and doesn't need to be for a once-every-couple-minutes job.
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.set(key, '1', 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(`Redis kilidi alınamadı (${key}): ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      // The lock also expires on its own via PX — a failed DEL is harmless.
    }
  }
}
