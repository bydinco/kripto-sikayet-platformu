import { test, expect } from '../fixtures';
import { tr } from '../../apps/web/src/dictionaries/tr';

test('register creates an account and logs the user in', async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.goto('/tr/register');

  await page.getByLabel(tr.auth.handleLabel).fill(`smoke_${unique}`);
  await page.getByLabel(tr.auth.emailLabel).fill(`smoke-${unique}@example.com`);
  await page.getByLabel(tr.auth.passwordLabel).fill('SmokePass123!');
  await page.getByRole('button', { name: tr.auth.submitRegister }).click();

  // register() redirects to "/tr" on success; the header's authenticated-
  // only nav link is the real proof a session now exists.
  await expect(page).toHaveURL(/\/tr\/?$/);
  await expect(page.getByRole('link', { name: tr.nav.submitReport })).toBeVisible();
});

test('login signs in an existing (seeded) account', async ({ page }) => {
  await page.goto('/tr/login');

  await page.getByLabel(tr.auth.emailLabel).fill('demo-author@example.com');
  await page.getByLabel(tr.auth.passwordLabel).fill('DemoPass123!');
  await page.getByRole('button', { name: tr.auth.submitLogin }).click();

  await expect(page).toHaveURL(/\/tr\/?$/);
  await expect(page.getByRole('link', { name: tr.nav.submitReport })).toBeVisible();
});
