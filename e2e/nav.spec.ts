import { test, expect } from '@playwright/test';

// Smoke coverage for the core workflow spine (Map -> Encode -> Evolution ->
// Decode). This is deliberately shallow: it proves the app boots in a real
// browser and each tab mounts its panel, not that any feature's logic is
// correct (that's covered by the pure-logic/store/component phases). See
// docs/internal/TESTING.md Phase 6.

// The onboarding showcase auto-opens on a first-ever visit; mark it seen so
// nav tests exercise the app directly. Onboarding has its own test below.
const markOnboardingSeen = (page: import('@playwright/test').Page) =>
  page.addInitScript(() => localStorage.setItem('cs-onboarding-seen', '1'));

test('boots with Encode as the default mode', async ({ page }) => {
  await markOnboardingSeen(page);
  await page.goto('/');
  await expect(page.getByText('Upload or capture a photo')).toBeVisible();
  // Active tab renders in ink-900 (#24221C) under the drafting theme
  await expect(page.getByRole('button', { name: 'Encode' })).toHaveCSS('color', 'rgb(36, 34, 28)');
});

test('each nav tab mounts its panel', async ({ page }) => {
  await markOnboardingSeen(page);
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

test('onboarding shows on first visit, steps through, and stays dismissed', async ({ page }) => {
  // Fresh browser context, no seen-flag: a genuine first visit
  await page.goto('/');

  const dialog = page.getByRole('dialog', { name: 'Cuboid Studio introduction' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('One vocabulary, measurable culture')).toBeVisible();

  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Meet the real site')).toBeVisible();

  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(dialog).not.toBeVisible();

  // Dismissal persists across reloads
  await page.reload();
  await expect(page.getByText('Upload or capture a photo')).toBeVisible();
  await expect(dialog).not.toBeVisible();

  // And it reopens from the TopBar help button
  await page.getByRole('button', { name: 'Show introduction' }).click();
  await expect(dialog).toBeVisible();
});

test('guided tour launches from onboarding, drives the tabs, and can be exited', async ({ page }) => {
  await page.goto('/');

  const intro = page.getByRole('dialog', { name: 'Cuboid Studio introduction' });
  await expect(intro).toBeVisible();
  await intro.getByRole('button', { name: 'Guided tour', exact: true }).click();
  await expect(intro).not.toBeVisible();

  const tour = page.getByRole('dialog', { name: 'Guided tour' });
  await expect(tour).toBeVisible();
  await expect(tour.getByText('Four stages, one pipeline')).toBeVisible();

  // Advancing to step 2 switches the app itself to the Map tab
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour.getByText('Map — meet the real site')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Map' })).toHaveCSS('color', 'rgb(36, 34, 28)');

  // Escape ends the tour and returns control to the app
  await page.keyboard.press('Escape');
  await expect(tour).not.toBeVisible();
});
