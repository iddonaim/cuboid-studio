// Cuboid Studio — demo footage recorder v2
// Beats sync to the ElevenLabs narration (248.5s) via a global clock:
// beatUntil(t) sleeps until elapsed-since-first-paint reaches t.
// Boundaries from pause detection: 24.5 | 58.7 | 100.7 | 135.8 | 191.4 | 214.7 | 231.1 | 248.5
// Run: node scripts/record-demo-v2.mjs   Out: recordings/*.webm + printed trimOffset

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'fs';

const BASE_URL = 'http://localhost:3000';
const SIZE = { width: 960, height: 540 };
const END = 248.5;
const B = { b1: 24.5, b2: 58.7, b3: 100.7, b4: 135.8, b5: 191.4, b6: 214.7, b7: 231.1 };
const savedStates = JSON.parse(readFileSync('scripts/iddo-saved-states.json', 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
let clock0 = 0;
const elapsed = () => (Date.now() - clock0) / 1000;
async function beatUntil(t) { const r = t - elapsed(); if (r > 0) await sleep(r * 1000); }

let cur = { x: 640, y: 360 };
async function glide(page, x, y, ms = 800) {
  const steps = Math.max(12, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(cur.x + (x - cur.x) * e, cur.y + (y - cur.y) * e);
    await sleep(ms / steps);
  }
  cur = { x, y };
}
async function glideClick(page, locator, ms = 800) {
  const box = await locator.boundingBox();
  if (!box) return false;
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, ms);
  await sleep(200);
  await locator.click();
  return true;
}
async function orbit(page, cx, cy, dx, dy, ms) {
  await glide(page, cx, cy, 700);
  await page.mouse.down({ button: 'right' });
  await glide(page, cx + dx, cy + dy, ms);
  await page.mouse.up({ button: 'right' });
}


import { appendFileSync } from 'fs';
const LOG = 'recordings/run.log';
const log = m => { const line = `[${elapsed().toFixed(1)}s] ${m}`; console.log(line); appendFileSync(LOG, line + '\n'); };
async function assertTab(page, name) {
  const color = await page.getByRole('button', { name, exact: true }).evaluate(el => getComputedStyle(el).color).catch(() => 'ERR');
  const ok = color === 'rgb(255, 255, 255)';
  log(`assert tab ${name}: ${ok ? 'OK' : 'FAILED (' + color + ')'}`);
  if (!ok) throw new Error(`tab switch to ${name} failed — aborting recording`);
}

mkdirSync('recordings', { recursive: true });
appendFileSync(LOG, `=== run ${new Date().toISOString()} ${SIZE.width}x${SIZE.height} ===\n`);
const browser = await chromium.launch({ headless: true });
const recordStart = Date.now();
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: 'recordings', size: SIZE } });
const page = await context.newPage();

await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText =
      'position:fixed;width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.85);' +
      'border:2px solid rgba(15,23,42,.9);box-shadow:0 0 6px rgba(0,0,0,.5);pointer-events:none;' +
      'z-index:99999;transform:translate(-50%,-50%);left:640px;top:360px;';
    document.body.appendChild(c);
    document.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; });
  });
});
await page.addInitScript(states => {
  if (!localStorage.getItem('cuboid-saved-states')) {
    localStorage.setItem('cuboid-saved-states', JSON.stringify(states));
  }
}, savedStates);

const health = await fetch(BASE_URL).then(r => r.status).catch(() => 0);
if (health !== 200) throw new Error('dev server not reachable — refusing to record');
await page.goto(BASE_URL);
await page.getByText('Upload or capture a photo').waitFor({ timeout: 30000 });
clock0 = Date.now();
const trimOffset = (clock0 - recordStart) / 1000;

const canvas = page.locator('canvas').first();
const cb = await canvas.boundingBox();
const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;

// Beat 1 (0-24.5) opening: boot hold, restore assembly
await sleep(2500);
await glideClick(page, page.getByRole('button', { name: 'Saved States' }), 1400);
await sleep(1200);
await glideClick(page, page.getByRole('button', { name: 'Load', exact: true }).first(), 1200);
await sleep(2000);
await orbit(page, cx, cy, 120, -20, 5000);
await beatUntil(B.b1);
log('Beat 2 start');

// Beat 2 (24.5-58.7) site narration: slow orbits
await orbit(page, cx, cy, 300, -60, 8000);
await sleep(1500);
await orbit(page, cx - 60, cy, -220, 40, 7000);
await beatUntil(B.b2);
log('Beat 3 start');

// Beat 3 (58.7-100.7) encode narration: panel tour, back to model
await glide(page, 160, 160, 1600);
await sleep(1200);
for (const m of ['Standalone', 'Merge', 'Remix']) {
  const b = page.getByRole('button', { name: m }).first();
  const bx = await b.boundingBox();
  if (bx) { await glide(page, bx.x + bx.width / 2, bx.y + bx.height / 2, 900); await sleep(900); }
}
await orbit(page, cx, cy, 200, -50, 7000);
await beatUntil(B.b3);
log('Beat 4 start');

// Beat 4 (100.7-135.8) vocabulary: ortho study + selection + close orbits
await glideClick(page, page.getByRole('button', { name: 'Ortho' }), 1200);
await sleep(2500);
await glideClick(page, page.getByRole('button', { name: 'Ortho' }), 1000);
await sleep(1500);
await glide(page, cx, cy - 40, 900);
await page.mouse.click(cx, cy - 40); // select a cube (best-effort)
await sleep(2500);
await orbit(page, cx, cy, -260, 30, 7000);
await sleep(1000);
await orbit(page, cx, cy, 180, -80, 7000);
await beatUntil(B.b4);
log('Beat 5 start');

// Beat 5 (135.8-191.4) pataphysical: Evolution tab + sub-mode
await glideClick(page, page.getByRole('button', { name: 'Evolution' }), 1400);
await sleep(2500);
await assertTab(page, 'Evolution');
await glideClick(page, page.getByRole('button', { name: 'Pataphysical' }), 1200);
await sleep(4000);
await glide(page, 160, 300, 1400);
await sleep(2500);
await orbit(page, cx, cy, 240, -40, 7000);
await beatUntil(B.b5);
log('Beat 6 start');

// Beat 6 (191.4-214.7) evolve
await glideClick(page, page.getByRole('button', { name: 'Evolve', exact: true }), 1200);
await sleep(3000);
await orbit(page, cx, cy, -180, 30, 7000);
await beatUntil(B.b6);
log('Beat 7 start');

// Beat 7 (214.7-231.1) decode
await glideClick(page, page.getByRole('button', { name: 'Decode' }), 1400);
await sleep(2000);
await assertTab(page, 'Decode');
await glide(page, 160, 200, 1600);
await sleep(1500);
await glide(page, 160, 420, 1400);
await beatUntil(B.b7);
log('Beat 8 start');

// Beat 8 (231.1-248.5) close: back to Encode, final orbit
await glideClick(page, page.getByRole('button', { name: 'Encode' }), 1200);
await assertTab(page, 'Encode');
await orbit(page, cx, cy, 260, -30, 8000);
await beatUntil(END);

await context.close();
await browser.close();
console.log(`done. trimOffset=${trimOffset.toFixed(2)}s`);
