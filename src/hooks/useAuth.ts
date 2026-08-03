/**
 * useAuth — thin wrapper around Firebase Auth (email/password).
 *
 * Matches the archthesis auth surface exactly: signInWithEmailAndPassword,
 * signOut, onAuthStateChanged. No sign-up here — accounts are provisioned in
 * archthesis; Cuboid Studio only signs existing users in.
 *
 * Exposes { user, signIn, signOut, loading, error }. When Firebase is not
 * configured, `user` stays null and `loading` resolves to false immediately,
 * so callers can safely render nothing.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../lib/firebase';

/** How long to wait for Firebase's first auth state before showing the
 *  signed-out UI anyway. Long enough for a cold start on a slow connection,
 *  short enough that a wedged storage layer doesn't hide sign-in for good. */
const AUTH_READY_TIMEOUT_MS = 8000;

interface UseAuthResult {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  // Start in loading state only when there's a real auth client to wait on.
  const [loading, setLoading] = useState<boolean>(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    // `loading` gates the entire account cluster — AuthControls renders
    // nothing at all while it is true — so it has to resolve even when
    // Firebase cannot answer. Auth persistence sits on IndexedDB, which
    // WebKit (every iOS/iPadOS browser, Chrome included) restricts in Private
    // Browsing and Lockdown Mode; when it's unavailable the observer can
    // error, or simply never call back. Either way the old code left loading
    // pinned true forever and the "Sign in" button never appeared.
    const unsubscribe = onAuthStateChanged(
      auth,
      (u) => {
        setUser(u);
        setLoading(false);
      },
      (err) => {
        console.error('Firebase auth state listener failed:', err);
        setUser(null);
        setLoading(false);
      },
    );
    // Belt and braces for the "never calls back" case: fall through to the
    // signed-out UI rather than hiding the account controls indefinitely. A
    // late-arriving auth state still flips the UI when it lands.
    const timer = setTimeout(() => setLoading(false), AUTH_READY_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!auth) {
      setError('Sign-in is unavailable — Firebase is not configured.');
      return;
    }
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      // Firebase error messages are noisy; surface a friendly line.
      const code = (err as { code?: string }).code ?? '';
      const message =
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
          ? 'Incorrect email or password.'
          : code === 'auth/invalid-email'
            ? 'That email address looks invalid.'
            : 'Sign-in failed. Please try again.';
      setError(message);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    setError(null);
    await firebaseSignOut(auth);
  }, []);

  return { user, loading, error, signIn, signOut };
}
