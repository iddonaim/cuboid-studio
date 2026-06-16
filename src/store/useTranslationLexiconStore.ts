/**
 * useTranslationLexiconStore — manages the list of saved translation lexicons
 * and which one is active for Pataphysical / Evolution translation.
 *
 * Mirrors useLexiconStore.ts (the Encode lexicon). activeTranslationLexiconId
 * === null means "use DEFAULT_TRANSLATION_LEXICON" (the built-in baseline; never
 * stored in Firestore).
 *
 * `getActiveTranslationLexicon()` is callable via getState() from plain
 * functions (e.g. translateMeme.ts at the client send seam), so the active
 * vocabulary can be attached to a request without React hook constraints.
 *
 * The stored active id is validated on load: if it doesn't appear in the loaded
 * list (deleted, stale, wrong owner) it is silently dropped and the store falls
 * back to null (default) — preventing the silent-wrong-vocabulary trap.
 */
import { create } from 'zustand';
import {
  DEFAULT_TRANSLATION_LEXICON,
  DEFAULT_TRANSLATION_DESCRIPTIONS,
  type TranslationLexicon,
} from '../prompts/translationLexicon.default';
import {
  listTranslationLexicons,
  createTranslationLexicon as firestoreCreate,
  updateTranslationLexicon as firestoreUpdate,
  deleteTranslationLexicon as firestoreDelete,
  type TranslationLexiconDoc,
  type TranslationLexiconUpdatePayload,
} from '../lib/projects/translationLexiconFirestore';
import {
  getStoredActiveTranslationLexiconId,
  setStoredActiveTranslationLexiconId,
  clearStoredActiveTranslationLexiconId,
} from '../lib/storage/activeTranslationLexicon';

interface TranslationLexiconState {
  lexicons: TranslationLexiconDoc[];
  loading: boolean;
  /** null = use DEFAULT_TRANSLATION_LEXICON. Persisted in localStorage; validated on load. */
  activeLexiconId: string | null;

  /** Returns the full TranslationLexicon for the current active selection. */
  getActiveTranslationLexicon: () => TranslationLexicon;

  /** Load all translation lexicons for the signed-in user. Validates the
   *  stored activeLexiconId against the loaded list and resets if stale. */
  loadLexicons: (ownerId: string) => Promise<void>;

  /** Create a new named lexicon and return its document. */
  createLexicon: (
    ownerId: string,
    name: string,
    lexicon: TranslationLexicon,
    opts?: { tags?: string[]; descriptions?: Record<string, string> },
  ) => Promise<TranslationLexiconDoc>;

  /** Update an existing lexicon's fields. */
  updateLexicon: (id: string, updates: TranslationLexiconUpdatePayload) => Promise<void>;

  /** Delete a lexicon. If it was active, resets to null (default). */
  deleteLexicon: (id: string) => Promise<void>;

  /** Duplicate a lexicon under a new name. Returns the new document. */
  duplicateLexicon: (id: string, ownerId: string) => Promise<TranslationLexiconDoc>;

  /** Set which lexicon the next translation will use. Pass null for the default.
   *  Persists the choice to localStorage. */
  setActiveLexiconId: (id: string | null) => void;
}

// Read the stored id on module load (before any user interaction).
const initialStoredId = getStoredActiveTranslationLexiconId();

export const useTranslationLexiconStore = create<TranslationLexiconState>((set, get) => ({
  lexicons: [],
  loading: false,
  activeLexiconId: initialStoredId,

  getActiveTranslationLexicon: () => {
    const { lexicons, activeLexiconId } = get();
    if (!activeLexiconId) return DEFAULT_TRANSLATION_LEXICON;
    const doc = lexicons.find(l => l.id === activeLexiconId);
    return doc?.lexicon ?? DEFAULT_TRANSLATION_LEXICON;
  },

  loadLexicons: async (ownerId: string) => {
    set({ loading: true });
    try {
      const docs = await listTranslationLexicons(ownerId);
      const currentId = get().activeLexiconId;

      // Validate: the stored id must exist in the loaded list. If not (deleted,
      // stale, or belonging to a different user), fall back to null and clear
      // the stored value so the next load doesn't repeat the stale lookup.
      const isValid = currentId !== null && docs.some(l => l.id === currentId);
      const validatedId = isValid ? currentId : null;
      if (!isValid && currentId !== null) {
        clearStoredActiveTranslationLexiconId();
      }

      set({ lexicons: docs, loading: false, activeLexiconId: validatedId });
    } catch {
      set({ loading: false });
    }
  },

  createLexicon: async (ownerId, name, lexicon, opts = {}) => {
    const doc = await firestoreCreate(ownerId, name, lexicon, {
      tags: opts.tags ?? [],
      descriptions: opts.descriptions ?? { ...DEFAULT_TRANSLATION_DESCRIPTIONS },
    });
    set(s => ({ lexicons: [doc, ...s.lexicons] }));
    return doc;
  },

  updateLexicon: async (id, updates) => {
    await firestoreUpdate(id, updates);
    set(s => ({
      lexicons: s.lexicons.map(l =>
        l.id === id ? { ...l, ...updates, updatedAt: Date.now() } : l,
      ),
    }));
  },

  deleteLexicon: async (id) => {
    await firestoreDelete(id);
    const wasActive = get().activeLexiconId === id;
    set(s => ({
      lexicons: s.lexicons.filter(l => l.id !== id),
      activeLexiconId: wasActive ? null : s.activeLexiconId,
    }));
    if (wasActive) clearStoredActiveTranslationLexiconId();
  },

  duplicateLexicon: async (id, ownerId) => {
    const source = get().lexicons.find(l => l.id === id);
    if (!source) throw new Error(`Translation lexicon ${id} not found.`);
    const copy = await firestoreCreate(
      ownerId,
      `${source.name} (copy)`,
      source.lexicon,
      {
        tags: source.tags ? [...source.tags] : [],
        descriptions: source.descriptions ? { ...source.descriptions } : { ...DEFAULT_TRANSLATION_DESCRIPTIONS },
      },
    );
    set(s => ({ lexicons: [copy, ...s.lexicons] }));
    return copy;
  },

  setActiveLexiconId: (id) => {
    if (id === null) {
      clearStoredActiveTranslationLexiconId();
    } else {
      setStoredActiveTranslationLexiconId(id);
    }
    set({ activeLexiconId: id });
  },
}));
