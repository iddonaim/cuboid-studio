import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

// The Decode export has to carry every layer, not just the tiles: a plan or a
// capture registered under the sheet is part of the drawing. That is a claim
// about pixels, so this test proves it against a real browser — import a
// solid-colour plan, export the PNG, and look for that colour in the result.
//
// Deeper than the rest of e2e (see nav.spec.ts) on purpose: the underlay is
// only visible once Konva, the resize pipeline and the capture crop all agree,
// and none of those meet each other anywhere but here.

const markOnboardingSeen = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('cs-onboarding-seen', '1'));

interface CapturedDownload {
  name: string;
  href: string;
}

type DownloadWindow = Window & {
  __downloads: CapturedDownload[];
  __blobs: Record<string, Blob>;
};

/**
 * Record `<a download>` clicks instead of letting the browser download.
 *
 * Blob URLs are also stashed by hand: the app revokes each one immediately
 * after clicking, so the only chance to read an exported SVG back is to hold
 * on to the Blob as it is created.
 */
const captureDownloads = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as DownloadWindow;
    w.__downloads = [];
    w.__blobs = {};

    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = createObjectURL(obj);
      if (obj instanceof Blob) w.__blobs[url] = obj;
      return url;
    };

    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download) {
        w.__downloads.push({ name: this.download, href: this.href });
        return;
      }
      return click.call(this);
    };
  });

/** Text of the nth captured download, read from the stashed Blob. */
const downloadText = (page: Page, index: number): Promise<string> =>
  page.evaluate((i: number) => {
    const w = window as unknown as DownloadWindow;
    return w.__blobs[w.__downloads[i].href].text();
  }, index);

/** A solid #0000ff PNG, written by hand so the test owns its only fixture. */
function solidBluePng(size = 64): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const row = Buffer.concat([
    Buffer.from([0]), // no filter
    Buffer.concat(Array.from({ length: size }, () => Buffer.from([0, 0, 255]))),
  ]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface PixelShares {
  /** Opaque and predominantly blue — i.e. the imported plan. */
  plan: number;
  /** Opaque and near-black — the tile line work. */
  tiles: number;
  /** The accent (#BE4A21) the transform handles are drawn in — must be zero. */
  handles: number;
}

async function pixelShares(page: Page, dataUrl: string): Promise<PixelShares> {
  return page.evaluate(async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let plan = 0;
    let tiles = 0;
    let handles = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 200) continue;
      if (b > 180 && r < 80 && g < 80) plan++;
      if (r < 60 && g < 60 && b < 60) tiles++;
      // #BE4A21 — a warm red-orange nothing else in this export produces.
      if (Math.abs(r - 0xbe) < 30 && Math.abs(g - 0x4a) < 30 && Math.abs(b - 0x21) < 30) handles++;
    }
    const total = data.length / 4;
    return { plan: plan / total, tiles: tiles / total, handles: handles / total };
  }, dataUrl);
}

test('the PNG export carries the underlay stack, not just the tiles', async ({ page }) => {
  await markOnboardingSeen(page);
  await captureDownloads(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Decode' }).click();
  await expect(page.getByText('Freestyle', { exact: true })).toBeVisible();

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'ground-floor.png',
    mimeType: 'image/png',
    buffer: solidBluePng(),
  });

  // The layers list shows the import once the resize pipeline has finished.
  await expect(page.getByRole('button', { name: /ground-floor.*plan/ })).toBeVisible();

  const exportPng = page.getByRole('button', { name: 'Export PNG' });
  // A registered plan alone is now something to export — no tiles required.
  await expect(exportPng).toBeEnabled();
  await exportPng.click();

  const downloads = await page.evaluate(
    () => (window as unknown as DownloadWindow).__downloads,
  );
  expect(downloads).toHaveLength(1);
  expect(downloads[0].name).toMatch(/^cuboid-decode-sheet-\d+\.png$/);

  const shares = await pixelShares(page, downloads[0].href);
  // The plan spans most of the crop; padding and transparency take the rest.
  expect(shares.plan).toBeGreaterThan(0.4);
  // A freshly imported layer arrives armed, so its transform handles are on
  // screen — the export still has to leave that editing chrome behind.
  expect(shares.handles).toBe(0);
});

test('the PNG export holds tiles and underlay together', async ({ page }) => {
  await markOnboardingSeen(page);
  await captureDownloads(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Decode' }).click();
  // Freestyle opens the parts drawer without needing an assembly behind it,
  // which is what makes auto-compose available to place tiles.
  await page.getByRole('switch').first().click();
  await page.getByRole('button', { name: '+5', exact: true }).click();

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'ground-floor.png',
    mimeType: 'image/png',
    buffer: solidBluePng(),
  });
  await expect(page.getByRole('button', { name: /ground-floor.*plan/ })).toBeVisible();

  await page.getByRole('button', { name: 'Export PNG' }).click();

  const downloads = await page.evaluate(
    () => (window as unknown as DownloadWindow).__downloads,
  );
  const shares = await pixelShares(page, downloads[0].href);
  // Both halves of the drawing survive the export — this is the whole point.
  expect(shares.plan).toBeGreaterThan(0);
  expect(shares.tiles).toBeGreaterThan(0);
  expect(shares.handles).toBe(0);
});

test('the SVG export embeds the underlay as its own named layer', async ({ page }) => {
  await markOnboardingSeen(page);
  await captureDownloads(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Decode' }).click();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'ground-floor.png',
    mimeType: 'image/png',
    buffer: solidBluePng(),
  });
  await expect(page.getByRole('button', { name: /ground-floor.*plan/ })).toBeVisible();

  await page.getByRole('button', { name: 'Export SVG' }).click();

  const svg = await downloadText(page, 0);

  expect(svg).toContain('id="underlay-1-ground-floor"');
  expect(svg).toContain('xlink:href="data:image/');
});
