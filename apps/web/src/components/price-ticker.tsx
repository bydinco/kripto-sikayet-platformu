import Link from 'next/link';
import { apiFetch } from '../lib/api-client';
import type { ApiMarketPrice } from '../lib/api-models';
import type { Dictionary } from '../dictionaries/types';
import type { Locale } from '../lib/locale';
import { formatPriceChangePercent, formatUsd } from '../lib/format';

const TICKER_TAKE = 10;

// Server component, time-based ISR only (no on-demand revalidate tag — the
// price feed changes on its own clock, not in response to an app event).
// Never renders anything when the feature is off (no COINGECKO_API_KEY) or
// the API is unreachable — see CLAUDE.md's "Piyasa fiyat verisi" section.
async function getPrices(): Promise<ApiMarketPrice[]> {
  try {
    return await apiFetch<ApiMarketPrice[]>(`/market/prices?take=${TICKER_TAKE}`, { next: { revalidate: 120 } });
  } catch {
    return [];
  }
}

export async function PriceTicker({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const prices = await getPrices();
  if (prices.length === 0) return null;

  return (
    <div className="price-ticker">
      {/* Horizontal scroll is plain CSS (overflow-x) — no JS carousel. */}
      <div className="container price-ticker-inner">
        {prices.map((p) => (
          <Link key={p.id ?? p.slug} href={`/${locale}/entities/${p.slug}`} className="price-ticker-item">
            <span className="price-ticker-symbol">{p.symbol}</span>
            {p.price !== null ? <span className="numeric">{formatUsd(p.price, locale)}</span> : null}
            {p.change24h !== null ? (
              <span className={p.change24h >= 0 ? 'price-change-up' : 'price-change-down'}>
                {formatPriceChangePercent(p.change24h, locale)}
              </span>
            ) : null}
          </Link>
        ))}
        <a href="https://www.coingecko.com" target="_blank" rel="nofollow noopener noreferrer" className="muted price-ticker-attribution">
          {dictionary.market.attribution}
        </a>
      </div>
    </div>
  );
}
