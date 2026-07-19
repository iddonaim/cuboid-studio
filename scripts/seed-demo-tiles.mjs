#!/usr/bin/env node
/**
 * Seed offline map tiles for the demo — run once, online, after
 * build-demo-bundle.mjs.
 *
 *   node scripts/seed-demo-tiles.mjs [--dry-run]
 *
 * Reads public/demo/bundle.json, and for every located site pin downloads
 * OpenStreetMap raster tiles into public/demo/tiles/{z}/{x}/{y}.png:
 *
 *   - z 8–11:  a wide context box around ALL pins together (the fit-bounds view)
 *   - z 12–17: a tight box around EACH pin (~1.5× its radius, min ~600 m)
 *
 * In demo mode the app renders ONLY these tiles (no network layer), so what
 * you see in rehearsal is exactly what the jury sees. Unseeded areas are
 * blank — pan responsibly. Tiles are throttled (2/s) per OSM's usage policy;
 * expect a few minutes and typically some hundreds of tiles (~10–30 MB).
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const USER_AGENT = 'cuboid-studio-offline-demo/1.0 (thesis presentation; one-time seed)';
const THROTTLE_MS = 500;

const WIDE_ZOOMS = [8, 9, 10, 11];
// The map opens on a fit-bounds view framing ALL pins together, which lands at
// a mid zoom (~z13–14 when pins span a city). The tight per-pin boxes don't
// cover the corridor between pins at those zooms, so without MID_ZOOMS the
// opening view has missing tiles (seen as gray 404 squares in the first cut).
const MID_ZOOMS = [12, 13, 14, 15];
const TIGHT_ZOOMS = [12, 13, 14, 15, 16, 17];
const MIN_TIGHT_RADIUS_M = 600;

// --- Web-mercator helpers ----------------------------------------------------
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) =>
  Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      2 ** z,
  );

function* tilesForBBox(minLat, maxLat, minLng, maxLng, zooms) {
  for (const z of zooms) {
    const x0 = lon2x(minLng, z);
    const x1 = lon2x(maxLng, z);
    const y0 = lat2y(maxLat, z); // y grows southward
    const y1 = lat2y(minLat, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield { z, x, y };
  }
}

function bboxAround(lat, lng, meters) {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

// --- Collect the tile set ----------------------------------------------------
const bundle = JSON.parse(await readFile(join(root, 'public', 'demo', 'bundle.json'), 'utf8'));
const pins = bundle.pins.filter(p => p.lat !== null && p.lng !== null);
if (pins.length === 0) {
  console.error('No located pins in bundle.json — nothing to seed.');
  process.exit(1);
}

const wanted = new Map(); // "z/x/y" -> tile
const addAll = iter => {
  for (const t of iter) wanted.set(`${t.z}/${t.x}/${t.y}`, t);
};

// Wide context: one box around all pins (padded ~20%), plus the same box with
// a generous pad at mid zooms so the opening fit-bounds view (and a wide
// laptop viewport around it) is fully covered.
{
  const lats = pins.map(p => p.lat);
  const lngs = pins.map(p => p.lng);
  const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), 0.05);
  const lngSpan = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.05);
  const box = pad => [
    Math.min(...lats) - latSpan * pad,
    Math.max(...lats) + latSpan * pad,
    Math.min(...lngs) - lngSpan * pad,
    Math.max(...lngs) + lngSpan * pad,
  ];
  addAll(tilesForBBox(...box(0.2), WIDE_ZOOMS));

  // Mid zooms: the fit-bounds opening view centers the pins, but which zoom
  // Leaflet picks — and how far past the pins the frame reaches — depends on
  // the window size. Cover, at every mid zoom, at least a full large-screen
  // viewport (2400×1500 px with margin) centered on the pins, so the opening
  // view is complete whatever laptop/projector resolution the talk runs at.
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  for (const z of MID_ZOOMS) {
    const mPerPx = (156543.03392 * Math.cos((midLat * Math.PI) / 180)) / 2 ** z;
    const halfW = (2400 / 2) * mPerPx;
    const halfH = (1500 / 2) * mPerPx;
    const dLat = halfH / 111_320;
    const dLng = halfW / (111_320 * Math.cos((midLat * Math.PI) / 180));
    const [bMinLat, bMaxLat, bMinLng, bMaxLng] = box(0.3);
    addAll(
      tilesForBBox(
        Math.min(bMinLat, midLat - dLat),
        Math.max(bMaxLat, midLat + dLat),
        Math.min(bMinLng, midLng - dLng),
        Math.max(bMaxLng, midLng + dLng),
        [z],
      ),
    );
  }
}

// Tight boxes per pin.
for (const pin of pins) {
  const radius = Math.max((pin.radiusMeters ?? 500) * 1.5, MIN_TIGHT_RADIUS_M);
  const b = bboxAround(pin.lat, pin.lng, radius);
  addAll(tilesForBBox(b.minLat, b.maxLat, b.minLng, b.maxLng, TIGHT_ZOOMS));
}

console.log(`${pins.length} pin(s) → ${wanted.size} tile(s) to seed.`);
if (dryRun) process.exit(0);

// --- Download ---------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, skipped = 0, failed = 0;

for (const { z, x, y } of wanted.values()) {
  const dir = join(root, 'public', 'demo', 'tiles', String(z), String(x));
  const file = join(dir, `${y}.png`);
  try {
    await access(file);
    skipped += 1; // already seeded — resumable
    continue;
  } catch { /* not yet downloaded */ }

  try {
    const res = await fetch(TILE_URL(z, x, y), { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await mkdir(dir, { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    ok += 1;
    if (ok % 50 === 0) console.log(`  ${ok}/${wanted.size}…`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${z}/${x}/${y}  ${err.message}`);
  }
  await sleep(THROTTLE_MS);
}

console.log(`\nDone: ${ok} downloaded, ${skipped} already present, ${failed} failed.`);
if (failed) {
  console.error('Re-run to retry failures (existing tiles are skipped).');
  process.exitCode = 2;
}
