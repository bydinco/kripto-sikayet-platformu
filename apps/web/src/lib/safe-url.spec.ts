import { isSafeHttpUrl } from './safe-url';

describe('isSafeHttpUrl', () => {
  it('accepts http URLs', () => {
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isSafeHttpUrl('https://example.com/path?query=1')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isSafeHttpUrl('not a url')).toBe(false);
  });
});
