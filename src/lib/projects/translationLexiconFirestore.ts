/**
 * Firestore CRUD for user translation lexicons (Pataphysical / Evolution).
 *
 * Mirrors lexiconFirestore.ts (the Encode lexicon). Lexicons live in a
 * top-level `translationLexicons` collection, scoped by ownerId — matching the
 * ownerId-first pattern of projects/sites/compositions and the Encode lexicons.
 *
 * A document holds:
 *   - a full TranslationLexicon value (the vocabulary sent to the translator)
 *   - light metadata: name, ownerId, timestamps
 *   - tags: free-text string array for filtering the library
 *   - descriptions: per-section hint text shown in the editor
 *
 * DEFAULT_TRANSLATION_LEXICON always exists as the built-in baseline; it is
 * never stored. A null activeTranslationLexiconId means "use default."
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { TranslationLexicon } from '../../prompts/translationLexicon.default';

export interface TranslationLexiconDoc {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  lexicon: TranslationLexicon;
  /** Free-text tags for filtering the library (e.g. "ironic", "Tel Aviv"). */
  tags?: string[];
  /**
   * Per-section hint text shown in the editor. Keys are section names:
   * "rhetorical_moves" | "edge_types" | "affect_geometry" | "decay" |
   * "confidence_axes". Seeded from DEFAULT_TRANSLATION_DESCRIPTIONS on create.
   */
  descriptions?: Record<string, string>;
}

export type TranslationLexiconUpdatePayload = {
  name?: string;
  lexicon?: TranslationLexicon;
  tags?: string[];
  descriptions?: Record<string, string>;
};

function requireDb() {
  if (!db) throw new Error('Firestore is not configured.');
  return db;
}

export async function listTranslationLexicons(ownerId: string): Promise<TranslationLexiconDoc[]> {
  const q = query(
    collection(requireDb(), 'translationLexicons'),
    where('ownerId', '==', ownerId),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TranslationLexiconDoc, 'id'>) }));
}

export async function createTranslationLexicon(
  ownerId: string,
  name: string,
  lexicon: TranslationLexicon,
  opts: { tags?: string[]; descriptions?: Record<string, string> } = {},
): Promise<TranslationLexiconDoc> {
  const now = Date.now();
  const payload: Omit<TranslationLexiconDoc, 'id'> = {
    name,
    ownerId,
    createdAt: now,
    updatedAt: now,
    lexicon,
    ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
    ...(opts.descriptions !== undefined ? { descriptions: opts.descriptions } : {}),
  };
  const ref = await addDoc(collection(requireDb(), 'translationLexicons'), payload);
  return { id: ref.id, ...payload };
}

export async function updateTranslationLexicon(
  id: string,
  updates: TranslationLexiconUpdatePayload,
): Promise<void> {
  await updateDoc(doc(requireDb(), 'translationLexicons', id), {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteTranslationLexicon(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'translationLexicons', id));
}
