/**
 * useLexiconStore — manages the list of saved lexicons and which one is active.
 *
 * activeLexiconId === null means "use DEFAULT_LEXICON" (always the built-in
 * baseline; it is never stored in Firestore).
 *
 * The store holds all Firestore CRUD for lexicons so that any component or
 * store action can get/set the active lexicon without React hook constraints.
 * `getActiveLexicon()` is callable via getState() from plain functions
 * (e.g. encodeSpace.ts at the client send seam).
 */
import { create } from 'zustand';
import { DEFAULT_LEXICON, type SpatialLexicon } from '../prompts/lexicon.default';
import {
  listLexicons,
  createLexicon as firestoreCreateLexicon,
  updateLexicon as firestoreUpdateLexicon,
  deleteLexicon as firestoreDeleteLexicon,
  type LexiconDoc,
} from '../lib/projects/lexiconFirestore';

interface LexiconState {
  lexicons: LexiconDoc[];
  loading: boolean;
  /** null = use DEFAULT_LEXICON. */
  activeLexiconId: string | null;

  /** Returns the full SpatialLexicon for the current active selection. */
  getActiveLexicon: () => SpatialLexicon;

  /** Load all lexicons for the signed-in user from Firestore. */
  loadLexicons: (ownerId: string) => Promise<void>;

  /** Create a new named lexicon and return its document. */
  createLexicon: (ownerId: string, name: string, lexicon: SpatialLexicon) => Promise<LexiconDoc>;

  /** Update an existing lexicon's name and/or vocabulary. */
  updateLexicon: (id: string, updates: { name?: string; lexicon?: SpatialLexicon }) => Promise<void>;

  /** Delete a lexicon. If it was active, resets to null (default). */
  deleteLexicon: (id: string) => Promise<void>;

  /** Set which lexicon the next encode will use. Pass null for DEFAULT_LEXICON. */
  setActiveLexiconId: (id: string | null) => void;
}

export const useLexiconStore = create<LexiconState>((set, get) => ({
  lexicons: [],
  loading: false,
  activeLexiconId: null,

  getActiveLexicon: () => {
    const { lexicons, activeLexiconId } = get();
    if (!activeLexiconId) return DEFAULT_LEXICON;
    const doc = lexicons.find(l => l.id === activeLexiconId);
    return doc?.lexicon ?? DEFAULT_LEXICON;
  },

  loadLexicons: async (ownerId: string) => {
    set({ loading: true });
    try {
      const docs = await listLexicons(ownerId);
      set({ lexicons: docs, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createLexicon: async (ownerId, name, lexicon) => {
    const doc = await firestoreCreateLexicon(ownerId, name, lexicon);
    set(s => ({ lexicons: [doc, ...s.lexicons] }));
    return doc;
  },

  updateLexicon: async (id, updates) => {
    await firestoreUpdateLexicon(id, updates);
    set(s => ({
      lexicons: s.lexicons.map(l =>
        l.id === id
          ? { ...l, ...updates, updatedAt: Date.now() }
          : l,
      ),
    }));
  },

  deleteLexicon: async (id) => {
    await firestoreDeleteLexicon(id);
    set(s => ({
      lexicons: s.lexicons.filter(l => l.id !== id),
      activeLexiconId: s.activeLexiconId === id ? null : s.activeLexiconId,
    }));
  },

  setActiveLexiconId: (id) => set({ activeLexiconId: id }),
}));
