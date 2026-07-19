/**
 * Offline demo mode — flag detection.
 *
 * Demo mode swaps the app's network-bound data transport (Firestore, Firebase
 * Storage, /api/*, tile CDNs) for an in-repo bundle under public/demo/, while
 * leaving every downstream code path (restoreComposition, the reading panel,
 * the cut) untouched. The CONTENT of the bundle is real: it is exported
 * verbatim from the live Firestore compositions.
 *
 * Enable with either:
 *   - URL query:   https://.../?demo          (presenter-friendly)
 *   - build flag:  VITE_OFFLINE_DEMO=1        (baked into a dedicated build)
 *
 * The flag is read once at module load — a mid-session URL change requires a
 * reload, which is the safe behaviour for a live talk.
 */

function detect(): boolean {
  try {
    if (import.meta.env.VITE_OFFLINE_DEMO === '1') return true;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('demo')) return true;
    }
  } catch {
    /* non-browser context (tests) — fall through */
  }
  return false;
}

const DEMO_MODE = detect();

export function isDemoMode(): boolean {
  return DEMO_MODE;
}

/** Authoring aid: shows the "Export demo bundle" button (online, signed in). */
export function isDemoExportMode(): boolean {
  try {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).has('demoExport');
    }
  } catch {
    /* ignore */
  }
  return false;
}
