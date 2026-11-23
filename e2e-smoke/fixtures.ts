import { test as base, expect, type Page } from '@playwright/test';

// Attaches the "fail on console error / unexpected 4xx-5xx" listeners to
// any page — the default `test.page` fixture below uses this for the
// fixture-managed page; specs that open extra BrowserContexts (a second
// logged-in user, an anonymous visitor) call this directly on their own
// pages too (see tests/report-flow.spec.ts) so the same rule applies there.
//
// The one deliberately-expected 4xx in this suite (an anonymous visitor
// hitting an unapproved evidence file) is checked with `request.get(...)`
// directly, never via page navigation/resource loading — so it never
// passes through this listener and never needs an allowlist here.
export function watchPage(page: Page): () => void {
  const consoleErrors: string[] = [];
  const badResponses: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  return function assertClean() {
    expect(consoleErrors, `Console errors on ${page.url()}`).toHaveLength(0);
    expect(badResponses, `Unexpected 4xx/5xx responses on ${page.url()}`).toHaveLength(0);
  };
}

// Every spec imports {test, expect} from here instead of '@playwright/test'
// directly — this is what makes the rule above apply uniformly to the
// default `page` fixture without each spec wiring it up itself.
export const test = base.extend({
  page: async ({ page }, use) => {
    const assertClean = watchPage(page);
    await use(page);
    assertClean();
  },
});

export { expect };
