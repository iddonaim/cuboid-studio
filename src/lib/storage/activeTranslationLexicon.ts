/**
 * Active translation-lexicon persistence — thin localStorage wrapper.
 *
 * Mirrors activeLexicon.ts (the Encode lexicon). One module owns the key;
 * nothing else touches localStorage for this value.
 *
 * The stored id is untrusted on read. The caller (useTranslationLexiconStore)
 * must validate it against the loaded list before applying it — a deleted or
 * stale id must fall back to null (the built-in default), never silently point
 * at a ghost lexicon (the silent-wrong-vocabulary trap).
 */

const STORAGE_KEY = 'cuboid:activeTranslationLexiconId';

/** Returns the stored translation-lexicon id, or null if nothing is stored. */
export function getStoredActiveTranslationLexiconId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persists the active translation-lexicon id. */
export function setStoredActiveTranslationLexiconId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ignore — storage quota errors should not break translation.
  }
}

/** Clears the stored id (back to the built-in default). */
export function clearStoredActiveTranslationLexiconId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
