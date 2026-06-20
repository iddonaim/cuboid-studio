import { test, expect } from '@playwright/test';

// Smoke coverage for the core workflow spine (Map -> Encode -> Evolution ->
// Decode). This is deliberately shallow: it proves the app boots in a real
// browser and each tab mounts its panel, not that any feature's logic is
// correct (that's covered by the pure-logic/store/component phases). See
// docs/internal/TESTING.md Phase 6.

test('boots with Encode as the default mode', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Upload or capture a photo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Encode' })).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('each nav tab mounts its panel', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Map' }).click();
  await expect(page.locator('iframe[title="Map context analysis"]')).toBeAttached();

  await page.getByRole('button', { name: 'Evolution' }).click();
  await expect(page.getByRole('button', { name: 'Evolve' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pataphysical' })).toBeVisible();

  await page.getByRole('button', { name: 'Decode' }).click();
  await expect(page.getByText('Freestyle', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Encode' }).click();
  await expect(page.getByText('Upload or capture a photo')).toBeVisible();
});
