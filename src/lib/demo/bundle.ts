/**
 * Offline demo bundle — runtime loader + the demo-side implementations of the
 * three data reads the demo swaps out (site pins, compositions, meme browsing)
 * plus canned translations and meme-image URL rewriting.
 *
 * The bundle ships in the repo under public/demo/bundle.json, so:
 *   - `vite preview` / production serve it same-origin (no API, no Firestore);
 *   - the service worker precaches it (json is in globPatterns) along with the
 *     meme JPEGs and map tiles under public/demo/.
 *
 * Every function here is a pure data source; the app's downstream logic
 * (restoreComposition, the browser grid, the translation phases) is untouched.
 */
import type { CompositionData, CompositionDoc } from '../projects/types';
import type { SitePin } from '../projects/sitePins';
import type { ArchthesisMeme, FetchMemesResponse } from '../../types/archthesis';
import type { TwoPassTranslationResult, OperatorRecord } from '../operators/types';
import type { DemoBundle, DemoComposition } from './types';

const BUNDLE_URL = '/demo/bundle.json';

let bundlePromise: Promise<DemoBundle> | null = null;

/** Load (once) and cache the bundle. Throws with a clear message if absent. */
export function loadDemoBundle(): Promise<DemoBundle> {
  if (!bundlePromise) {
    bundlePromise = fetch(BUNDLE_URL).then(async res => {
      if (!res.ok) {
        throw new Error(
          `Demo bundle missing (${res.status} for ${BUNDLE_URL}). ` +
            'Run the export (?demoExport) and scripts/build-demo-bundle.mjs first.',
        );
      }
      const bundle = (await res.json()) as DemoBundle;
      if (bundle.version !== 1) {
        throw new Error(`Unsupported demo bundle version: ${String(bundle.version)}`);
      }
      return bundle;
    });
    // A failed load should be retryable (e.g. bundle added after first click).
    bundlePromise.catch(() => {
      bundlePromise = null;
    });
  }
  return bundlePromise;
}

// --- Site pins -------------------------------------------------------------

export async function loadDemoSitePins(): Promise<SitePin[]> {
  return (await loadDemoBundle()).pins;
}

// --- Compositions ----------------------------------------------------------

export async function listDemoCompositions(
  projectId: string,
  siteId: string,
): Promise<CompositionDoc[]> {
  const bundle = await loadDemoBundle();
  return bundle.compositions
    .filter((c: DemoComposition) => c.projectId === projectId && c.siteId === siteId)
    .map(c => c.doc)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Rewrite remote meme-image URLs inside a composition to their bundled local
 * copies, so nothing in the restored state points at Firebase Storage.
 * Returns a deep copy; the bundle's own data stays pristine.
 */
export async function rewriteCompositionImages(data: CompositionData): Promise<CompositionData> {
  const { images } = await loadDemoBundle();
  const copy: CompositionData = JSON.parse(JSON.stringify(data));

  const rewrite = (url: string | null | undefined): string | null =>
    url ? (images[url] ?? url) : (url ?? null);

  copy.pataphysical.selectedMemeImageUrl = rewrite(copy.pataphysical.selectedMemeImageUrl);

  const rewriteRecords = (records: OperatorRecord[] | undefined) => {
    for (const r of records ?? []) {
      if (r.memeImageUrl) r.memeImageUrl = images[r.memeImageUrl] ?? r.memeImageUrl;
    }
  };
  rewriteRecords(copy.pataphysical.operators);
  for (const records of Object.values(copy.pataphysical.cubeOperators ?? {})) {
    rewriteRecords(records);
  }
  return copy;
}

// --- Meme browsing (offline stand-in for /api/fetch-memes) -----------------

export interface DemoMemeQuery {
  limit: number;
  offset: number;
  sort: 'recent' | 'popular' | 'oldest';
  search?: string;
  tag?: string;
}

export async function fetchDemoMemes(q: DemoMemeQuery): Promise<FetchMemesResponse> {
  const bundle = await loadDemoBundle();
  let memes = bundle.memes.filter(m => !m.hidden);

  if (q.search?.trim()) {
    const s = q.search.trim().toLowerCase();
    memes = memes.filter(m =>
      [m.memeText, m.topText, m.bottomText, m.description, m.username]
        .filter(Boolean)
        .some(t => (t as string).toLowerCase().includes(s)),
    );
  }
  if (q.tag?.trim()) {
    const t = q.tag.trim().toLowerCase();
    memes = memes.filter(m => m.tags?.some(x => x.toLowerCase() === t));
  }

  const byTime = (m: ArchthesisMeme) => Date.parse(m.timestamp) || 0;
  memes = [...memes].sort((a, b) => {
    if (q.sort === 'popular') return (b.likes ?? 0) - (a.likes ?? 0);
    if (q.sort === 'oldest') return byTime(a) - byTime(b);
    return byTime(b) - byTime(a);
  });

  const page = memes.slice(q.offset, q.offset + q.limit);
  return { memes: page, hasMore: q.offset + q.limit < memes.length };
}

// --- Canned translations ---------------------------------------------------

/**
 * Look up the canned two-pass translation for a meme description. Exact match
 * first, then a normalised (trimmed, case-folded) match. Throws with a
 * presenter-readable message when the meme has no canned result — better a
 * clear error in rehearsal than a silent wrong cut in the talk.
 */
export async function getDemoTranslation(
  memeDescription: string,
): Promise<TwoPassTranslationResult> {
  const bundle = await loadDemoBundle();
  const exact = bundle.translations.find(t => t.memeDescription === memeDescription);
  if (exact) return exact.result;

  const norm = (s: string) => s.trim().toLowerCase();
  const fuzzy = bundle.translations.find(t => norm(t.memeDescription) === norm(memeDescription));
  if (fuzzy) return fuzzy.result;

  throw new Error(
    'Offline demo: no canned translation for this meme. ' +
      'Pick a meme that was translated in one of the exported compositions.',
  );
}
