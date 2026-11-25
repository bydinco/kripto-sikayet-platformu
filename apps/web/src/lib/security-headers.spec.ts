import { buildSecurityHeaders } from './security-headers';

function header(headers: ReturnType<typeof buildSecurityHeaders>, key: string) {
  return headers.find((h) => h.key === key);
}

describe('buildSecurityHeaders', () => {
  it('always sets nosniff, DENY, Referrer-Policy, and a restrictive Permissions-Policy', () => {
    const headers = buildSecurityHeaders('development', 'http://localhost:3001', false);
    expect(header(headers, 'X-Content-Type-Options')?.value).toBe('nosniff');
    expect(header(headers, 'X-Frame-Options')?.value).toBe('DENY');
    expect(header(headers, 'Referrer-Policy')?.value).toBe('strict-origin-when-cross-origin');
    expect(header(headers, 'Permissions-Policy')?.value).toContain('camera=()');
    expect(header(headers, 'Permissions-Policy')?.value).toContain('microphone=()');
    expect(header(headers, 'Permissions-Policy')?.value).toContain('geolocation=()');
  });

  it('omits Content-Security-Policy in development (next dev relies on eval for Fast Refresh)', () => {
    const headers = buildSecurityHeaders('development', 'http://localhost:3001', false);
    expect(header(headers, 'Content-Security-Policy')).toBeUndefined();
  });

  it('adds Content-Security-Policy in production, including the configured API origin', () => {
    const headers = buildSecurityHeaders('production', 'https://api.example.com', false);
    const csp = header(headers, 'Content-Security-Policy')?.value;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://api.example.com');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('omits Strict-Transport-Security when not served over HTTPS (local dev, smoke tests)', () => {
    const headers = buildSecurityHeaders('production', 'http://localhost:3001', false);
    expect(header(headers, 'Strict-Transport-Security')).toBeUndefined();
  });

  it('adds Strict-Transport-Security and upgrade-insecure-requests only when secureHttps is true', () => {
    const headers = buildSecurityHeaders('production', 'https://api.example.com', true);
    expect(header(headers, 'Strict-Transport-Security')?.value).toContain('max-age=');
    expect(header(headers, 'Content-Security-Policy')?.value).toContain('upgrade-insecure-requests');
  });

  it('adds Strict-Transport-Security even outside production if secureHttps is somehow set', () => {
    // Defensive: HSTS itself only depends on secureHttps, not NODE_ENV —
    // confirms the two gates are independent, not accidentally coupled.
    const headers = buildSecurityHeaders('development', 'http://localhost:3001', true);
    expect(header(headers, 'Strict-Transport-Security')).toBeDefined();
    expect(header(headers, 'Content-Security-Policy')).toBeUndefined();
  });
});
