// Single global snapshot — one refresh job writes it for every published
// coin at once; nothing here is ever keyed per-visitor.
export const MARKET_CACHE_KEY = 'market:prices:v1';
export const MARKET_REFRESH_LOCK_KEY = 'market:refresh:lock';
