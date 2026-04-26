#!/usr/bin/env node
/**
 * Headless renderer for axonometric wireframe views.
 *
 * Drives the React-based AxonometricGenerator (mounted at /?axon&auto) inside
 * a headless Chromium and writes the resulting PNGs straight to disk.
 *
 * Usage:
 *   node scripts/render-axon-views.cjs [--url=http://localhost:3000] [--out=public/axon-views]
 *
 * Assumes the Vite dev server is already running. Requires `puppeteer` to be
 * installed (use `npm install --no-save puppeteer`).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');

// Locate the full Chrome binary that puppeteer downloads (not the headless-shell,
// which has limited WebGL support). Falls back to puppeteer's default if missing.
function findChromeExecutable() {
  const cacheRoot = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  if (!fs.existsSync(cacheRoot)) return undefined;
  const versions = fs.readdirSync(cacheRoot).filter((d) => d.startsWith('linux-'));
  if (!versions.length) return undefined;
  versions.sort().reverse();
  const candidate = path.join(cacheRoot, versions[0], 'chrome-linux64', 'chrome');
  return fs.existsSync(candidate) ? candidate : undefined;
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  })
);

const BASE_URL = args.url || 'http://localhost:3000';
const OUT_DIR = path.resolve(process.cwd(), args.out || 'public/axon-views');
const TIMEOUT_MS = Number(args.timeout || 10 * 60 * 1000);

(async () => {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const executablePath = findChromeExecutable();
  console.log(`[axon] launching headless chrome${executablePath ? ` at ${executablePath}` : ''}`);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 700, height: 700, deviceScaleFactor: 1 });

  page.on('pageerror', (err) => console.error('[page error]', err.message));
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') console.log(`[page ${t}]`, msg.text());
  });

  const extra = args.threshold ? `&threshold=${args.threshold}` : '';
  const targetUrl = `${BASE_URL}/?axon&auto${extra}`;
  console.log(`[axon] opening ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 60_000 });

  console.log(`[axon] waiting for renders to finish (timeout ${TIMEOUT_MS}ms)`);
  const start = Date.now();
  let lastDone = -1;
  while (true) {
    const status = await page.evaluate(() => ({
      status: window.__axonStatus,
      progress: window.__axonProgress,
    }));

    if (status.progress && status.progress.done !== lastDone) {
      lastDone = status.progress.done;
      process.stdout.write(`\r[axon] ${lastDone}/${status.progress.total}      `);
    }

    if (status.status === 'done') {
      process.stdout.write('\n');
      break;
    }
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error(`Render timeout after ${TIMEOUT_MS}ms (last progress: ${lastDone})`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[axon] reading outputs`);
  const outputs = await page.evaluate(() => window.__axonOutputs || []);
  console.log(`[axon] got ${outputs.length} dataURLs, writing to ${OUT_DIR}`);

  for (const { id, angle, dataUrl } of outputs) {
    const base64 = dataUrl.split(',')[1];
    const buf = Buffer.from(base64, 'base64');
    const file = path.join(OUT_DIR, `${id}-${angle}.png`);
    fs.writeFileSync(file, buf);
  }

  await browser.close();
  console.log(`[axon] done — wrote ${outputs.length} files to ${OUT_DIR}`);
})().catch((err) => {
  console.error('[axon] FAILED', err);
  process.exit(1);
});
