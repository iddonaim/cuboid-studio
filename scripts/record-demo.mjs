// Cuboid Studio — demo footage recorder (v1: deterministic beats)
// Records real app footage following the voiceover script's [SCREEN] cues.
// Network-dependent beats (Map / Encode vision / Pataphysical generation)
// are driven from restored saved states per the offline-gate verdict (Path A).
//
// Run:  node scripts/record-demo.mjs [--full]
// Out:  recordings/demo-<timestamp>.webm
//
// Design notes:
// - Playwright videos don't show the OS cursor, so a fake cursor div is
//   injected and driven by real mousemove events.
// - Every action is paced: glide() interpolates mouse movement so the
//   recording reads as human, not robotic.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';

const BASE_URL = 'http://localhost:3000';
const SIZE = { width: 1280, height: 720 }; // proof render; use 1920x1080 for final
const STRIDE = 42.6;

// ---------- demo fixture: a small assembly worth looking at ----------
const cube = (id, variationId, cutterIndices, col, row, level) => ({
  id, variationId, cutterIndices,
  position: [col * STRIDE, level * STRIDE, row * STRIDE],
  gridIndex: [col, level, row],
  rotation: { x: 0, y: 0 },
  rotationDegrees: { x: 0, y: 0 },
  operators: [],
});

const demoState = {
  id: 'save-demo-recorder',
  name: 'demo-assembly',
  savedAt: new Date().toISOString(),
  cubeCount: 5,
  data: {
    version: 2,
    exportedAt: new Date().toISOString(),
    grid: { cubeSize: 42, cubeGap: 0.6, gridStride: STRIDE, units: 'mm' },
    cubeCount: 5,
    cubes: [
      cube('c1', 'v-00', [0, 1, 2, 3], 0, 0, 0),
      cube('c2', 'v-01', [0, 1, 2, 4], 1, 0, 0),
      cube('c3', 'v-09', [0, 1, 4, 5], 1, 1, 0),
      cube('c4', 'v-04', [0, 1, 2, 7], 0, 0, 1),
      cube('c5', 'v-10', [0, 1, 4, 6], 1, 0, 1),
    ],
    bounds: { min: [0, 0, 0], max: [2 * STRIDE + 42, STRIDE + 42, STRIDE + 42] },
  },
};

// ---------- pacing helpers ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));

let cur = { x: 640, y: 360 };
async function glide(page, x, y, ms = 700) {
  const steps = Math.max(12, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOut
    await page.mouse.move(cur.x + (x - cur.x) * e, cur.y + (y - cur.y) * e);
    await sleep(ms / steps);
  }
  cur = { x, y };
}

async function glideToAndClick(page, locator, holdAfter = 600) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('target not visible');
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(180);
  await locator.click();
  await sleep(holdAfter);
}

// ---------- recording ----------
mkdirSync('recordings', { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: SIZE,
  recordVideo: { dir: 'recordings', size: SIZE },
});
const page = await context.newPage();

// Fake cursor overlay (Playwright videos have no OS cursor).
await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText =
      'position:fixed;width:14px;height:14px;border-radius:50%;' +
      'background:rgba(255,255,255,.85);border:2px solid rgba(15,23,42,.9);' +
      'box-shadow:0 0 6px rgba(0,0,0,.5);pointer-events:none;z-index:99999;' +
      'transform:translate(-50%,-50%);left:640px;top:360px;';
    document.body.appendChild(c);
    document.addEventListener('mousemove', e => {
      c.style.left = e.clientX + 'px';
      c.style.top = e.clientY + 'px';
    });
  });
});

// Seed the demo assembly (first load only).
await page.addInitScript(state => {
  if (!localStorage.getItem('cuboid-saved-states')) {
    localStorage.setItem('cuboid-saved-states', JSON.stringify([state]));
  }
}, demoState);

// === Beat 1 — boot, hold on Encode (voiceover: opening) ===
await page.goto(BASE_URL);
await page.getByText('Upload or capture a photo').waitFor({ timeout: 15000 });
await sleep(2500);

// === Beat 2 — restore the assembly (voiceover: saved-state restore) ===
await glideToAndClick(page, page.getByRole('button', { name: 'Saved States' }), 800);
await glideToAndClick(page, page.getByRole('button', { name: 'Load', exact: true }).first(), 1200);

// === Beat 3 — slow orbit of the assembly (voiceover: vocabulary) ===
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await glide(page, cx, cy, 900);
await page.mouse.down();
await glide(page, cx + 260, cy - 40, 2600);
await glide(page, cx + 120, cy + 30, 1800);
await page.mouse.up();
await sleep(1200);

// === Beat 4 — Evolution tab (voiceover: pataphysical/evolve intro) ===
await glideToAndClick(page, page.getByRole('button', { name: 'Evolution' }), 2000);

// === Beat 5 — Decode tab (voiceover: notation) ===
await glideToAndClick(page, page.getByRole('button', { name: 'Decode' }), 2500);

// === Beat 6 — return to Encode, closing hold ===
await glideToAndClick(page, page.getByRole('button', { name: 'Encode' }), 2000);

await context.close(); // flushes the video
await browser.close();
console.log('done — recording saved in recordings/');
