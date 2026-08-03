import { test, expect } from '@playwright/test';

// Regression cover for the iPad cut-off bug: the app's desktop layout (which
// tablets get — useIsMobile only switches below 640px) was sized to 100vh.
// On iOS, 100vh means "the viewport with the browser chrome hidden", so the
// layout ran off the bottom of the screen behind Safari's / Chrome's toolbar
// and everything anchored to the bottom edge — the sidebar's lower rows, the
// help pill, the view gizmo, the map iframe — became unreachable.
//
// Chromium on a desktop runner cannot reproduce the iOS gap (there vh and dvh
// are equal), so this file guards the fix from two sides: the measure itself
// must stay dynamic, and nothing may paint below the visible viewport.

const IPAD_LANDSCAPE = { width: 1194, height: 834 };

const markOnboardingSeen = (page: import('@playwright/test').Page) =>
  page.addInitScript(() => localStorage.setItem('cs-onboarding-seen', '1'));

test.use({ viewport: IPAD_LANDSCAPE });

test('the app height measure tracks the visible viewport, not the layout viewport', async ({ page }) => {
  await markOnboardingSeen(page);
  await page.goto('/');

  // A plain `100vh` here is exactly the bug. Anything dynamic (dvh) is fine.
  const appVh = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--app-vh').trim(),
  );
  expect(appVh).toBe('100dvh');

  const root = page.locator('.app-root');
  await expect(root).toBeAttached();
  const { rootHeight, innerHeight } = await page.evaluate(() => ({
    rootHeight: Math.round(document.querySelector('.app-root')!.getBoundingClientRect().height),
    innerHeight: window.innerHeight,
  }));
  expect(rootHeight).toBe(innerHeight);
});

test('no chrome paints below the visible viewport at tablet size', async ({ page }) => {
  await markOnboardingSeen(page);
  await page.goto('/');

  // Map is the landing tab: the analysis iframe is a replaced element sized
  // by hand, so it is the easiest thing to push past the bottom edge.
  const iframe = page.locator('iframe[title="Map context analysis"]');
  await expect(iframe).toBeAttached();
  const iframeBottom = await iframe.evaluate(el => Math.round(el.getBoundingClientRect().bottom));
  expect(iframeBottom).toBe(IPAD_LANDSCAPE.height);

  // Encode mounts the full desktop furniture: docked sidebar (top bar to
  // bottom edge) plus the bottom-anchored help pill.
  await page.getByRole('button', { name: 'Encode' }).click();
  await expect(page.getByText('Upload or capture a photo')).toBeVisible();

  const sidebar = page.locator('aside[data-tour="sidebar"]');
  await expect(sidebar).toBeVisible();
  expect(await sidebar.evaluate(el => Math.round(el.getBoundingClientRect().bottom)))
    .toBe(IPAD_LANDSCAPE.height);

  await expect(page.locator('[data-tour="help-bar"]')).toBeInViewport({ ratio: 1 });

  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > window.innerHeight + 1;
      })
      .map(el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`),
  );
  expect(overflowing).toEqual([]);
});
