import { test, expect } from '../fixtures';
import { tr } from '../../apps/web/src/dictionaries/tr';

test('home page loads, shows the hero and search, no console errors or failed requests', async ({ page }) => {
  await page.goto('/tr');

  await expect(page.getByRole('heading', { level: 1, name: tr.siteName })).toBeVisible();
  await expect(page.getByText(tr.home.heroEyebrow)).toBeVisible();
  await expect(page.getByPlaceholder(tr.home.searchPlaceholder)).toBeVisible();
});
