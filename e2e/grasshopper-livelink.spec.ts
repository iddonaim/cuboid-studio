import { test, expect, type Download } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Grasshopper live-link end-to-end check.
 *
 * Exercises the full chain a Rhino user would run:
 *
 *   browser UI (Connect button) ──POST /state──▶ cuboid_bridge_server.py
 *                                                      │
 *   this test polls GET /state ◀──HTTP────────────────┘
 *                (standing in for the GHPython receiver component)
 *
 * The test spawns the real Python bridge on a non-default port, loads a
 * two-cube assembly through the Saved States panel, connects via the real
 * Export panel UI, and asserts the assembly JSON comes out of the same
 * HTTP endpoint Grasshopper polls.
 *
 * Skips (rather than fails) when python3 is missing. The bridge is
 * stdlib-only, so python3 itself is the only requirement.
 */

const BRIDGE_PORT = 9893; // non-default to avoid clashing with a manually run bridge
const GRID_STRIDE = 42.6;

const fixtureCube = (id: string, variationId: string, col: number) => ({
  id,
  variationId,
  cutterIndices: [0, 1, 2, 3],
  position: [col * GRID_STRIDE, 0, 0] as [number, number, number],
  gridIndex: [col, 0, 0] as [number, number, number],
  rotation: { x: 0, y: 0 },
  rotationDegrees: { x: 0, y: 0 },
  operators: [],
});

const fixtureState = {
  id: 'save-livelink-fixture',
  name: 'livelink-fixture',
  savedAt: '2026-07-01T00:00:00.000Z',
  cubeCount: 2,
  data: {
    version: 2,
    exportedAt: '2026-07-01T00:00:00.000Z',
    grid: { cubeSize: 42, cubeGap: 0.6, gridStride: GRID_STRIDE, units: 'mm' },
    cubeCount: 2,
    cubes: [fixtureCube('cube-ll-1', 'v-00', 0), fixtureCube('cube-ll-2', 'v-01', 1)],
    bounds: {
      min: [0, 0, 0] as [number, number, number],
      max: [GRID_STRIDE + 42, 42, 42] as [number, number, number],
    },
  },
};

const pythonAvailable = () =>
  spawnSync('python3', ['--version'], { timeout: 10_000 }).status === 0;

/** GET a bridge endpoint like the GH receiver does. */
async function bridgeGet(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://localhost:${BRIDGE_PORT}${path}`);
  return { status: res.status, body: await res.text() };
}

// The bridge-backed test lives alone in this group: each Playwright worker
// runs beforeAll itself, so with fullyParallel two tests here would spawn
// two bridges on one port and one worker's afterAll would kill the other's
// server mid-test.
test.describe('Grasshopper live-link (bridge running)', () => {
  let bridge: ChildProcess | undefined;

  test.beforeAll(async () => {
    test.skip(!pythonAvailable(), 'python3 not available');
    bridge = spawn('python3', ['grasshopper/cuboid_bridge_server.py', '--port', String(BRIDGE_PORT)], {
      stdio: 'ignore',
    });
    // Wait for the bridge to come up
    await expect
      .poll(async () => (await bridgeGet('/status').catch(() => null))?.status ?? 0, {
        timeout: 10_000,
      })
      .toBe(200);
  });

  test.afterAll(() => {
    bridge?.kill();
  });

  test('Connect pushes the assembly to the endpoint Grasshopper polls', async ({ page }) => {
    await page.addInitScript(state => {
      window.localStorage.setItem('cs-onboarding-seen', '1');
      if (!window.localStorage.getItem('cuboid-saved-states')) {
        window.localStorage.setItem('cuboid-saved-states', JSON.stringify([state]));
      }
    }, fixtureState);

    await page.goto('/');
    // Map is the landing tab; the Encode sidebar (with Saved States / Export)
    // needs the Encode tab active.
    await page.getByRole('button', { name: 'Encode' }).click();
    await expect(page.getByText('Upload or capture a photo')).toBeVisible({ timeout: 15_000 });

    // Load the two-cube fixture through the real Saved States panel
    await page.getByRole('button', { name: 'Saved States' }).click();
    await expect(page.getByText('livelink-fixture')).toBeVisible();
    await page.getByRole('button', { name: 'Load', exact: true }).first().click();

    // Open the Export section and point it at the test bridge port
    await page.getByRole('button', { name: 'Export & Grasshopper' }).click();
    await expect(page.getByText(/GH Live-Link/)).toBeVisible();
    await page.getByRole('button', { name: 'settings' }).click();
    await page.getByLabel(/Port/).fill(String(BRIDGE_PORT));

    // Connect — the panel auto-pushes the current assembly on connect
    await page.getByRole('button', { name: 'Connect' }).click();
    await expect(page.getByText('GH Live-Link: connected')).toBeVisible({ timeout: 5_000 });

    // The bridge should now serve the assembly on the GH-facing endpoint
    await expect
      .poll(async () => {
        const { status, body } = await bridgeGet('/state');
        if (status !== 200) return null;
        return JSON.parse(body).cubeCount as number;
      }, { timeout: 5_000 })
      .toBe(2);

    const state = JSON.parse((await bridgeGet('/state')).body);
    expect(state.cubes).toHaveLength(2);
    expect(state.cubes[0].variationId).toBe('v-00');
    expect(state.grid.gridStride).toBeCloseTo(42.6);

    // Manual "Push Now" bumps the bridge's update counter
    const before = JSON.parse((await bridgeGet('/status')).body).update_count as number;
    await page.getByRole('button', { name: 'Push Now' }).click();
    await expect
      .poll(async () => JSON.parse((await bridgeGet('/status')).body).update_count as number, {
        timeout: 5_000,
      })
      .toBeGreaterThan(before);

    // Stop cleanly disconnects
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByText('GH Live-Link: disconnected')).toBeVisible();
  });
});

// Needs no bridge — the guide and its script downloads are fully client-side.
test.describe('Grasshopper setup guide', () => {
  const downloadedText = async (download: Download) =>
    readFileSync((await download.path())!, 'utf-8');

  test('guide opens from the Export panel and serves both scripts', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cs-onboarding-seen', '1');
    });
    await page.goto('/');
    // Map is the landing tab; the Encode sidebar (with Saved States / Export)
    // needs the Encode tab active.
    await page.getByRole('button', { name: 'Encode' }).click();
    await expect(page.getByText('Upload or capture a photo')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Export & Grasshopper' }).click();
    await page.getByRole('button', { name: 'Setup Guide & Downloads' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Grasshopper live-link setup guide' })
    ).toBeVisible();

    // Both scripts download from the app itself — no repo access needed.
    // Assert the content is the real thing, not an empty or mangled blob.
    const downloadButtons = page.getByRole('button', { name: 'Download', exact: true });

    // Exact-match against the repo files: the ?raw bundling must serve
    // byte-identical files, not merely something that looks similar.
    // (BOM-tolerant: Vite may strip the ghx's UTF-8 BOM.)
    const stripBom = (s: string) => s.replace(/^﻿/, '');

    const canvasPromise = page.waitForEvent('download');
    await downloadButtons.first().click();
    const canvas = await canvasPromise;
    expect(canvas.suggestedFilename()).toBe('cuboid_live_link.ghx');
    const canvasText = await downloadedText(canvas);
    expect(stripBom(canvasText)).toBe(
      stripBom(readFileSync('grasshopper/cuboid_live_link.ghx', 'utf-8'))
    );

    const bridgePromise = page.waitForEvent('download');
    await downloadButtons.nth(1).click();
    const bridge = await bridgePromise;
    expect(bridge.suggestedFilename()).toBe('cuboid_bridge_server.py');
    expect(await downloadedText(bridge)).toBe(
      readFileSync('grasshopper/cuboid_bridge_server.py', 'utf-8')
    );

    const receiverPromise = page.waitForEvent('download');
    await downloadButtons.nth(2).click();
    const receiver = await receiverPromise;
    expect(receiver.suggestedFilename()).toBe('cuboid_gh_receiver.py');
    expect(await downloadedText(receiver)).toBe(
      readFileSync('grasshopper/cuboid_gh_receiver.py', 'utf-8')
    );

    // Drift guard: the script embedded inside the packaged .ghx canvas
    // must stay identical to the standalone receiver script. If this
    // fails, re-embed the current receiver into the ghx (base64 Text
    // item in its Script chunk) before shipping.
    const scriptItems = canvasText.match(
      /<item name="Text" type_name="gh_string" type_code="10">([A-Za-z0-9+/=\s]+)<\/item>/g
    );
    expect(scriptItems).not.toBeNull();
    const embedded = scriptItems!
      .map(item => Buffer.from(item.replace(/<[^>]+>/g, ''), 'base64').toString('utf-8'))
      .find(text => text.includes('Cuboid Studio'));
    expect(embedded).toBe(readFileSync('grasshopper/cuboid_gh_receiver.py', 'utf-8'));

    // Escape closes the guide
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: 'Grasshopper live-link setup guide' })
    ).toBeHidden();
  });
});

// Needs no bridge — points the panel at a dead port on purpose.
test.describe('Grasshopper live-link (bridge down)', () => {
  test('Stop works while the bridge is unreachable (no zombie retry loop)', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cs-onboarding-seen', '1');
    });
    await page.goto('/');
    // Map is the landing tab; the Encode sidebar (with Saved States / Export)
    // needs the Encode tab active.
    await page.getByRole('button', { name: 'Encode' }).click();
    await expect(page.getByText('Upload or capture a photo')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Export & Grasshopper' }).click();
    await page.getByRole('button', { name: 'settings' }).click();
    await page.getByLabel(/Port/).fill('9899'); // nothing listens here

    await page.getByRole('button', { name: 'Connect' }).click();
    // Heartbeat fails → error status, and the button must offer Stop
    await expect(page.getByText(/GH Live-Link: (connecting|error)/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByText('GH Live-Link: disconnected')).toBeVisible();
  });
});
