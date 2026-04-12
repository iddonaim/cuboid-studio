/**
 * Site context persistence — thin wrapper around localStorage.
 *
 * This module is the ONLY place that reads or writes localStorage for site
 * context. Everything else calls these functions. This keeps future migration
 * to Firestore or another backend trivial — swap the internals, keep the API.
 */

const STORAGE_KEY = 'cuboid:activeSiteContext';

export interface SiteContextData {
  site_name: string;
  generated: string;
  quantitative: {
    location: { lat: string; lng: string; address: string };
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
  architects_reading: Record<string, string>;
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
  } catch (err) {
    console.error('Failed to save site context to localStorage:', err);
  }
}

/** Clears the active site context. */
export function clearActiveSiteContext(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
