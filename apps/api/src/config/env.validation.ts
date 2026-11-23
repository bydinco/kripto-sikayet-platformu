import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().optional(),
  WEB_ORIGIN: Joi.string().uri().default('http://localhost:3002'),
  // Shared Domain= for the refreshToken and session_hint cookies. Empty =
  // host-only (fine when api/web share a hostname, e.g. localhost on
  // different ports — cookies ignore port). In production, where api/web
  // live on separate subdomains, set this to the shared parent domain (e.g.
  // "example.com") so session_hint, set by the API, is also readable by
  // document.cookie on the web app's own subdomain.
  COOKIE_DOMAIN: Joi.string().optional().allow(''),
  // Unset = on-demand revalidation is a no-op (RevalidateService logs and
  // returns instead of calling the web app). See CLAUDE.md.
  REVALIDATE_SECRET: Joi.string().optional().allow(''),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().positive().default(30),
  // CoinGecko price feed (see CLAUDE.md "Piyasa fiyat verisi" section).
  // Unset = the whole feature is off: the refresh job never runs and the
  // read endpoints just stay empty (no fabricated data, band/box hidden).
  COINGECKO_API_KEY: Joi.string().optional().allow(''),
  COINGECKO_API_HEADER: Joi.string().default('x-cg-demo-api-key'),
  COINGECKO_BASE_URL: Joi.string().uri().default('https://api.coingecko.com/api/v3'),
  MARKET_REFRESH_INTERVAL_SECONDS: Joi.number().integer().positive().default(120),
  MARKET_STALE_THRESHOLD_MINUTES: Joi.number().integer().positive().default(15),

  // Evidence file storage (see CLAUDE.md "Kanıt dosyası depolama"). "local"
  // writes under STORAGE_LOCAL_DIR (dev/test, outside the web app's public
  // folder); "s3" targets an S3-compatible bucket (Hetzner Object Storage,
  // R2) and requires the S3_* fields below.
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  STORAGE_LOCAL_DIR: Joi.string().default('./storage-local'),
  S3_ENDPOINT: Joi.string()
    .uri()
    .when('STORAGE_DRIVER', { is: 's3', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  S3_BUCKET: Joi.string().when('STORAGE_DRIVER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  S3_REGION: Joi.string().when('STORAGE_DRIVER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  S3_ACCESS_KEY_ID: Joi.string().when('STORAGE_DRIVER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  S3_SECRET_ACCESS_KEY: Joi.string().when('STORAGE_DRIVER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
});
