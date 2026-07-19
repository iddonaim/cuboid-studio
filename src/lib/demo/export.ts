/**
 * Demo bundle export — step 1 of 2 (runs IN the app, online + signed in).
 *
 * Gathers the signed-in user's real site pins and compositions from Firestore,
 * snapshots the meme-browser list from /api/fetch-memes, and harvests canned
 * translations from the saved operator records. Produces `demo-bundle-raw.json`
 * as a browser download.
 *
 * Step 2 (offline-ready assets) is `scripts/build-demo-bundle.mjs`, which
 * downloads every referenced meme image and writes public/demo/bundle.json.
 * The split exists because Firebase Storage image downloads are more reliable
 * from Node (no CORS constraints) than from the browser.
 */
import { loadSitePins, isLocated } from '../projects/sitePins';
import { listCompositions } from '../projects/firestore';
import type { OperatorRecord } from '../operators/types';
import type { ArchthesisMeme, FetchMemesResponse } from '../../types/archthesis';
import type { DemoBundle, DemoComposition, DemoTranslation } from './types';

/** How many memes to snapshot for the offline browser grid. */
const MEME_SNAPSHOT_LIMIT = 60;

function harvestTranslations(compositions: DemoComposition[]): DemoTranslation[] {
  const out = new Map<string, DemoTranslation>();
  const consider = (records: OperatorRecord[] | undefined) => {
    for (const r of records ?? []) {
      if (r.pass1 && r.pass2 && r.memeDescription && !out.has(r.memeDescription)) {
        out.set(r.memeDescription, {
          memeDescription: r.memeDescription,
          result: { pass1: r.pass1, pass2: r.pass2, model: r.model ?? 'canned-demo' },
        });
      }
    }
  };
  for (const c of compositions) {
    consider(c.doc.data.pataphysical.operators);
    for (const records of Object.values(c.doc.data.pataphysical.cubeOperators ?? {})) {
      consider(records);
    }
  }
  return [...out.values()];
}

function collectImageUrls(compositions: DemoComposition[], memes: ArchthesisMeme[]): string[] {
  const urls = new Set<string>();
  const remote = (u: string | null | undefined) => {
    if (u && /^https?:\/\//.test(u)) urls.add(u);
  };
  for (const c of compositions) {
    remote(c.doc.data.pataphysical.selectedMemeImageUrl);
    const all = [
      ...(c.doc.data.pataphysical.operators ?? []),
      ...Object.values(c.doc.data.pataphysical.cubeOperators ?? {}).flat(),
    ];
    for (const r of all) remote(r.memeImageUrl);
  }
  for (const m of memes) remote(m.imageUrl);
  return [...urls];
}

/**
 * Build the raw bundle. `images` maps every remote URL to its future local
 * path — the Node script performs the actual downloads and keeps the mapping.
 */
export async function buildRawDemoBundle(ownerId: string): Promise<DemoBundle> {
  const pins = await loadSitePins(ownerId);

  const compositions: DemoComposition[] = [];
  for (const pin of pins.filter(isLocated)) {
    const docs = await listCompositions(pin.projectId, pin.siteId);
    for (const doc of docs) {
      compositions.push({ projectId: pin.projectId, siteId: pin.siteId, doc });
    }
  }

  let memes: ArchthesisMeme[] = [];
  try {
    const res = await fetch(`/api/fetch-memes?limit=${MEME_SNAPSHOT_LIMIT}&sort=recent`);
    if (res.ok) memes = ((await res.json()) as FetchMemesResponse).memes;
  } catch {
    // Meme snapshot is best-effort; the browser grid just stays empty offline.
  }

  const imageUrls = collectImageUrls(compositions, memes);
  const images: Record<string, string> = {};
  imageUrls.forEach((url, i) => {
    const ext = /\.(png|webp|gif)(\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg';
    images[url] = `/demo/memes/img-${String(i).padStart(3, '0')}.${ext}`;
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    pins,
    compositions,
    memes,
    translations: harvestTranslations(compositions),
    images,
  };
}

/** Trigger a browser download of the raw bundle JSON. */
export function downloadRawDemoBundle(bundle: DemoBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'demo-bundle-raw.json';
  a.click();
  URL.revokeObjectURL(url);
}
