import { formatCompactUsd, formatPriceChangePercent, formatUsd } from './format';

describe('formatUsd', () => {
  it('uses more decimals for sub-$1 prices', () => {
    expect(formatUsd(0.000123, 'en-US')).toBe('$0.000123');
  });

  it('uses 2 decimals for prices >= $1', () => {
    expect(formatUsd(65000.4567, 'en-US')).toBe('$65,000.46');
  });

  it('falls back instead of throwing on an unknown locale', () => {
    expect(() => formatUsd(100, 'not-a-real-locale')).not.toThrow();
  });
});

describe('formatCompactUsd', () => {
  it('formats a large market cap compactly', () => {
    expect(formatCompactUsd(1_200_000_000, 'en-US')).toBe('$1.2B');
  });
});

describe('formatPriceChangePercent', () => {
  it('adds a + sign for positive change', () => {
    expect(formatPriceChangePercent(5, 'en-US')).toBe('+5%');
  });

  it('keeps the - sign for negative change', () => {
    expect(formatPriceChangePercent(-2.5, 'en-US')).toBe('-2.5%');
  });

  it('shows no sign for exactly zero change', () => {
    expect(formatPriceChangePercent(0, 'en-US')).toBe('0%');
  });
});
