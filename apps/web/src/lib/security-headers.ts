export interface SecurityHeader {
  key: string;
  value: string;
}

// entity.logoUrl exists in the API response type but is never rendered as
// an <img> anywhere in this app (grepped src/ — zero matches), so img-src
// doesn't need to allow arbitrary https: hosts, just 'self' + data: + the
// API origin (evidence images, loaded via evidenceFileUrl()).
function buildCsp(apiOrigin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${apiOrigin}`,
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}

// - CSP only in a production build: `next dev` relies on eval() for Fast
//   Refresh, which a CSP without 'unsafe-eval' would break.
// - HSTS (and CSP's upgrade-insecure-requests, which isn't its own header)
//   only when secureHttps is true — local dev and the Playwright smoke
//   suite both run over plain http://, where HSTS would be meaningless at
//   best and actively wrong if ever cached by a browser testing against
//   http://localhost.
export function buildSecurityHeaders(nodeEnv: string | undefined, apiOrigin: string, secureHttps: boolean): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];

  if (nodeEnv === 'production') {
    const csp = secureHttps ? `${buildCsp(apiOrigin)}; upgrade-insecure-requests` : buildCsp(apiOrigin);
    headers.push({ key: 'Content-Security-Policy', value: csp });
  }

  if (secureHttps) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' });
  }

  return headers;
}
