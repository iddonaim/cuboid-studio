/**
 * Demo recorder — captures ONE real online session for offline replay.
 *
 * Open the live app with `?demoRecord` and perform the talk workflow normally.
 * Every network/AI answer the demo needs (the map-context site analysis, the
 * "My sites" address search, photo encode, evolve candidate rounds, two-pass
 * translations) is appended to localStorage as it happens. Afterwards, the
 * ?demoExport button folds the recording into demo-bundle-raw.json (see
 * export.ts), and demo mode replays it.
 *
 * The recording survives reloads and accumulates across ?demoRecord visits in
 * the same browser; re-recording a beat just appends. Use clearRecording()
 * from the console (or a fresh browser profile) to start over.
 */
import type {
  DemoRecordings,
  RecordedGeocode,
  RecordedEncode,
  RecordedEvolveRound,
  RecordedSiteAnalysis,
  DemoTranslation,
} from './types';

const STORAGE_KEY = 'cs-demo-recording';

/**
 * Two analyses count as the same site within this distance (metres). Running
 * the same address twice can land a few metres apart — map-context re-geocodes
 * the address string rather than trusting the picked suggestion — and that
 * shouldn't stack duplicate captures.
 */
const SAME_SITE_METERS = 50;

/** Flat-earth distance in metres — exact enough at neighbourhood scale. */
export function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const latMeters = (a.lat - b.lat) * 111_320;
  const lngMeters = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(latMeters, lngMeters);
}

export function isDemoRecordMode(): boolean {
  try {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).has('demoRecord');
    }
  } catch {
    /* non-browser context */
  }
  return false;
}

function emptyRecording(): DemoRecordings {
  return {
    startedAt: new Date().toISOString(),
    geocode: [],
    encodes: [],
    evolveRounds: [],
    twoPass: [],
    siteAnalyses: [],
  };
}

export function getRecording(): DemoRecordings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as DemoRecordings;
    // Minimal shape check so a corrupt entry can't poison the export.
    if (!Array.isArray(rec.geocode) || !Array.isArray(rec.evolveRounds)) return null;
    // A recording started before a capture kind existed has no array for it.
    // Backfill so appending to it can't throw mid-talk and the export always
    // carries a well-formed shape.
    if (!Array.isArray(rec.siteAnalyses)) rec.siteAnalyses = [];
    return rec;
  } catch {
    return null;
  }
}

export function clearRecording(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function save(rec: DemoRecordings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch (err) {
    // Quota — surface loudly in the console; the presenter is recording ON
    // PURPOSE and silent loss here means a broken beat on stage.
    console.error('[demoRecord] failed to persist recording:', err);
  }
}

function append(mutate: (rec: DemoRecordings) => void): void {
  const rec = getRecording() ?? emptyRecording();
  mutate(rec);
  save(rec);
}

export function recordGeocode(entry: RecordedGeocode): void {
  append(rec => {
    // Re-typing the same address overwrites rather than duplicates.
    rec.geocode = rec.geocode.filter(g => g.query !== entry.query);
    rec.geocode.push(entry);
  });
  console.info(`[demoRecord] geocode captured: "${entry.query}"`);
}

export function recordEncode(entry: RecordedEncode): void {
  append(rec => {
    rec.encodes = rec.encodes.filter(e => e.imageHash !== entry.imageHash);
    rec.encodes.push(entry);
  });
  console.info(`[demoRecord] encode captured (photo ${entry.imageHash})`);
}

export function recordEvolveRound(entry: RecordedEvolveRound): void {
  append(rec => {
    rec.evolveRounds.push(entry);
  });
  console.info(
    `[demoRecord] evolve round ${getRecording()?.evolveRounds.length ?? '?'} captured ` +
      `(${entry.candidates.length} candidates)`,
  );
}

export function recordSiteAnalysis(entry: RecordedSiteAnalysis): void {
  append(rec => {
    // Re-running the analysis on the same spot (give or take a few metres)
    // overwrites rather than duplicates.
    rec.siteAnalyses = (rec.siteAnalyses ?? []).filter(
      s => metersBetween(s, entry) > SAME_SITE_METERS,
    );
    rec.siteAnalyses.push(entry);
  });
  const pois = entry.context.nearby_pois;
  const counted = pois
    ? `${pois.transit.length} transit / ${pois.education.length} education / ${pois.civic.length} civic`
    : 'no POIs in payload';
  console.info(
    `[demoRecord] site analysis captured: "${entry.context.site_name}" ` +
      `(${entry.lat.toFixed(4)}, ${entry.lng.toFixed(4)} — ${counted})`,
  );
}

export function recordTwoPass(entry: DemoTranslation): void {
  append(rec => {
    rec.twoPass = rec.twoPass.filter(t => t.memeDescription !== entry.memeDescription);
    rec.twoPass.push(entry);
  });
  console.info(`[demoRecord] two-pass translation captured`);
}

/**
 * Fingerprint an image for encode replay: FNV-1a over the base64 payload.
 * Stable across sessions for identical bytes; fast enough (~ms) for photos.
 */
export function hashImageBase64(base64: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < base64.length; i++) {
    h ^= base64.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
