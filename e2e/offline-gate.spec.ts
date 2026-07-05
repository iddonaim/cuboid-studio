import { test, expect } from '@playwright/test';

/**
 * Step 0 — Offline gate verification
 * (see docs/internal/presentation-offline-investigation.md)
 *
 * Question under test: does the localStorage save-and-restore workflow
 * (lib/savedStates.ts, driven through the real Saved States panel UI)
 * function with ZERO external network access — including app boot while
 * every non-localhost request is killed at the routing layer?
 *
 * Verdict logic:
 *  - This test passing  → Path A is viable: boot, restore, save, reload,
 *    restore-again all succeed fully offline.
 *  - Attempted external requests are expected (Firebase, CDNs) and are
 *    tolerated — the gate is that the workflow does not DEPEND on any of
 *    them. The full attempt list is attached to the report as an
 *    annotation for the degradation audit.
 *
 * Known external deps in index.html (will appear in the attempt list):
 *  - cdnjs.cloudflare.com → font-awesome (icons render empty offline)
 *  - cdn.jsdelivr.net     → @google/model-viewer
 */

const GRID_STRIDE = 42.6; // CUBE_SIZE (42) + CUBE_GAP (0.6)

const fixtureCube = (
  id: string,
  variationId: string,
  cutterIndices: number[],
  col: number,
) => ({
  id,
  variationId,
  cutterIndices,
  position: [col * GRID_STRIDE, 0, 0] as [number, number, number],
  gridIndex: [col, 0, 0] as [number, number, number],
  rotation: { x: 0, y: 0 },
  rotationDegrees: { x: 0, y: 0 },
  operators: [],
});

const fixtureState = {
  id: 'save-offline-gate-fixture',
  name: 'offline-gate-fixture',
  savedAt: '2026-07-01T00:00:00.000Z',
  cubeCount: 2,
  data: {
    version: 2,
    exportedAt: '2026-07-01T00:00:00.000Z',
    grid: { cubeSize: 42, cubeGap: 0.6, gridStride: GRID_STRIDE, units: 'mm' },
    cubeCount: 2,
    cubes: [
      fixtureCube('cube-gate-1', 'v-00', [0, 1, 2, 3], 0),
      fixtureCube('cube-gate-2', 'v-01', [0, 1, 2, 4], 1),
    ],
    bounds: {
      min: [0, 0, 0] as [number, number, number],
      max: [GRID_STRIDE + 42, 42, 42] as [number, number, number],
    },
  },
};

test('offline gate: save-and-restore works with all external network dead', async ({ page, context }, testInfo) => {
  const attempted: string[] = [];

  // Kill every non-localhost request before it leaves the browser.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return route.continue();
    }
    attempted.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('connectionfailed');
  });

  // Seed the fixture BEFORE any app script runs.
  await page.addInitScript(state => {
    // The onboarding showcase auto-opens on a first-ever visit and its
    // full-screen overlay swallows every click; mark it seen (same as
    // nav.spec.ts) so the test drives the actual workflow.
    window.localStorage.setItem('cs-onboarding-seen', '1');
    // Runs on every navigation (including reload) — only seed the very
    // first load, otherwise we'd wipe the state saved during the test.
    if (!window.localStorage.getItem('cuboid-saved-states')) {
      window.localStorage.setItem('cuboid-saved-states', JSON.stringify([state]));
    }
  }, fixtureState);

  // 1 — Boot fully offline.
  await page.goto('/');
  await expect(page.getByText('Upload or capture a photo')).toBeVisible({ timeout: 15_000 });

  // 2 — Restore the fixture through the real UI.
  await page.getByRole('button', { name: 'Saved States' }).click();
  await expect(page.getByText('offline-gate-fixture')).toBeVisible();

  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await expect(saveButton).toBeDisabled(); // nothing placed yet

  await page.getByRole('button', { name: 'Load', exact: true }).first().click();
  // hasCubes flipped → the restore actually reached the builder store.
  await expect(saveButton).toBeEnabled();

  // 3 — Save under a new name.
  await page.getByPlaceholder(/Assembly \d+/).fill('gate-check');
  await saveButton.click();
  await expect(page.getByText('gate-check')).toBeVisible();

  // 4 — Reload (network still dead): persistence + restore-again.
  await page.reload();
  await expect(page.getByText('Upload or capture a photo')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Saved States' }).click();
  await expect(page.getByText('offline-gate-fixture')).toBeVisible();
  await expect(page.getByText('gate-check')).toBeVisible();

  await page.getByRole('button', { name: 'Load', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

  // Degradation audit trail — what the app TRIED to reach while succeeding.
  testInfo.annotations.push({
    type: 'external-requests-attempted',
    description: attempted.length ? [...new Set(attempted)].join('\n') : 'none',
  });
});
