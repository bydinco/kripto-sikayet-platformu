import { hasSessionHint } from './auth-context';

// Stubs just enough of `document` for this DOM-free (node) test
// environment — hasSessionHint only ever reads document.cookie.
function setCookie(value: string) {
  (globalThis as { document?: { cookie: string } }).document = { cookie: value };
}

describe('hasSessionHint', () => {
  it('returns true when session_hint=1 is present', () => {
    setCookie('other=x; session_hint=1; another=y');
    expect(hasSessionHint()).toBe(true);
  });

  it('returns false when session_hint is absent', () => {
    setCookie('other=x; another=y');
    expect(hasSessionHint()).toBe(false);
  });

  it('returns false for an empty cookie string', () => {
    setCookie('');
    expect(hasSessionHint()).toBe(false);
  });

  it('does not match a cookie that merely contains the name as a substring', () => {
    setCookie('not_session_hint=1');
    expect(hasSessionHint()).toBe(false);
  });

  it('returns false instead of throwing when document is unavailable', () => {
    delete (globalThis as { document?: unknown }).document;
    expect(hasSessionHint()).toBe(false);
  });
});
