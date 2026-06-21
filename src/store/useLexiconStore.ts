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
 *
 * Active-lexicon persistence:
 *   activeLexiconId is read from localStorage on init and persisted on every
 *   change. On loadLexicons the stored id is validated: if it doesn't appear
 *   in the loaded list (deleted, stale, wrong owner) it is silently dropped
 *   and the store falls back to null (DEFAULT_LEXICON). This prevents the
 *   silent-wrong-result trap where the architect encodes on the default after
 *   assuming their custom lexicon was active.
 */
import { create } from 'zustand';
import { useToastStore } from './useToastStore';
import { DEFAULT_LEXICON, type SpatialLexicon } from '../prompts/lexicon.default';
import {
  listLexicons,
  createLexicon as firestoreCreateLexicon,
  updateLexicon as firestoreUpdateLexicon,
  deleteLexicon as firestoreDeleteLexicon,
  type LexiconDoc,
  type LexiconUpdatePayload,
} from '../lib/projects/lexiconFirestore';
import {
  getStoredActiveLexiconId,
  setStoredActiveLexiconId,
  clearStoredActiveLexiconId,
} from '../lib/storage/activeLexicon';

// ---------------------------------------------------------------------------
// Default per-axis hint text — consequence-framed for architects, not coders.

export const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  atmosphere:
    'Editing these labels shifts how the engine reads the density and compression of a space. Different words will pull readings toward different variation bands (dense vs. fragmented), directly changing which cube combinations get proposed.',
  light:
    'These labels shape how the engine reads lighting quality and material richness. The poles anchor the reading axis; the trigger labels below also drive which mixing rules fire in the grammar. Changing any of them changes how the same photo is interpreted for material variation in the assembly.',
  emotion:
    'These labels set the emotional register the engine reads. The poles anchor the calm-to-energetic axis. The melancholic label is a separate override — it fires regardless of position when the space reads as abandoned or desolate. Changing these shifts what emotional character the engine can detect.',
  rhythm:
    'These options are the spatial arrangement types the engine can name. The trigger describes when an option fires; the label is the word used in the reading. Adding a new option opens a new pattern the engine can detect. Unknown option ids from the model are never rejected.',
  placement:
    'These options define how cubes can be arranged spatially. The trigger describes the spatial condition; the label names it in the reading. Adding a new option gives the engine a new arrangement type to propose.',
};

// ---------------------------------------------------------------------------

interface LexiconState {
  lexicons: LexiconDoc[];
  loading: boolean;
  /** null = use DEFAULT_LEXICON. Persisted in localStorage; validated on load. */
  activeLexiconId: string | null;

  /** Returns the full SpatialLexicon for the current active selection. */
  getActiveLexicon: () => SpatialLexicon;

  /** Load all lexicons for the signed-in user from Firestore. Validates the
   *  stored activeLexiconId against the loaded list and resets if stale. */
  loadLexicons: (ownerId: string) => Promise<void>;

  /** Create a new named lexicon and return its document. */
  createLexicon: (
    ownerId: string,
    name: string,
    lexicon: SpatialLexicon,
    opts?: { tags?: string[]; descriptions?: Record<string, string> },
  ) => Promise<LexiconDoc>;

  /** Update an existing lexicon's fields. */
  updateLexicon: (id: string, updates: LexiconUpdatePayload) => Promise<void>;

  /** Delete a lexicon. If it was active, resets to null (default). */
  deleteLexicon: (id: string) => Promise<void>;

  /** Duplicate a lexicon under a new name. Returns the new document. */
  duplicateLexicon: (id: string, ownerId: string) => Promise<LexiconDoc>;

  /** Set which lexicon the next encode will use. Pass null for DEFAULT_LEXICON.
   *  Persists the choice to localStorage. */
  setActiveLexiconId: (id: string | null) => void;
}

// Read the stored id on module load (before any user interaction).
const initialStoredId = getStoredActiveLexiconId();

export const useLexiconStore = create<LexiconState>((set, get) => ({
  lexicons: [],
  loading: false,
  // Start with the stored id — it will be validated once lexicons are loaded.
  activeLexiconId: initialStoredId,

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
      const currentId = get().activeLexiconId;

      // Validate: the stored id must exist in the loaded list. If not (deleted,
      // stale, or belonging to a different user), fall back to null and clear
      // the stored value so the next load doesn't repeat the stale lookup.
      const isValid = currentId !== null && docs.some(l => l.id === currentId);
      const validatedId = isValid ? currentId : null;
      if (!isValid && currentId !== null) {
        clearStoredActiveLexiconId();
      }

      set({ lexicons: docs, loading: false, activeLexiconId: validatedId });
    } catch (err) {
      console.error(err);
      useToastStore.getState().showToast('Could not load lexicons', 'error');
      set({ loading: false });
    }
  },

  createLexicon: async (ownerId, name, lexicon, opts = {}) => {
    const doc = await firestoreCreateLexicon(ownerId, name, lexicon, {
      tags: opts.tags ?? [],
      descriptions: opts.descriptions ?? { ...DEFAULT_DESCRIPTIONS },
    });
    set(s => ({ lexicons: [doc, ...s.lexicons] }));
    return doc;
  },

  updateLexicon: async (id, updates) => {
    await firestoreUpdateLexicon(id, updates);
    set(s => ({
      lexicons: s.lexicons.map(l =>
        l.id === id
          ? {
              ...l,
              ...updates,
              updatedAt: Date.now(),
            }
          : l,
      ),
    }));
  },

  deleteLexicon: async (id) => {
    await firestoreDeleteLexicon(id);
    const wasActive = get().activeLexiconId === id;
    set(s => ({
      lexicons: s.lexicons.filter(l => l.id !== id),
      activeLexiconId: wasActive ? null : s.activeLexiconId,
    }));
    if (wasActive) clearStoredActiveLexiconId();
  },

  duplicateLexicon: async (id, ownerId) => {
    const source = get().lexicons.find(l => l.id === id);
    if (!source) throw new Error(`Lexicon ${id} not found.`);
    const copy = await firestoreCreateLexicon(
      ownerId,
      `${source.name} (copy)`,
      source.lexicon,
      {
        tags: source.tags ? [...source.tags] : [],
        descriptions: source.descriptions ? { ...source.descriptions } : { ...DEFAULT_DESCRIPTIONS },
      },
    );
    set(s => ({ lexicons: [copy, ...s.lexicons] }));
    return copy;
  },

  setActiveLexiconId: (id) => {
    if (id === null) {
      clearStoredActiveLexiconId();
    } else {
      setStoredActiveLexiconId(id);
    }
    set({ activeLexiconId: id });
  },
}));
