import { create } from 'zustand';

/**
 * Primary nav modes that have a mounted UI today.
 *
 * The wider workflow spine is Map -> Encode -> Evolution -> Decode (see
 * NAV_SLOTS below). Map and Decode are reserved as future tabs and are not
 * mounted yet; Map is still reserved.
 */
export type AppMode = 'map' | 'encoding' | 'evolution' | 'decode';

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
  { key: 'map',       label: 'Map',       mounted: true },
  { key: 'encoding',  label: 'Encode',    mounted: true  },
  { key: 'evolution', label: 'Evolution', mounted: true  },
  { key: 'decode',    label: 'Decode',    mounted: true  },
] as const;

/** Slots actually rendered as tabs right now (mounted=true). */
export const VISIBLE_NAV_SLOTS: readonly NavSlot[] = NAV_SLOTS.filter(s => s.mounted);

/** Map tab sub-view: the site-analysis iframe or the signed-in "My sites" layer. */
export type MapView = 'analyze' | 'sites';

interface AppState {
  activeMode: AppMode;
  setActiveMode: (mode: AppMode) => void;
  /** Which layer the Map tab shows. Lives here so the TopBar can render the
   *  switch without floating anything over the map-context iframe. */
  mapView: MapView;
  setMapView: (view: MapView) => void;
  /** Set when the map-context iframe reports a fresh analysis. Drives the
   *  "Go to Encode" handoff button in the TopBar — it lives in app chrome
   *  rather than floating over the map, which would cover the map's own UI. */
  siteAnalysisReady: boolean;
  setSiteAnalysisReady: (ready: boolean) => void;
  floatingPanelOpen: boolean;
  toggleFloatingPanel: () => void;
  /** Onboarding showcase modal — auto-opens on first ever visit. */
  onboardingOpen: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  /** Interactive guided tour — spotlights live UI elements step by step. */
  tourActive: boolean;
  startTour: () => void;
  endTour: () => void;
  /** Width of the docked sidebar (desktop), persisted across sessions. */
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  /** True orthographic projection in the main 3D viewport. */
  orthographic: boolean;
  /**
   * Where the 3D viewport was last looking, recorded whenever an orbit, pan,
   * zoom or view-cube snap settles. Lets a secondary view — the Decode corner
   * preview — adopt the angle you set up in the real viewport instead of
   * offering its own camera controls to get lost in.
   *
   * Direction (unit, from target toward the camera) and target only: distance
   * is left to whoever renders it, since a framing chosen for a full-bleed
   * canvas means nothing in a 224px thumbnail.
   */
  lastViewpoint: { direction: [number, number, number]; target: [number, number, number] } | null;
  setLastViewpoint: (
    viewpoint: { direction: [number, number, number]; target: [number, number, number] },
  ) => void;
  setOrthographic: (value: boolean) => void;
  toggleOrthographic: () => void;
}

export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_WIDTH_KEY = 'cs-sidebar-width';
const SIDEBAR_DEFAULT_WIDTH = 340;

function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)));
}

function loadSidebarWidth(): number {
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(stored) && stored >= SIDEBAR_MIN_WIDTH && stored <= SIDEBAR_MAX_WIDTH) {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR, privacy mode) — fall through to default
  }
  return SIDEBAR_DEFAULT_WIDTH;
}

const ONBOARDING_SEEN_KEY = 'cs-onboarding-seen';

function onboardingSeen(): boolean {
  try { return localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'; } catch { return true; }
}

export const useAppStore = create<AppState>((set) => ({
  activeMode: 'encoding',
  setActiveMode: (mode) => set({ activeMode: mode }),
  mapView: 'analyze',
  setMapView: (view) => set({ mapView: view }),
  siteAnalysisReady: false,
  setSiteAnalysisReady: (ready) => set({ siteAnalysisReady: ready }),
  floatingPanelOpen: true,
  toggleFloatingPanel: () => set(s => ({ floatingPanelOpen: !s.floatingPanelOpen })),
  onboardingOpen: !onboardingSeen(),
  openOnboarding: () => set({ onboardingOpen: true }),
  closeOnboarding: () => {
    try { localStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch { /* ignore */ }
    set({ onboardingOpen: false });
  },
  tourActive: false,
  startTour: () => {
    // Launching the tour counts as having seen the intro.
    try { localStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch { /* ignore */ }
    set({ onboardingOpen: false, tourActive: true });
  },
  endTour: () => set({ tourActive: false }),
  sidebarWidth: loadSidebarWidth(),
  setSidebarWidth: (width) => {
    const clamped = clampSidebarWidth(width);
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped)); } catch { /* ignore */ }
    set({ sidebarWidth: clamped });
  },
  orthographic: false,
  lastViewpoint: null,
  setLastViewpoint: (lastViewpoint) => set({ lastViewpoint }),
  setOrthographic: (value) => set({ orthographic: value }),
  toggleOrthographic: () => set(s => ({ orthographic: !s.orthographic })),
}));
