import { create } from 'zustand';

/**
 * Primary nav modes that have a mounted UI today.
 *
 * The wider workflow spine is Map -> Encode -> Evolution -> Decode (see
 * NAV_SLOTS below). Map and Decode are reserved as future tabs and are not
 * mounted yet; only `'encoding'` and `'evolution'` are valid AppMode values
 * at runtime.
 */
export type AppMode = 'encoding' | 'evolution';

/**
 * Ordered named-slot config for the primary navigation.
 *
 * Each slot has a fixed position in the workflow spine. Slots with
 * `mounted: false` are reserved positions whose components don't exist yet;
 * they are filtered out at render time so the user only sees built tabs.
 *
 * Adding Map or Decode later = flip `mounted: true` for that slot and wire
 * its content in App.tsx / Viewport3D.tsx. No reorder, no nav restructure.
 */
export interface NavSlot {
  key: 'map' | 'encoding' | 'evolution' | 'decode';
  label: string;
  mounted: boolean;
}

export const NAV_SLOTS: readonly NavSlot[] = [
  { key: 'map',       label: 'Map',       mounted: false },
  { key: 'encoding',  label: 'Encode',    mounted: true  },
  { key: 'evolution', label: 'Evolution', mounted: true  },
  { key: 'decode',    label: 'Decode',    mounted: false },
] as const;

/** Slots actually rendered as tabs right now (mounted=true). */
export const VISIBLE_NAV_SLOTS: readonly NavSlot[] = NAV_SLOTS.filter(s => s.mounted);

interface AppState {
  activeMode: AppMode;
  setActiveMode: (mode: AppMode) => void;
  floatingPanelOpen: boolean;
  toggleFloatingPanel: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeMode: 'encoding',
  setActiveMode: (mode) => set({ activeMode: mode }),
  floatingPanelOpen: true,
  toggleFloatingPanel: () => set(s => ({ floatingPanelOpen: !s.floatingPanelOpen })),
}));
