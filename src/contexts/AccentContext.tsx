/**
 * AccentContext — React state for the user-chosen accent color.
 *
 * Holds the current accent, applies it to the document's CSS variables, and
 * persists it on the device. Non-React code should read the accent through the
 * store in `lib/theme/accent` (getAccent / subscribeAccent); React components
 * use `useAccent()` so they re-render when the accent changes.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';
import {
  CANONICAL_ACCENT,
  applyAccent,
  loadStoredAccent,
  storeAccent,
} from '../lib/theme/accent';

interface AccentContextValue {
  /** Current accent as a hex string. */
  accent: string;
  /** Set a new accent (applies + persists on the device). */
  setAccent: (hex: string) => void;
  /** Restore the default drafting vermilion. */
  resetAccent: () => void;
}

const AccentContext = createContext<AccentContextValue>({
  accent: CANONICAL_ACCENT,
  setAccent: () => {},
  resetAccent: () => {},
});

export const AccentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [accent, setAccentState] = useState<string>(() => loadStoredAccent());

  // Keep the document in sync before paint. main.tsx also applies the stored
  // accent before React mounts, so there is no first-frame flash.
  useLayoutEffect(() => {
    applyAccent(accent);
  }, [accent]);

  const setAccent = useCallback((hex: string) => {
    storeAccent(hex);
    setAccentState(hex);
  }, []);

  const resetAccent = useCallback(() => setAccent(CANONICAL_ACCENT), [setAccent]);

  return (
    <AccentContext.Provider value={{ accent, setAccent, resetAccent }}>
      {children}
    </AccentContext.Provider>
  );
};

export function useAccent(): AccentContextValue {
  return useContext(AccentContext);
}
