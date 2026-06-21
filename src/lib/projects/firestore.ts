/**
 * Firestore CRUD for the projects/sites/compositions hierarchy.
 *
 * All functions require a signed-in user; ownerId is enforced both here and by
 * the security rules (see firestore.rules). Timestamps are plain epoch millis
 * so they round-trip through the composition snapshot without Timestamp glue.
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  ProjectDoc,
  SiteDoc,
  CompositionDoc,
  CompositionData,
} from './types';
import type { SiteContextData } from '../storage/siteContext';

function requireDb() {
  if (!db) throw new Error('Firestore is not configured.');
  return db;
}

// --- Projects --------------------------------------------------------------

export async function listProjects(ownerId: string): Promise<ProjectDoc[]> {
  const q = query(
    collection(requireDb(), 'projects'),
    where('ownerId', '==', ownerId),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ProjectDoc, 'id'>) }));
}

export async function createProject(ownerId: string, name: string): Promise<ProjectDoc> {
  const now = Date.now();
  const payload = { name, ownerId, createdAt: now, updatedAt: now };
  const ref = await addDoc(collection(requireDb(), 'projects'), payload);
  return { id: ref.id, ...payload };
}

export async function deleteProject(projectId: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'projects', projectId));
}

/** Bump a project's updatedAt — call after writing within it. */
export async function touchProject(projectId: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'projects', projectId), { updatedAt: Date.now() });
}

// --- Sites -----------------------------------------------------------------

export async function listSites(projectId: string): Promise<SiteDoc[]> {
  const q = query(
    collection(requireDb(), 'projects', projectId, 'sites'),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<SiteDoc, 'id'>) }));
}

export async function createSite(
  projectId: string,
  name: string,
  siteContext: SiteContextData | null,
): Promise<SiteDoc> {
  const payload = { name, createdAt: Date.now(), siteContext };
  const ref = await addDoc(
    collection(requireDb(), 'projects', projectId, 'sites'),
    payload,
  );
  await touchProject(projectId);
  return { id: ref.id, ...payload };
}

export async function deleteSite(projectId: string, siteId: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'projects', projectId, 'sites', siteId));
}

/**
 * Refresh a Site's stored site context. `createSite` only seeds it once at
 * creation time, so without this, a site context set or changed afterwards
 * (e.g. via the Map tab) never makes it onto the Site document — call this
 * whenever a composition is saved so the Site stays in sync with whatever
 * context was active.
 */
export async function updateSite(
  projectId: string,
  siteId: string,
  siteContext: SiteContextData,
): Promise<void> {
  await updateDoc(doc(requireDb(), 'projects', projectId, 'sites', siteId), { siteContext });
}

// --- Compositions ----------------------------------------------------------

export async function listCompositions(
  projectId: string,
  siteId: string,
): Promise<CompositionDoc[]> {
  const q = query(
    collection(requireDb(), 'projects', projectId, 'sites', siteId, 'compositions'),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<CompositionDoc, 'id'>) }));
}

export async function createComposition(
  projectId: string,
  siteId: string,
  name: string,
  data: CompositionData,
): Promise<CompositionDoc> {
  const now = Date.now();
  const payload = { name, createdAt: now, updatedAt: now, data };
  const ref = await addDoc(
    collection(requireDb(), 'projects', projectId, 'sites', siteId, 'compositions'),
    payload,
  );
  await touchProject(projectId);
  return { id: ref.id, ...payload };
}

export async function updateComposition(
  projectId: string,
  siteId: string,
  compositionId: string,
  data: CompositionData,
): Promise<void> {
  await setDoc(
    doc(requireDb(), 'projects', projectId, 'sites', siteId, 'compositions', compositionId),
    { updatedAt: Date.now(), data },
    { merge: true },
  );
  await touchProject(projectId);
}

export async function deleteComposition(
  projectId: string,
  siteId: string,
  compositionId: string,
): Promise<void> {
  await deleteDoc(
    doc(requireDb(), 'projects', projectId, 'sites', siteId, 'compositions', compositionId),
  );
}
