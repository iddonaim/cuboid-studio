#!/usr/bin/env node
/**
 * Demo bundle build — step 2 of 2 (runs on your machine, online, once).
 *
 *   node scripts/build-demo-bundle.mjs demo-bundle-raw.json
 *
 * Takes the raw bundle exported from the app (?demoExport → "Export demo
 * bundle"), downloads every referenced meme image into public/demo/memes/,
 * rewrites the meme-browser list to those local paths, and writes the final
 * public/demo/bundle.json. After this, run scripts/seed-demo-tiles.mjs, then
 * commit public/demo/ so the offline build ships the whole demo.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawPath = process.argv[2];

if (!rawPath) {
  console.error('Usage: node scripts/build-demo-bundle.mjs <demo-bundle-raw.json>');
  process.exit(1);
}

const bundle = JSON.parse(await readFile(rawPath, 'utf8'));
if (bundle.version !== 1) {
  console.error(`Unsupported bundle version: ${bundle.version}`);
  process.exit(1);
}

const demoDir = join(root, 'public', 'demo');
const memesDir = join(demoDir, 'memes');
await mkdir(memesDir, { recursive: true });

// --- Download every image in the manifest ----------------------------------
const entries = Object.entries(bundle.images);
console.log(`Downloading ${entries.length} meme image(s)…`);

let ok = 0;
const failed = [];
for (const [url, localPath] of entries) {
  const filename = localPath.split('/').pop();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(join(memesDir, filename), buf);
    ok += 1;
    console.log(`  ✓ ${filename}  (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (err) {
    failed.push(url);
    console.error(`  ✗ ${filename}  ${err.message}  ← ${url.slice(0, 80)}…`);
  }
}

// Drop failed URLs from the manifest so the app falls back to the original
// URL (broken offline, but visible in rehearsal) rather than a local 404.
for (const url of failed) delete bundle.images[url];

// --- Rewrite the meme-browser list to local paths ---------------------------
for (const meme of bundle.memes ?? []) {
  if (bundle.images[meme.imageUrl]) meme.imageUrl = bundle.images[meme.imageUrl];
}

await writeFile(join(demoDir, 'bundle.json'), JSON.stringify(bundle, null, 2));

console.log(`\nWrote public/demo/bundle.json`);
console.log(`  pins:         ${bundle.pins.length}`);
console.log(`  compositions: ${bundle.compositions.length}`);
console.log(`  memes:        ${bundle.memes.length}`);
console.log(`  translations: ${bundle.translations.length}`);
console.log(`  images:       ${ok} downloaded${failed.length ? `, ${failed.length} FAILED` : ''}`);
if (failed.length) {
  console.error('\nSome images failed to download — re-run, or those memes show broken images offline.');
  process.exitCode = 2;
}
console.log('\nNext: node scripts/seed-demo-tiles.mjs   (then commit public/demo/)');
