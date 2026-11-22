import { assertTestDatabaseUrl } from './reset-test-db.js';

describe('assertTestDatabaseUrl', () => {
  it('accepts the dedicated test DB URL (port 5435, "_test" in the name)', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://postgres:postgres@localhost:5435/kripto_sikayet_test?schema=public'),
    ).not.toThrow();
  });

  it('rejects the dev DB URL (port 5434)', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://postgres:postgres@localhost:5434/kripto_sikayet?schema=public'),
    ).toThrow();
  });

  it('rejects the right port but no "_test" marker in the name', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://postgres:postgres@localhost:5435/kripto_sikayet?schema=public'),
    ).toThrow();
  });

  it('rejects a "_test"-named DB on the wrong port (e.g. dev DB renamed/aliased)', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://postgres:postgres@localhost:5434/kripto_sikayet_test?schema=public'),
    ).toThrow();
  });

  it('rejects undefined', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow();
  });

  it('rejects an unparseable URL', () => {
    expect(() => assertTestDatabaseUrl('not-a-url')).toThrow();
  });
});
