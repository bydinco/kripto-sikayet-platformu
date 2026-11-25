import { test, expect } from '../fixtures';
import { tr } from '../../apps/web/src/dictionaries/tr';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe('mobile viewport (390px)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('home page loads with no horizontal overflow', async ({ page }) => {
    await page.goto('/tr');
    await expect(page.getByRole('heading', { level: 1, name: tr.siteName })).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });

  test('report form page loads with no horizontal overflow, logged in or not', async ({ page }) => {
    // Anonymous first — the form page shows a login prompt instead of the
    // actual fields (see report-form.tsx), which is itself a real layout
    // to check at this width.
    await page.goto('/tr/reports/new');
    await expect(page.getByText(tr.reportForm.loginRequired)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    // Then logged in, for the real form layout.
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.goto('/tr/register');
    await page.getByLabel(tr.auth.handleLabel).fill(`smoke_mob_${unique.replace(/[^a-z0-9]/gi, '')}`);
    await page.getByLabel(tr.auth.emailLabel).fill(`smoke-mobile-${unique}@example.com`);
    await page.getByLabel(tr.auth.passwordLabel).fill('SmokePass123!');
    await page.getByRole('button', { name: tr.auth.submitRegister }).click();
    await expect(page).toHaveURL(/\/tr\/?$/);

    await page.goto('/tr/reports/new');
    await expect(page.getByLabel(tr.reportForm.entityLabel)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
});
