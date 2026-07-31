/**
 * Firebase initialisation — shared singleton clients for Auth and Firestore.
 *
 * Reuses the SAME Firebase project as the sister repo `archthesis`
 * (project id: adaptivememeticarchitect-2776f). Auth is email/password,
 * matching archthesis exactly — no new sign-in method is introduced.
 *
 * All config comes from VITE_FIREBASE_* env vars (see .env.example). If those
 * vars are absent the app still runs — `isFirebaseConfigured` is false and the
 * Projects/Auth UI simply never appears, so logged-out / unconfigured users
 * get the original experience unchanged.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/**
 * True only when the minimum config needed to talk to Firebase is present.
 * Gate every Firebase-dependent feature behind this.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let authClient: Auth | null = null;
let dbClient: Firestore | null = null;
let storageClient: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig as Record<string, string>);
  authClient = getAuth(app);
  // ignoreUndefinedProperties lets us write composition snapshots that carry
  // optional fields (e.g. pass1/pass2 may be null/undefined) without manual
  // scrubbing before every write.
  dbClient = initializeFirestore(app, { ignoreUndefinedProperties: true });
  // Storage holds the full-resolution encode photos. A Firestore document
  // caps at ~1MB and already carries the assembly, so the record keeps only
  // a thumbnail; the photograph itself lives here. Absent bucket config =>
  // no client, and saves fall back to thumbnail-only (the pre-2026-07-31
  // behaviour) rather than failing.
  if (firebaseConfig.storageBucket) {
    storageClient = getStorage(app);
  }
}

/** Firebase Auth client, or null when Firebase isn't configured. */
export const auth = authClient;
/** Firestore client, or null when Firebase isn't configured. */
export const db = dbClient;
/** Firebase Storage client, or null when Firebase/the bucket isn't configured. */
export const storage = storageClient;
