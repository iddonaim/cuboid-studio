/**
 * Offline demo bundle — data shapes.
 *
 * A DemoBundle is a verbatim snapshot of the presenter's real Firestore data
 * (site pins, full-circle compositions) plus the meme-browser list and the
 * canned two-pass translations derived from the saved operator records. It is
 * produced in two steps:
 *
 *   1. In the app, online + signed in, with `?demoExport` in the URL: the
 *      "Export demo bundle" button downloads `demo-bundle-raw.json`.
 *   2. `node scripts/build-demo-bundle.mjs demo-bundle-raw.json` downloads
 *      every referenced meme image into `public/demo/memes/` and writes the
 *      final `public/demo/bundle.json` with an image manifest.
 *
 * Everything under public/demo/ is picked up by the service-worker precache
 * (json/jpg/png are in globPatterns), so a previously-visited build serves the
 * whole bundle offline.
 */
import type { SitePin } from '../projects/sitePins';
import type { CompositionDoc } from '../projects/types';
import type { ArchthesisMeme } from '../../types/archthesis';
import type { TwoPassTranslationResult } from '../operators/types';
import type { EncodeSpaceResponse } from '../api/encodeSpace';
import type { EvolutionCandidate } from '../../store/useEvolutionStore';
import type { SiteContextData } from '../storage/siteContext';

/** A composition doc plus the hierarchy path it came from. */
export interface DemoComposition {
  projectId: string;
  siteId: string;
  doc: CompositionDoc;
}

/** Canned two-pass translation, keyed by the meme description that produced it. */
export interface DemoTranslation {
  /** Exact memeDescription the store sends to translateMemeTwoPass. */
  memeDescription: string;
  result: TwoPassTranslationResult;
}

// --- Live-session recordings -------------------------------------------------
// Captured with `?demoRecord` during ONE real online run of the talk workflow,
// so the demo can replay the exact same clicks offline. See lib/demo/recorder.ts.

/** A successful address-bar geocode: what was typed → where the pin landed. */
export interface RecordedGeocode {
  query: string;
  lat: number;
  lng: number;
  displayName: string;
}

/** A successful photo encode, keyed by a fingerprint of the image bytes.
 *  Merge encodes append a seed-assembly fingerprint ("<image>:seed-<hash>"),
 *  so a standalone recording never silently replays for a merge request. */
export interface RecordedEncode {
  imageHash: string;
  response: EncodeSpaceResponse;
}

/** One "Generate candidates" click: the full ranked set the AI produced. */
export interface RecordedEvolveRound {
  candidates: EvolutionCandidate[];
}

/**
 * One completed site analysis from the embedded map-context app, keyed by the
 * coordinates it was run at.
 *
 * This is the *adapted* SiteContextData, not the raw `analysis-complete`
 * payload: the raw bundle carries thousands of polygons, and the recording
 * lives in localStorage before it ever reaches the bundle file. Storing the
 * distilled context keeps it small, and it is exactly what the app persists
 * as the active site anyway.
 */
export interface RecordedSiteAnalysis {
  lat: number;
  lng: number;
  context: SiteContextData;
}

export interface DemoRecordings {
  startedAt: string;
  geocode: RecordedGeocode[];
  encodes: RecordedEncode[];
  /** In click order — replay serves round 0 on the first click, 1 on the second… */
  evolveRounds: RecordedEvolveRound[];
  /** Two-pass translations observed live (merged with the harvested ones). */
  twoPass: DemoTranslation[];
  /**
   * Completed site analyses. Optional because recordings captured before
   * these were recorded have no such array — readers must tolerate that.
   */
  siteAnalyses?: RecordedSiteAnalysis[];
}

export interface DemoBundle {
  /** Schema version for forward compatibility. */
  version: 1;
  /** When the export ran (ISO string) — provenance only. */
  exportedAt: string;
  /** Real site pins (projects → sites flattened), verbatim from Firestore. */
  pins: SitePin[];
  /** Real full-circle compositions, verbatim from Firestore. */
  compositions: DemoComposition[];
  /** Meme-browser snapshot (shape of /api/fetch-memes) for offline browsing. */
  memes: ArchthesisMeme[];
  /**
   * Canned translations harvested from the saved operator records (their
   * pass1/pass2 provenance), so a "live" translation of an already-translated
   * meme replays the real result offline.
   */
  translations: DemoTranslation[];
  /**
   * Remote URL → local path rewrites for meme images
   * (e.g. "https://firebasestorage.googleapis.com/..." → "/demo/memes/m1.jpg").
   * Applied to composition data at load time and to memes[] at build time.
   */
  images: Record<string, string>;
  /**
   * Optional live-session recordings (geocode, site analyses, encodes, evolve
   * rounds, extra two-pass translations). Absent in bundles exported before
   * the recorder existed, and individual capture kinds are absent in bundles
   * exported before that kind was recorded — every consumer must tolerate both.
   */
  recordings?: DemoRecordings;
}
