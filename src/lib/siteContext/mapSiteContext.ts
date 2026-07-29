import { getPrimaryExposure, getSeasonalSunAnalysis } from '../astronomy/suncalc';
import {
  getActiveSiteContext,
  NearbyPoisData,
  SiteContextData,
} from '../storage/siteContext';

function emptyQuantitative() {
  return {
    location: { lat: '', lng: '', address: '' },
    sun: { primary_exposure: '', shadow_hours_winter: '', shadow_hours_summer: '' },
    wind: { dominant_direction: '', intensity: '' },
    transit: { walkability_notes: '', bus_stops_nearby: '', primary_mode: '' },
    morphology: {
      typology: '',
      street_width: '',
      dominant_height: '',
      lot_dimensions: '',
      topography: '',
      dominant_directionality: '',
    },
  };
}

/**
 * Build a site context anchored at the given coordinates, merging over an
 * explicit base context (or a fresh empty one when base is null). The base
 * matters: assigning a location to a saved Site must merge over *that site's*
 * stored context, never over whatever context happens to be active.
 */
export function buildSiteContextAt(
  lat: number,
  lng: number,
  address: string,
  radiusMeters: number,
  baseContext: SiteContextData | null,
  nearbyPois?: NearbyPoisData
): SiteContextData {
  const exposure = getPrimaryExposure(lat, lng);
  const sunAnalysis = getSeasonalSunAnalysis(lat, lng);

  const transitCount = nearbyPois?.transit.length ?? 0;
  const schoolCount = nearbyPois?.education.length ?? 0;

  const base: SiteContextData = baseContext ?? {
    site_name: address.split(',')[0]?.trim() || 'Map site',
    generated: new Date().toISOString(),
    quantitative: emptyQuantitative(),
    programmatic: { existing_uses: [], historical_uses: [] },
  };

  return {
    ...base,
    site_name: address.split(',')[0]?.trim() || base.site_name,
    generated: new Date().toISOString(),
    sun_analysis: sunAnalysis,
    // Firestore rejects `undefined` field values, so only write the key when
    // POIs were provided; otherwise whatever the base carried stays.
    ...(nearbyPois ? { nearby_pois: nearbyPois } : {}),
    quantitative: {
      ...base.quantitative,
      location: {
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
        address,
        radius_meters: String(radiusMeters),
      },
      sun: {
        primary_exposure: `Noon altitude ${exposure.summer_noon_alt} (summer, ${exposure.summer_noon_az}) / ${exposure.winter_noon_alt} (winter, ${exposure.winter_noon_az})`,
        shadow_hours_winter: `~${exposure.winter_daylight}h daylight (Dec solstice); sunrise ${sunAnalysis.winter_solstice.sunrise} / sunset ${sunAnalysis.winter_solstice.sunset}`,
        shadow_hours_summer: `~${exposure.summer_daylight}h daylight (Jun solstice); sunrise ${sunAnalysis.summer_solstice.sunrise} / sunset ${sunAnalysis.summer_solstice.sunset}`,
      },
      transit: {
        ...base.quantitative.transit,
        bus_stops_nearby:
          transitCount > 0
            ? `${transitCount} transit stop(s) within ${radiusMeters}m (Overpass)`
            : base.quantitative.transit.bus_stops_nearby,
        walkability_notes:
          schoolCount > 0
            ? `${schoolCount} school(s) within ${radiusMeters}m. ${base.quantitative.transit.walkability_notes}`.trim()
            : base.quantitative.transit.walkability_notes,
      },
    },
  };
}

/** Base context merged when setting a pin from the Map tab. */
export function buildSiteContextFromMap(
  lat: number,
  lng: number,
  address: string,
  radiusMeters: number,
  nearbyPois?: NearbyPoisData
): SiteContextData {
  return buildSiteContextAt(lat, lng, address, radiusMeters, getActiveSiteContext(), nearbyPois);
}

/** One-line site context block for the encoding vision request. */
export function formatSiteContextForEncode(ctx: SiteContextData): string {
  const { lat, lng, address, radius_meters } = ctx.quantitative.location;
  const radius = radius_meters || '500';
  const sun = ctx.quantitative.sun;
  const pois = ctx.nearby_pois;
  const transit = pois?.transit.length ?? 0;
  const schools = pois?.education.length ?? 0;
  const civic = pois?.civic.length ?? 0;
  const parks = pois?.greenSpace.length ?? 0;
  const roads =
    pois?.majorRoads
      .map((r) => r.name)
      .filter(Boolean)
      .slice(0, 5)
      .join(', ') || 'none listed';

  return (
    `Site context: ${address || 'Unknown address'}. ${lat}, ${lng}. ` +
    `Sun: ${sun.primary_exposure}; summer daylight ${sun.shadow_hours_summer}. ` +
    `Nearby: ${transit} transit stops, ${schools} schools, ${civic} civic buildings, ${parks} parks within ${radius}m. ` +
    `Major roads: ${roads}.`
  );
}
