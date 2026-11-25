import { envValidationSchema } from './env.validation.js';

const STRONG_SECRET = 'xK9mQ2pL7vR4nT8wY1zA5bC3dE6fG0hJ';

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: STRONG_SECRET,
    ...overrides,
  };
}

describe('envValidationSchema — JWT_ACCESS_SECRET', () => {
  it('rejects a secret shorter than 32 characters', () => {
    const { error } = envValidationSchema.validate(baseEnv({ JWT_ACCESS_SECRET: 'a'.repeat(31) }));
    expect(error).toBeDefined();
  });

  it('accepts a secret of exactly 32 characters', () => {
    const { error } = envValidationSchema.validate(baseEnv({ JWT_ACCESS_SECRET: 'x'.repeat(31) + 'Q' }));
    expect(error).toBeUndefined();
  });

  it('rejects a known-weak value in production (contains "change-me")', () => {
    const { error } = envValidationSchema.validate(
      baseEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: `change-me-${'x'.repeat(25)}` }),
    );
    expect(error).toBeDefined();
  });

  it('rejects a secret containing "secret" in production even if long enough', () => {
    const { error } = envValidationSchema.validate(
      baseEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: `my-super-secret-value-${'x'.repeat(10)}` }),
    );
    expect(error).toBeDefined();
  });

  it('rejects a single character repeated in production', () => {
    const { error } = envValidationSchema.validate(baseEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(40) }));
    expect(error).toBeDefined();
  });

  it('accepts a long, non-placeholder-looking secret in production (with WEB_ORIGIN/COOKIE_DOMAIN also set)', () => {
    const { error } = envValidationSchema.validate(
      baseEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: STRONG_SECRET,
        WEB_ORIGIN: 'https://app.example.com',
        COOKIE_DOMAIN: 'example.com',
      }),
    );
    expect(error).toBeUndefined();
  });

  it('accepts the same weak-looking-by-name value in development (e.g. .env.test\'s own secret)', () => {
    const { error } = envValidationSchema.validate(
      baseEnv({ NODE_ENV: 'test', JWT_ACCESS_SECRET: 'test-only-secret-do-not-use-in-prod-0123456789ab' }),
    );
    expect(error).toBeUndefined();
  });
});

describe('envValidationSchema — WEB_ORIGIN / COOKIE_DOMAIN in production', () => {
  it('defaults WEB_ORIGIN to localhost and allows COOKIE_DOMAIN unset outside production', () => {
    const { error, value } = envValidationSchema.validate(baseEnv());
    expect(error).toBeUndefined();
    expect(value.WEB_ORIGIN).toBe('http://localhost:3002');
  });

  it('rejects production with neither WEB_ORIGIN nor COOKIE_DOMAIN set', () => {
    const { error } = envValidationSchema.validate(baseEnv({ NODE_ENV: 'production' }));
    expect(error).toBeDefined();
  });

  it('rejects production with WEB_ORIGIN set but COOKIE_DOMAIN missing', () => {
    const { error } = envValidationSchema.validate(
      baseEnv({ NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example.com' }),
    );
    expect(error).toBeDefined();
  });

  it('rejects production with an empty-string COOKIE_DOMAIN', () => {
    const { error } = envValidationSchema.validate(
      baseEnv({ NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example.com', COOKIE_DOMAIN: '' }),
    );
    expect(error).toBeDefined();
  });

  it('accepts production with both WEB_ORIGIN and a non-empty COOKIE_DOMAIN set', () => {
    const { error } = envValidationSchema.validate(
      baseEnv({ NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example.com', COOKIE_DOMAIN: 'example.com' }),
    );
    expect(error).toBeUndefined();
  });
});
