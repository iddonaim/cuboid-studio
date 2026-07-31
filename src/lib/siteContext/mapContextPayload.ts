/**
 * Adapter for the map-context analysis payload.
 *
 * The embedded map-context app posts a large GeoJSON bundle on
 * `analysis-complete` (site_center, site_radius, address, layerSources,
 * elevation, buildings, streets, trees, institutions, registration, transit,
 * demographics, taba). Cuboid historically kept only the coordinates, so
 * Encode always saw "0 transit stops, 0 schools, ... none listed" no matter
 * how rich the analysis was.
 *
 * This module distils that bundle into the fields Active Site Context already
 * has. It deliberately *summarises* rather than copies: the raw layers hold
 * thousands of polygons, and site context is persisted to localStorage and
 * Firestore (1 MB/document), so passing geometry through would break saves.
 */
import { NearbyPoisData, PoiItem, SiteContextData } from '../storage/siteContext';

/** Minimal GeoJSON shapes — the payload is external, so nothing is trusted. */
interface GeoGeometry {
  type?: string;
  coordinates?: unknown;
}

interface GeoFeature {
  geometry?: GeoGeometry;
  properties?: Record<string, unknown>;
}

interface GeoCollection {
  features?: GeoFeature[];
}

/**
 * The shape map-context actually posts (see its `index.js` `runAnalysis`
 * return value). `quantitative` is not part of it — it's here so a future
 * converged map-context can post a ready-made SiteContextData instead.
 */
export interface MapAnalysisPayload {
  site_center?: { lat?: number; lon?: number };
  site_radius?: number;
  address?: string;
  quantitative?: SiteContextData['quantitative'];
  layerSources?: Record<string, string>;
  elevation?: number | null;
  buildings?: GeoCollection | null;
  streets?: GeoCollection | null;
  trees?: GeoCollection | null;
  institutions?: GeoCollection | null;
  registration?: GeoCollection | null;
  transit?: { lightrail?: GeoCollection | null; train?: GeoCollection | null } | null;
  demographics?: unknown;
  taba?: unknown;
}

/** Keeps the stored context small — these lists are prompt fuel, not a dataset. */
const MAX_POIS_PER_CATEGORY = 40;
const MAX_MAJOR_ROADS = 20;
/** Bearing accumulation is O(vertices); cap it so a dense city centre can't stall the handler. */
const MAX_STREET_SEGMENTS = 20_000;

const MAJOR_ROAD_TYPES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function features(collection: GeoCollection | null | undefined): GeoFeature[] {
  return Array.isArray(collection?.features) ? collection!.features! : [];
}

function isLngLat(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/**
 * One representative coordinate per feature. map-context emits amenities as
 * Points *or* LineStrings (an OSM way tagged `amenity`), so both must work;
 * for a way we take the middle vertex, which is inside the footprint for the
 * convex shapes buildings and campuses actually have.
 */
function representativePoint(geometry: GeoGeometry | undefined): { lat: number; lng: number } | null {
  const coords = geometry?.coordinates;
  if (isLngLat(coords)) return { lat: coords[1], lng: coords[0] };
  if (Array.isArray(coords) && coords.length) {
    const line = geometry?.type === 'Polygon' ? coords[0] : coords;
    if (Array.isArray(line) && line.length) {
      const mid = line[Math.floor(line.length / 2)];
      if (isLngLat(mid)) return { lat: mid[1], lng: mid[0] };
    }
  }
  return null;
}

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function featureName(props: Record<string, unknown> | undefined): string {
  return str(props?.name) || str(props?.['name:en']) || str(props?.['name:he']);
}

/**
 * map-context's Overpass query fetches these amenities only. Anything outside
 * the set is ignored rather than guessed into a category.
 */
function institutionCategory(amenity: string): 'education' | 'healthcare' | 'civic' | null {
  switch (amenity) {
    case 'school':
    case 'kindergarten':
    case 'university':
    case 'college':
      return 'education';
    case 'hospital':
    case 'clinic':
      return 'healthcare';
    case 'library':
    case 'place_of_worship':
    case 'police':
    case 'fire_station':
      return 'civic';
    default:
      return null;
  }
}

function nearestFirst(items: PoiItem[], lat: number, lng: number, limit: number): PoiItem[] {
  return [...items]
    .sort((a, b) => distanceM(lat, lng, a.lat, a.lng) - distanceM(lat, lng, b.lat, b.lng))
    .slice(0, limit);
}

/**
 * Distil the payload into the POI buckets Encode reads.
 *
 * Two categories stay empty on purpose: map-context's Overpass query asks only
 * for highways, railways and a fixed amenity list, so it carries no parks
 * (`greenSpace`) and no shops (`markets`). Reporting zero there is accurate —
 * the `trees` layer counts individual street trees and is not a park.
 *
 * `transit` holds rail *lines*, not stops: map-context returns railway ways,
 * so a single line arrives as many segments. They are deduplicated by name so
 * one line counts once, and typed `*_line` to stay distinguishable from the
 * genuine stops `/api/fetch-context-pois` produces.
 *
 * Returns undefined when nothing could be derived, so callers merging over an
 * existing context don't overwrite good data with an empty shell.
 */
export function poisFromMapAnalysis(
  payload: MapAnalysisPayload,
  center: { lat: number; lng: number }
): NearbyPoisData | undefined {
  const education: PoiItem[] = [];
  const healthcare: PoiItem[] = [];
  const civic: PoiItem[] = [];
  const buckets = { education, healthcare, civic };

  for (const feature of features(payload.institutions)) {
    const category = institutionCategory(str(feature.properties?.amenity));
    if (!category) continue;
    const point = representativePoint(feature.geometry);
    if (!point) continue;
    buckets[category].push({
      name: featureName(feature.properties) || str(feature.properties?.amenity),
      type: str(feature.properties?.amenity),
      lat: point.lat,
      lng: point.lng,
    });
  }

  // Rail: dedupe by line name so a 40-segment light-rail way counts once.
  // Unnamed segments fall back to their osm_id, which keeps distinct spurs
  // apart without merging them into a single phantom "line".
  const railSeen = new Set<string>();
  const transit: PoiItem[] = [];
  let railIndex = 0;
  for (const collection of [payload.transit?.lightrail, payload.transit?.train]) {
    for (const feature of features(collection)) {
      const railway = str(feature.properties?.railway) || 'rail';
      const name = featureName(feature.properties);
      const osmId = feature.properties?.osm_id;
      const fallback = osmId == null ? `idx${railIndex++}` : `osm${String(osmId)}`;
      const key = `${railway}:${name || fallback}`;
      if (railSeen.has(key)) continue;
      const point = representativePoint(feature.geometry);
      if (!point) continue;
      railSeen.add(key);
      transit.push({
        name: name || `${railway.replace(/_/g, ' ')} line`,
        type: `${railway}_line`,
        lat: point.lat,
        lng: point.lng,
      });
    }
  }

  // Major roads: named arterials only. An unnamed service road adds nothing to
  // a prompt that lists roads by name.
  const roadSeen = new Set<string>();
  const majorRoads: Array<{ name: string; type: string }> = [];
  for (const feature of features(payload.streets)) {
    const type = str(feature.properties?.highway);
    if (!MAJOR_ROAD_TYPES.has(type)) continue;
    const name = featureName(feature.properties);
    if (!name || roadSeen.has(name)) continue;
    roadSeen.add(name);
    majorRoads.push({ name, type });
  }

  const pois: NearbyPoisData = {
    transit: nearestFirst(transit, center.lat, center.lng, MAX_POIS_PER_CATEGORY),
    education: nearestFirst(education, center.lat, center.lng, MAX_POIS_PER_CATEGORY),
    healthcare: nearestFirst(healthcare, center.lat, center.lng, MAX_POIS_PER_CATEGORY),
    civic: nearestFirst(civic, center.lat, center.lng, MAX_POIS_PER_CATEGORY),
    greenSpace: [],
    markets: [],
    majorRoads: majorRoads.slice(0, MAX_MAJOR_ROADS),
  };

  const derived =
    pois.transit.length + pois.education.length + pois.healthcare.length +
    pois.civic.length + pois.majorRoads.length;
  return derived > 0 ? pois : undefined;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Axial (mod-180°) mean of street bearings — the urban grain.
 *
 * Street directions are axes, not headings: a road running 10° and one running
 * 190° lie on the same axis, and a plain angular mean of the two would cancel
 * to nothing. Doubling each angle before averaging and halving the result is
 * the standard fix. Segments are weighted by length so long arterials count
 * for more than short slip roads.
 */
function dominantStreetAxis(streets: GeoFeature[]): { degrees: number; segments: number } | null {
  let sin2 = 0;
  let cos2 = 0;
  let segments = 0;

  for (const feature of streets) {
    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords)) continue;
    for (let i = 1; i < coords.length; i++) {
      if (segments >= MAX_STREET_SEGMENTS) break;
      const a = coords[i - 1];
      const b = coords[i];
      if (!isLngLat(a) || !isLngLat(b)) continue;
      // Local planar approximation: scale longitude by cos(lat) so the angle
      // isn't skewed by meridian convergence. Fine over an analysis radius.
      const latScale = Math.cos((a[1] * Math.PI) / 180);
      const dx = (b[0] - a[0]) * latScale;
      const dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const theta = Math.atan2(dx, dy); // bearing from north
      sin2 += length * Math.sin(2 * theta);
      cos2 += length * Math.cos(2 * theta);
      segments++;
    }
    if (segments >= MAX_STREET_SEGMENTS) break;
  }

  if (segments === 0 || (sin2 === 0 && cos2 === 0)) return null;
  let degrees = (Math.atan2(sin2, cos2) / 2) * (180 / Math.PI);
  degrees = ((degrees % 180) + 180) % 180;
  return { degrees: Math.round(degrees), segments };
}

/**
 * Morphology hints derived from the analysis layers. Every field is optional:
 * a key is only returned when the payload genuinely supports it, so merging
 * this over an existing context never blanks a field the curator filled in.
 */
export function morphologyFromMapAnalysis(
  payload: MapAnalysisPayload
): Partial<SiteContextData['quantitative']['morphology']> {
  const morphology: Partial<SiteContextData['quantitative']['morphology']> = {};

  // Building heights. map-context substitutes 9.6 m (heightSource "default")
  // wherever OSM has neither a height nor a level count — counting those would
  // report a placeholder as a measurement, so only real values are used.
  const measured: number[] = [];
  for (const feature of features(payload.buildings)) {
    const source = str(feature.properties?.heightSource);
    if (source !== 'attr' && source !== 'osm') continue;
    const height = Number(feature.properties?.height);
    if (Number.isFinite(height) && height > 0) measured.push(height);
  }
  if (measured.length) {
    morphology.dominant_height =
      `Median ~${median(measured).toFixed(1)}m across ${measured.length} building(s) ` +
      `with recorded heights (OSM)`;
  }

  if (typeof payload.elevation === 'number' && Number.isFinite(payload.elevation)) {
    // Single-point sample at the site centre — it gives altitude, not slope.
    morphology.topography = `Site centre ~${Math.round(payload.elevation)}m ASL (single-point sample)`;
  }

  const axis = dominantStreetAxis(features(payload.streets));
  if (axis) {
    const cross = (axis.degrees + 90) % 180;
    morphology.dominant_directionality =
      `Street grain ~${axis.degrees}°/${cross}° from north ` +
      `(length-weighted over ${axis.segments} OSM segments)`;
  }

  const widths: number[] = [];
  for (const feature of features(payload.streets)) {
    const width = Number(feature.properties?.width);
    if (Number.isFinite(width) && width > 0) widths.push(width);
  }
  if (widths.length) {
    morphology.street_width = `Median ~${median(widths).toFixed(1)}m across ${widths.length} tagged street(s) (OSM)`;
  }

  return morphology;
}
