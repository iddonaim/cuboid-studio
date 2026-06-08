/**
 * Active-lexicon persistence — thin localStorage wrapper.
 *
 * Mirrors the siteContext.ts pattern: one module owns the key, nothing else
 * touches localStorage directly.
 *
 * Important: the stored id is untrusted on read. The caller (useLexiconStore)
 * must validate it against the loaded lexicon list before applying it — a
 * deleted or stale id must fall back to null (default), never silently point
 * at a ghost lexicon.
 */

const STORAGE_KEY = 'cuboid:activeLexiconId';

/** Returns the stored lexicon id, or null if nothing is stored. */
export function getStoredActiveLexiconId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persists the active lexicon id. */
export function setStoredActiveLexiconId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ignore — storage quota errors should not break encoding.
  }
}

/** Clears the stored id (back to default). */
export function clearStoredActiveLexiconId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
