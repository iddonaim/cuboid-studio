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
}
