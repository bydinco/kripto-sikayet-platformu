// No dedicated translation table for every enum (e.g. Entity.type) — this
// turns "DEFI_PROTOCOL" into "Defi protocol" as a reasonable fallback.
export function humanizeEnum(value: string): string {
  const lower = value.toLowerCase().replaceAll('_', ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatPercent(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(0)}%`;
}

export function formatHours(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  if (n < 24) return `${n.toFixed(1)}h`;
  return `${(n / 24).toFixed(1)}d`;
}

// Suggestion only — the field stays editable, and the API is the one that
// enforces uniqueness (409 on conflict).
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatDate(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}

// Sub-$1 coins lose all meaningful precision at 2 decimals — give them more.
export function formatUsd(value: number, locale: string): string {
  try {
    const maximumFractionDigits = Math.abs(value) < 1 ? 6 : 2;
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits }).format(value);
  } catch {
    return `$${value}`;
  }
}

// Market cap — compact notation ($1.2B) instead of a long digit string.
export function formatCompactUsd(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(
      value,
    );
  } catch {
    return `$${value}`;
  }
}

// CoinGecko's change24h is already a percentage number (5 means 5%, not
// 0.05) — Intl's percent style wants a fraction, hence the /100.
export function formatPriceChangePercent(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(value / 100);
  } catch {
    return `${value > 0 ? '+' : ''}${value}%`;
  }
}
