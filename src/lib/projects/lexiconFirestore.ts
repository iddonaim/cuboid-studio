/**
 * Firestore CRUD for user lexicons.
 *
 * Lexicons live in a top-level `lexicons` collection, scoped by ownerId.
 * This matches the ownerId-first pattern of the projects/sites/compositions
 * hierarchy in firestore.ts.
 *
 * A lexicon document holds:
 *   - a full SpatialLexicon value (the vocabulary sent to the encoder)
 *   - light metadata: name, ownerId, timestamps
 *   - tags: free-text string array for filtering the library
 *   - descriptions: per-axis hint text shown in the editor (consequence-
 *     framed plain language explaining what editing each axis does)
 *
 * DEFAULT_LEXICON always exists as the built-in baseline; it is never stored
 * in Firestore. The null activeLexiconId in useLexiconStore means "use default."
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
import type { SpatialLexicon } from '../../prompts/lexicon.default';

export interface LexiconDoc {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  lexicon: SpatialLexicon;
  /**
   * Free-text tags for filtering the library. An architect can tag lexicons
   * e.g. "residential", "museum", "Tel Aviv" and filter by these in the library.
   */
  tags?: string[];
  /**
   * Per-axis hint text shown in the editor. Keys are axis names:
   * "atmosphere" | "light" | "emotion" | "rhythm" | "placement".
   * Seeded from DEFAULT_DESCRIPTIONS when a new lexicon is created.
   * Stored per-lexicon so architects can customise the notes.
   */
  descriptions?: Record<string, string>;
}

export type LexiconUpdatePayload = {
  name?: string;
  lexicon?: SpatialLexicon;
  tags?: string[];
  descriptions?: Record<string, string>;
};

function requireDb() {
  if (!db) throw new Error('Firestore is not configured.');
  return db;
}

export async function listLexicons(ownerId: string): Promise<LexiconDoc[]> {
  const q = query(
    collection(requireDb(), 'lexicons'),
    where('ownerId', '==', ownerId),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<LexiconDoc, 'id'>) }));
}

export async function createLexicon(
  ownerId: string,
  name: string,
  lexicon: SpatialLexicon,
  opts: { tags?: string[]; descriptions?: Record<string, string> } = {},
): Promise<LexiconDoc> {
  const now = Date.now();
  const payload: Omit<LexiconDoc, 'id'> = {
    name,
    ownerId,
    createdAt: now,
    updatedAt: now,
    lexicon,
    ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
    ...(opts.descriptions !== undefined ? { descriptions: opts.descriptions } : {}),
  };
  const ref = await addDoc(collection(requireDb(), 'lexicons'), payload);
  return { id: ref.id, ...payload };
}

export async function updateLexicon(
  id: string,
  updates: LexiconUpdatePayload,
): Promise<void> {
  await updateDoc(doc(requireDb(), 'lexicons', id), {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteLexicon(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'lexicons', id));
}
