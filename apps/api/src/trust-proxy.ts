import type { NestExpressApplication } from '@nestjs/platform-express';

// 0 (default) = don't touch Express's "trust proxy" setting at all, so
// req.ip is always the actual TCP socket address — X-Forwarded-For can't
// be spoofed to dodge ThrottlerGuard's IP-based rate limiting, and dev/
// test behavior never changes. Set TRUST_PROXY_HOPS=1 in production when
// running behind a single reverse proxy (e.g. Nginx) so req.ip becomes
// the real client IP instead of the proxy's.
export function resolveTrustProxyHops(raw: string | undefined): number {
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function applyTrustProxy(app: NestExpressApplication, hops: number): void {
  if (hops > 0) {
    app.set('trust proxy', hops);
  }
}
