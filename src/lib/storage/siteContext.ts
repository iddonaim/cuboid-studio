/**
 * Site context persistence — thin wrapper around localStorage.
 *
 * This module is the ONLY place that reads or writes localStorage for site
 * context. Everything else calls these functions. This keeps future migration
 * to Firestore or another backend trivial — swap the internals, keep the API.
 */

const STORAGE_KEY = 'cuboid:activeSiteContext';

/**
 * Custom event fired whenever the active site context is written or cleared.
 * The browser's native `storage` event only fires in *other* tabs, so it can't
 * notify components in the same document (e.g. the Map tab updating the
 * Pataphysical panel's button). This in-document event fills that gap.
 */
const CHANGE_EVENT = 'cuboid:siteContextChanged';

function notifyChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Subscribes to active site context changes. Returns an unsubscribe function.
 * Fires when context is set or cleared anywhere in the app (Map tab, curator).
 */
export function subscribeActiveSiteContext(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export interface PoiItem {
  name: string;
  type: string;
  lat: number;
  lng: number;
}

export interface NearbyPoisData {
  transit: PoiItem[];
  education: PoiItem[];
  healthcare: PoiItem[];
  civic: PoiItem[];
  greenSpace: PoiItem[];
  markets: PoiItem[];
  majorRoads: Array<{ name: string; type: string }>;
}

export interface SeasonalSunAnalysisStored {
  summer_solstice: { sunrise: string; sunset: string };
  winter_solstice: { sunrise: string; sunset: string };
  equinox: { sunrise: string; sunset: string };
}

export interface SiteContextData {
  site_name: string;
  generated: string;
  /** Detailed solstice/equinox sun times (Map tab or curator auto-fill). */
  sun_analysis?: SeasonalSunAnalysisStored;
  /** Overpass POI enrichment from Map tab. */
  nearby_pois?: NearbyPoisData;
  quantitative: {
    location: { lat: string; lng: string; address: string; radius_meters?: string };
    sun: { primary_exposure: string; shadow_hours_winter: string; shadow_hours_summer: string };
    wind: { dominant_direction: string; intensity: string };
    transit: { walkability_notes: string; bus_stops_nearby: string; primary_mode: string };
    morphology: {
      typology: string;
      street_width: string;
      dominant_height: string;
      lot_dimensions: string;
      topography: string;
      dominant_directionality: string;
    };
  };
  programmatic: {
    existing_uses: Array<{ use: string; formal: boolean; notes: string }>;
    historical_uses: Array<{ use: string; period: string; notes: string }>;
  };
}

/** Returns the active site context, or null if none is saved. */
export function getActiveSiteContext(): SiteContextData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SiteContextData;
  } catch {
    return null;
  }
}

/** Saves a site context as the active context. */
export function setActiveSiteContext(context: SiteContextData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    notifyChange();
  } catch (err) {
    console.error('Failed to save site context to localStorage:', err);
  }
}

/** Clears the active site context. */
export function clearActiveSiteContext(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    notifyChange();
  } catch {
    // Ignore
  }
}
