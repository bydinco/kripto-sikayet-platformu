import type { HelmetOptions } from 'helmet';

export function buildHelmetOptions(nodeEnv: string | undefined, swaggerEnabled: boolean): HelmetOptions {
  return {
    // Evidence images are loaded cross-origin by <img> on the web app (a
    // different origin/port in prod too) — helmet's same-origin default
    // would make the browser refuse to render them.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // This API only ever serves JSON, except for Swagger UI's own HTML
    // page when enabled — which needs its inline scripts/styles, so CSP
    // has to be off specifically while Swagger is on.
    contentSecurityPolicy: swaggerEnabled ? false : undefined,
    // Only meaningful (and only sent) once actually served over HTTPS in
    // production; keep it off in dev/test, which run over plain http://.
    hsts: nodeEnv === 'production' ? undefined : false,
  };
}
