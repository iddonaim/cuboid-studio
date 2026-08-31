/**
 * Headless Firebase init for the research harness.
 *
 * The app's src/lib/firebase.ts reads import.meta.env (Vite-only), so the
 * harness initializes its own app from process.env and signs in as the
 * research identity — a normal Firebase user carrying the `research: true`
 * custom claim (see firestore.rules). The client SDK is used deliberately
 * instead of firebase-admin: admin credentials bypass security rules, and the
 * append-only guarantee should hold server-side even for the researcher.
 *
 * Env:
 *   VITE_FIREBASE_API_KEY / FIREBASE_API_KEY
 *   VITE_FIREBASE_PROJECT_ID / FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_AUTH_DOMAIN / FIREBASE_AUTH_DOMAIN (optional)
 *   RESEARCH_USER_EMAIL, RESEARCH_USER_PASSWORD
 *   FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST (optional —
 *     emulator runs skip the research sign-in requirement)
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

function env(name: string): string | undefined {
  return process.env[`VITE_${name}`] ?? process.env[name];
}

export interface HeadlessFirebase {
  app: FirebaseApp;
  db: Firestore;
}

export async function initHeadlessFirebase(): Promise<HeadlessFirebase> {
  const apiKey = env('FIREBASE_API_KEY');
  const projectId = env('FIREBASE_PROJECT_ID');
  if (!apiKey || !projectId) {
    throw new Error(
      'Firebase env missing: set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID (or the unprefixed forms)',
    );
  }

  const app = initializeApp({
    apiKey,
    projectId,
    authDomain: env('FIREBASE_AUTH_DOMAIN') ?? `${projectId}.firebaseapp.com`,
  });
  const db = getFirestore(app);

  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (firestoreEmulator) {
    const [host, port] = firestoreEmulator.split(':');
    connectFirestoreEmulator(db, host, Number(port));
  }

  const auth = getAuth(app);
  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (authEmulator) {
    connectAuthEmulator(auth, `http://${authEmulator}`, { disableWarnings: true });
  }

  const email = process.env.RESEARCH_USER_EMAIL;
  const password = process.env.RESEARCH_USER_PASSWORD;
  if (email && password) {
    await signInWithEmailAndPassword(auth, email, password);
  } else if (!firestoreEmulator) {
    throw new Error(
      'RESEARCH_USER_EMAIL / RESEARCH_USER_PASSWORD are required against the live project ' +
      '(the research_records rules only allow the research identity to write)',
    );
  }

  return { app, db };
}
