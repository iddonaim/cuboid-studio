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
import type { EncodeSpaceResponse } from '../api/encodeSpace';
import type { EvolutionCandidate } from '../../store/useEvolutionStore';
import type { SiteContextData } from '../storage/siteContext';
import type { DemoBundle, DemoComposition, RecordedSiteAnalysis } from './types';
import { metersBetween } from './recorder';

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
  // Live-session recordings take precedence over the harvested set: they are
  // the exact strings the store sent during the recorded run.
  const pool = [...(bundle.recordings?.twoPass ?? []), ...bundle.translations];
  const exact = pool.find(t => t.memeDescription === memeDescription);
  if (exact) return exact.result;

  const norm = (s: string) => s.trim().toLowerCase();
  const fuzzy = pool.find(t => norm(t.memeDescription) === norm(memeDescription));
  if (fuzzy) return fuzzy.result;

  throw new Error(
    'Offline demo: no canned translation for this meme. ' +
      'Pick a meme that was translated in one of the exported compositions.',
  );
}

// --- Live-session replays (recorded with ?demoRecord) -----------------------

/** Rewrite one remote meme-image URL to its bundled local copy, if known. */
export async function rewriteMemeImageUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const { images } = await loadDemoBundle();
  return images[url] ?? url;
}

/**
 * Replay the recorded geocode for a typed address. Exact/normalised match
 * first; falls back to substring containment either way, and — stage
 * insurance — to the single recorded address when only one exists, so a typo
 * during the talk can't kill the beat.
 */
export async function getDemoGeocode(
  query: string,
): Promise<{ lat: number; lng: number; displayName: string }> {
  const recorded = (await loadDemoBundle()).recordings?.geocode ?? [];
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const q = norm(query);

  const hit =
    recorded.find(g => norm(g.query) === q) ??
    recorded.find(g => norm(g.query).includes(q) || q.includes(norm(g.query))) ??
    (recorded.length === 1 ? recorded[0] : undefined);

  if (!hit) {
    throw new Error(
      recorded.length === 0
        ? 'Offline demo: no recorded address. Record a session with ?demoRecord first.'
        : `Offline demo: "${query}" doesn't match a recorded address. Recorded: ${recorded
            .map(g => `"${g.query}"`)
            .join(', ')}.`,
    );
  }
  return { lat: hit.lat, lng: hit.lng, displayName: hit.displayName };
}

/**
 * Recorded site analyses, newest-recorded last. Offline the map-context iframe
 * can't run — it's a separate remote app — so these are the only source of a
 * populated Active Site Context (POIs, morphology) the demo has.
 */
export async function listDemoSiteAnalyses(): Promise<RecordedSiteAnalysis[]> {
  return (await loadDemoBundle()).recordings?.siteAnalyses ?? [];
}

/**
 * The recorded analysis nearest a point, so a site opened from a slightly
 * different pin still resolves. Null when nothing was recorded — callers
 * decide whether that's fatal, since a bundle exported before analyses were
 * recorded must still behave as it did before.
 */
export async function getDemoSiteAnalysis(
  lat: number,
  lng: number,
): Promise<SiteContextData | null> {
  const recorded = await listDemoSiteAnalyses();
  if (recorded.length === 0) return null;
  const nearest = recorded.reduce((best, s) =>
    metersBetween(s, { lat, lng }) < metersBetween(best, { lat, lng }) ? s : best,
  );
  return nearest.context;
}

/** Replay a recorded photo encode, matched by image fingerprint. */
export async function getDemoEncode(imageHash: string): Promise<EncodeSpaceResponse> {
  const recorded = (await loadDemoBundle()).recordings?.encodes ?? [];
  const hit = recorded.find(e => e.imageHash === imageHash);
  if (!hit) {
    throw new Error(
      `Offline demo: this photo has no recorded encode (${recorded.length} photo(s) were ` +
        'recorded). Pick one of the exact image files used in the ?demoRecord session.',
    );
  }
  return hit.response;
}

/**
 * Replay one recorded "Generate candidates" round. Rounds are served in click
 * order (0-based); meme thumbnails inside are rewritten to bundled copies.
 */
export async function getDemoEvolveRound(roundIndex: number): Promise<EvolutionCandidate[]> {
  const bundle = await loadDemoBundle();
  const rounds = bundle.recordings?.evolveRounds ?? [];
  if (roundIndex >= rounds.length) {
    throw new Error(
      rounds.length === 0
        ? 'Offline demo: no recorded evolve rounds. Record a session with ?demoRecord first.'
        : `Offline demo: only ${rounds.length} evolve round(s) were recorded — this is click ` +
          `${roundIndex + 1}. The choreography must match the recorded session.`,
    );
  }
  const { images } = bundle;
  return rounds[roundIndex].candidates.map(c => ({
    ...c,
    memeImageUrl: c.memeImageUrl ? (images[c.memeImageUrl] ?? c.memeImageUrl) : c.memeImageUrl,
  }));
}
