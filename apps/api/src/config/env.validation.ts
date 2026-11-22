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
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().positive().default(30),
});
