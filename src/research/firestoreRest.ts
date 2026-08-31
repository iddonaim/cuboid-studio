/**
 * Firestore REST access to the shared `memes` collection — the single
 * decoder both the serverless API and the research code use, so raw-field
 * reads (the input to wire-truth content hashes) can never drift between
 * the app, the in-app frozen-state capture, and the headless harness.
 *
 * Moved here from api/fetch-memes.ts (which re-exports for compatibility):
 * the dependency direction api → src is the established one, and the in-app
 * capture (browser) needs these too. Behavior unchanged.
 */

export const PROJECT_ID = 'adaptivememeticarchitect-2776f';
export const API_KEY = 'AIzaSyCsb6uQgANSQSnCp6kPhFX7I3TG_PQCd3o';
export const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** Extract a typed value from a Firestore REST API field */
export function extractValue(field: any): any {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(extractValue);
  if ('mapValue' in field) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) {
      result[k] = extractValue(v);
    }
    return result;
  }
  if ('nullValue' in field) return null;
  return undefined;
}

/**
 * Fetches one meme document's RAW stored fields (no declared-type defaults
 * injected) — exactly what wire-truth content hashing consumes. Works in
 * the browser (public-read rules; only the web API key) and in Node.
 */
export async function fetchRawMemeFields(memeId: string): Promise<Record<string, unknown>> {
  const url = `${FIRESTORE_URL}/memes/${encodeURIComponent(memeId)}?key=${API_KEY}`;
  const response = await fetch(url);
  if (response.status === 404) {
    throw new Error(`meme ${memeId} no longer exists in the memes collection`);
  }
  if (!response.ok) {
    throw new Error(`fetching meme ${memeId} failed (HTTP ${response.status})`);
  }
  const doc = (await response.json()) as { fields?: Record<string, unknown> };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.fields || {})) {
    out[key] = extractValue(value);
  }
  return out;
}
