/**
 * URL building and site-identity comparison for the embedded map-context
 * iframe (Analysis tab).
 *
 * When Cuboid Studio has an active site context, the iframe boots straight
 * into that site's analysis via query params (?lat&lon&address&r) instead of
 * showing map-context's blank address picker. "Same site" is defined by
 * rounded coordinates (4 decimals, ~11 m) + analysis radius — the same
 * identity map-context uses for its server-side result cache.
 */

import { SiteContextData } from '../storage/siteContext';

const DEFAULT_RADIUS_METERS = 400;

interface ParsedLocation {
  lat: number;
  lng: number;
  address: string;
  radius: number | null;
}

/** Extracts numeric coordinates from a context; null when absent/invalid. */
function parseLocation(ctx: SiteContextData | null): ParsedLocation | null {
  const loc = ctx?.quantitative?.location;
  if (!loc || typeof loc.lat !== 'string' || typeof loc.lng !== 'string') return null;
  if (loc.lat.trim() === '' || loc.lng.trim() === '') return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const radius = Number(loc.radius_meters);
  return {
    lat,
    lng,
    address: typeof loc.address === 'string' ? loc.address : '',
    radius: Number.isFinite(radius) && radius > 0 ? Math.round(radius) : null,
  };
}

/**
 * Identity key of the site a context describes: rounded lat/lng + radius.
 * Null when the context has no usable coordinates.
 */
export function siteKeyFromContext(ctx: SiteContextData | null): string | null {
  const loc = parseLocation(ctx);
  if (!loc) return null;
  const radius = loc.radius ?? DEFAULT_RADIUS_METERS;
  return `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)},${radius}`;
}

/**
 * True when both contexts describe the same analysis site. Unlocated
 * contexts are never "the same site" — restoring identity requires
 * coordinates on both sides.
 */
export function isSameSite(a: SiteContextData | null, b: SiteContextData | null): boolean {
  const keyA = siteKeyFromContext(a);
  return keyA !== null && keyA === siteKeyFromContext(b);
}

/**
 * The iframe src for the Analysis tab: the plain launcher URL when no
 * located context exists, otherwise the launcher URL with boot params so
 * map-context skips its picker and runs the site's analysis immediately.
 * (Deployed map-context versions that predate the boot-param feature simply
 * ignore the params and show the picker — graceful degradation.)
 */
export function buildMapContextSrc(baseUrl: string, ctx: SiteContextData | null): string {
  const loc = parseLocation(ctx);
  if (!loc) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set('lat', loc.lat.toFixed(6));
  url.searchParams.set('lon', loc.lng.toFixed(6));
  if (loc.address) url.searchParams.set('address', loc.address);
  if (loc.radius !== null) url.searchParams.set('r', String(loc.radius));
  return url.toString();
}
