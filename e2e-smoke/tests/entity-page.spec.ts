import { test, expect } from '../fixtures';

// "demo-coin-a" comes from apps/api/prisma/seed.ts, loaded by the smoke
// suite's db:reset:test webServer step.
test('entity page renders the seeded entity', async ({ page }) => {
  await page.goto('/tr/entities/demo-coin-a');

  await expect(page.getByRole('heading', { level: 1, name: 'Demo Coin A' })).toBeVisible();
});
