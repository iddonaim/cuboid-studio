/**
 * Firebase Admin SDK initialization for reading archthesis Firestore.
 * Used by Vercel serverless functions only (not client-side).
 *
 * Requires env var: ARCHTHESIS_FIREBASE_SERVICE_ACCOUNT (JSON string)
 * Fallback project ID: ARCHTHESIS_FIREBASE_PROJECT_ID
 */
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | undefined;
let db: Firestore | undefined;

export function getArchthesisFirestore(): Firestore {
  if (db) return db;

  const serviceAccountJson = process.env.ARCHTHESIS_FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.ARCHTHESIS_FIREBASE_PROJECT_ID || 'adaptivememeticarchitect-2776f';

  if (!serviceAccountJson) {
    throw new Error(
      'ARCHTHESIS_FIREBASE_SERVICE_ACCOUNT env var is not set. ' +
      'Generate a service account key from Firebase Console → Project Settings → Service Accounts.'
    );
  }

  const existing = getApps().find(a => a.name === 'archthesis');
  if (existing) {
    app = existing;
  } else {
    const serviceAccount = JSON.parse(serviceAccountJson);
    app = initializeApp({
      credential: cert(serviceAccount),
      projectId,
    }, 'archthesis');
  }

  db = getFirestore(app);
  return db;
}
