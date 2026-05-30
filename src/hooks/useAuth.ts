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
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
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
