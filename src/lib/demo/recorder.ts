/**
 * Demo recorder — captures ONE real online session for offline replay.
 *
 * Open the live app with `?demoRecord` and perform the talk workflow normally.
 * Every network/AI answer the demo needs (geocode, photo encode, evolve
 * candidate rounds, two-pass translations) is appended to localStorage as it
 * happens. Afterwards, the ?demoExport button folds the recording into
 * demo-bundle-raw.json (see export.ts), and demo mode replays it.
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
  DemoTranslation,
} from './types';

const STORAGE_KEY = 'cs-demo-recording';

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
  };
}

export function getRecording(): DemoRecordings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as DemoRecordings;
    // Minimal shape check so a corrupt entry can't poison the export.
    if (!Array.isArray(rec.geocode) || !Array.isArray(rec.evolveRounds)) return null;
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
