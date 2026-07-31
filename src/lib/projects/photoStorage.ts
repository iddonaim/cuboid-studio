/**
 * Full-resolution encode photos in Firebase Storage.
 *
 * A composition document keeps only a 240px thumbnail of each photo — a
 * Firestore document caps at ~1MB and the assembly, operator history and
 * readings already live in there. That made saved photographs a visual
 * reminder rather than a record: reopening a composition could not give the
 * photo back, and re-encoding always demanded a re-upload.
 *
 * The photograph is primary source material for the thesis, so the real file
 * is uploaded here and the document stores only its path. On restore the path
 * resolves to a download URL, the bytes come back as base64, and the encode
 * pipeline sees exactly what it saw the first time.
 *
 * Every function degrades rather than throws: with no bucket configured (or a
 * failed upload/fetch) callers keep the thumbnail-only behaviour, which is
 * what the app did before this existed.
 */
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from '../firebase';

/**
 * Everything this app stores lives under one owner-scoped prefix:
 *
 *   cuboidStudio/{ownerId}/photos/…    encode photographs
 *   cuboidStudio/{ownerId}/captures/…  viewport captures (when added)
 *
 * One namespace keeps the bucket's rules to a single recursive block — the
 * bucket is shared with archthesis (`memes/…`), and every extra top-level
 * prefix would mean another hand-published rule.
 */
const STORAGE_ROOT = 'cuboidStudio';

/** True when full-resolution photos can be stored (bucket configured). */
export function isPhotoStorageAvailable(): boolean {
  return storage !== null;
}

function extensionFor(mediaType: string): string {
  return mediaType === 'image/png' ? 'png' : 'jpg';
}

function base64ToBlob(base64: string, mediaType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on a
  // multi-megabyte photo.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Upload one photo's base64 payload. Returns its storage path, or null when
 * storage is unavailable or the upload failed — the caller then saves the
 * thumbnail alone rather than losing the whole composition.
 */
export async function uploadPhoto(
  ownerId: string,
  base64: string,
  mediaType: string,
): Promise<string | null> {
  if (!storage || !base64) return null;
  try {
    const name = `${crypto.randomUUID()}.${extensionFor(mediaType)}`;
    const path = `${STORAGE_ROOT}/${ownerId}/photos/${name}`;
    await uploadBytes(ref(storage, path), base64ToBlob(base64, mediaType), {
      contentType: mediaType,
    });
    return path;
  } catch (err) {
    console.error('Photo upload failed — saving thumbnail only:', err);
    return null;
  }
}

/**
 * Fetch a stored photo back as base64 + media type. Null when storage is
 * unavailable, the object is gone, or the download failed; the caller then
 * shows the thumbnail and asks for a re-upload before encoding.
 */
export async function fetchPhoto(
  path: string,
): Promise<{ base64: string; mediaType: string } | null> {
  if (!storage || !path) return null;
  try {
    // Resolving through the SDK (rather than storing a URL in the document)
    // keeps the access check on every read and can't go stale.
    const url = await getDownloadURL(ref(storage, path));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return {
      base64: await blobToBase64(blob),
      mediaType: blob.type || 'image/jpeg',
    };
  } catch (err) {
    console.error('Photo download failed — falling back to thumbnail:', err);
    return null;
  }
}

/**
 * Upload a viewport capture (already a stamped PNG blob). Returns its storage
 * path, or null when storage is unavailable or the upload failed — the caller
 * then tells the architect the capture wasn't kept rather than pretending.
 */
export async function uploadCapture(
  ownerId: string,
  blob: Blob,
): Promise<string | null> {
  if (!storage || !ownerId) return null;
  try {
    const path = `${STORAGE_ROOT}/${ownerId}/captures/${crypto.randomUUID()}.png`;
    await uploadBytes(ref(storage, path), blob, { contentType: 'image/png' });
    return path;
  } catch (err) {
    console.error('Capture upload failed:', err);
    return null;
  }
}

/**
 * A URL for displaying a stored file directly (gallery `<img src>`), rather
 * than pulling the bytes into memory as base64. Null when unavailable.
 */
export async function getFileUrl(path: string): Promise<string | null> {
  if (!storage || !path) return null;
  try {
    return await getDownloadURL(ref(storage, path));
  } catch (err) {
    console.error('Could not resolve stored file:', path, err);
    return null;
  }
}

/** Raw bytes of a stored file — for the zip export and Decode hand-off. */
export async function fetchFileBlob(path: string): Promise<Blob | null> {
  const url = await getFileUrl(path);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
  } catch (err) {
    console.error('Could not download stored file:', path, err);
    return null;
  }
}

/** Best-effort cleanup when a composition is deleted. Never throws. */
export async function deletePhotos(paths: string[]): Promise<void> {
  if (!storage || paths.length === 0) return;
  await Promise.all(
    paths.map(async path => {
      try {
        await deleteObject(ref(storage!, path));
      } catch (err) {
        // An already-deleted object (or one a rule now refuses) must not stop
        // the composition delete the user actually asked for.
        console.warn('Could not delete stored photo:', path, err);
      }
    }),
  );
}
