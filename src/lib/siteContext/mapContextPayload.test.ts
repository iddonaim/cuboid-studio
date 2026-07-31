import { describe, expect, it } from 'vitest';
import {
  MapAnalysisPayload,
  morphologyFromMapAnalysis,
  poisFromMapAnalysis,
} from './mapContextPayload';

const CENTER = { lat: 32.0663, lng: 34.7776 };

/** Mirrors map-context's `parseAllOSMData` output: tags spread onto properties. */
function feature(
  geometry: { type: string; coordinates: unknown },
  properties: Record<string, unknown>
) {
  return { geometry, properties };
}

function point(lng: number, lat: number) {
  return { type: 'Point', coordinates: [lng, lat] };
}

function line(coords: number[][]) {
  return { type: 'LineString', coordinates: coords };
}

describe('poisFromMapAnalysis', () => {
  it('sorts institutions into education, healthcare and civic', () => {
    const payload: MapAnalysisPayload = {
      institutions: {
        features: [
          feature(point(34.778, 32.067), { amenity: 'school', name: 'Bialik' }),
          feature(point(34.779, 32.068), { amenity: 'kindergarten', name: 'Gan Rimon' }),
          feature(point(34.776, 32.065), { amenity: 'clinic', name: 'Kupat Holim' }),
          feature(point(34.775, 32.064), { amenity: 'library', name: 'Beit Ariela' }),
          feature(point(34.774, 32.063), { amenity: 'place_of_worship', name: 'Great Synagogue' }),
          // Not in map-context's amenity query — must be ignored, not guessed.
          feature(point(34.773, 32.062), { amenity: 'restaurant', name: 'Cafe' }),
        ],
      },
    };

    const pois = poisFromMapAnalysis(payload, CENTER);

    expect(pois?.education.map((p) => p.name)).toEqual(['Bialik', 'Gan Rimon']);
    expect(pois?.healthcare.map((p) => p.name)).toEqual(['Kupat Holim']);
    expect(pois?.civic.map((p) => p.name)).toEqual(['Beit Ariela', 'Great Synagogue']);
  });

  it('accepts amenities mapped as ways, not just points', () => {
    const payload: MapAnalysisPayload = {
      institutions: {
        features: [
          feature(line([[34.777, 32.066], [34.778, 32.067], [34.779, 32.068]]), {
            amenity: 'university',
            name: 'Campus',
          }),
        ],
      },
    };

    const pois = poisFromMapAnalysis(payload, CENTER);
    expect(pois?.education).toHaveLength(1);
    // Middle vertex stands in for the footprint.
    expect(pois?.education[0]).toMatchObject({ name: 'Campus', lat: 32.067, lng: 34.778 });
  });

  it('counts a multi-segment rail line once, not once per segment', () => {
    const segments = Array.from({ length: 12 }, (_, i) =>
      feature(line([[34.77 + i / 1000, 32.06], [34.771 + i / 1000, 32.061]]), {
        railway: 'light_rail',
        name: 'Red Line',
        osm_id: 1000 + i,
      })
    );

    const pois = poisFromMapAnalysis({ transit: { lightrail: { features: segments } } }, CENTER);

    expect(pois?.transit).toHaveLength(1);
    expect(pois?.transit[0]).toMatchObject({ name: 'Red Line', type: 'light_rail_line' });
  });

  it('keeps distinct rail lines and distinct unnamed spurs apart', () => {
    const payload: MapAnalysisPayload = {
      transit: {
        lightrail: {
          features: [
            feature(line([[34.77, 32.06], [34.771, 32.061]]), { railway: 'light_rail', name: 'Red Line' }),
            feature(line([[34.78, 32.07], [34.781, 32.071]]), { railway: 'subway', name: 'Purple Line' }),
            feature(line([[34.79, 32.08], [34.791, 32.081]]), { railway: 'light_rail', osm_id: 55 }),
            feature(line([[34.75, 32.05], [34.751, 32.051]]), { railway: 'light_rail', osm_id: 56 }),
          ],
        },
        train: {
          features: [feature(line([[34.76, 32.04], [34.761, 32.041]]), { railway: 'rail', name: 'Coastal' })],
        },
      },
    };

    const pois = poisFromMapAnalysis(payload, CENTER);
    expect(pois?.transit).toHaveLength(5);
    expect(pois?.transit.map((t) => t.type)).toContain('rail_line');
    expect(pois?.transit.map((t) => t.type)).toContain('subway_line');
  });

  it('collects named arterials only, deduplicated', () => {
    const payload: MapAnalysisPayload = {
      streets: {
        features: [
          feature(line([[34.77, 32.06], [34.771, 32.061]]), { highway: 'primary', name: 'Ibn Gvirol' }),
          feature(line([[34.771, 32.061], [34.772, 32.062]]), { highway: 'primary', name: 'Ibn Gvirol' }),
          feature(line([[34.78, 32.07], [34.781, 32.071]]), { highway: 'secondary', name: 'Arlozorov' }),
          feature(line([[34.79, 32.08], [34.791, 32.081]]), { highway: 'residential', name: 'Small St' }),
          feature(line([[34.79, 32.08], [34.791, 32.081]]), { highway: 'primary' }),
        ],
      },
    };

    const pois = poisFromMapAnalysis(payload, CENTER);
    expect(pois?.majorRoads).toEqual([
      { name: 'Ibn Gvirol', type: 'primary' },
      { name: 'Arlozorov', type: 'secondary' },
    ]);
  });

  it('reports no parks or markets — map-context does not fetch them', () => {
    const payload: MapAnalysisPayload = {
      trees: { features: [feature(point(34.777, 32.066), { natural: 'tree' })] },
      institutions: { features: [feature(point(34.778, 32.067), { amenity: 'school', name: 'A' })] },
    };

    const pois = poisFromMapAnalysis(payload, CENTER);
    // Street trees are not a park; inventing greenSpace here would be a lie.
    expect(pois?.greenSpace).toEqual([]);
    expect(pois?.markets).toEqual([]);
  });

  it('returns undefined when nothing can be derived, so a merge cannot blank good data', () => {
    expect(poisFromMapAnalysis({}, CENTER)).toBeUndefined();
    expect(poisFromMapAnalysis({ institutions: { features: [] } }, CENTER)).toBeUndefined();
  });

  it('survives a malformed payload without throwing', () => {
    const junk = {
      institutions: { features: [{ properties: { amenity: 'school' } }, {}] },
      streets: { features: 'nope' },
      transit: { lightrail: null },
    } as unknown as MapAnalysisPayload;

    expect(() => poisFromMapAnalysis(junk, CENTER)).not.toThrow();
    expect(poisFromMapAnalysis(junk, CENTER)).toBeUndefined();
  });
});

describe('morphologyFromMapAnalysis', () => {
  it('ignores map-context placeholder building heights', () => {
    const payload: MapAnalysisPayload = {
      buildings: {
        features: [
          feature(point(34.777, 32.066), { height: 9.6, heightSource: 'default' }),
          feature(point(34.778, 32.067), { height: 9.6, heightSource: 'default' }),
        ],
      },
    };

    // Every height is the 9.6m fallback, so there is no measurement to report.
    expect(morphologyFromMapAnalysis(payload).dominant_height).toBeUndefined();
  });

  it('reports the median of genuinely recorded heights', () => {
    const payload: MapAnalysisPayload = {
      buildings: {
        features: [
          feature(point(34.777, 32.066), { height: 12, heightSource: 'attr' }),
          feature(point(34.778, 32.067), { height: 16, heightSource: 'osm' }),
          feature(point(34.779, 32.068), { height: 20, heightSource: 'attr' }),
          feature(point(34.78, 32.069), { height: 9.6, heightSource: 'default' }),
        ],
      },
    };

    const morphology = morphologyFromMapAnalysis(payload);
    expect(morphology.dominant_height).toContain('16.0m');
    expect(morphology.dominant_height).toContain('3 building(s)');
  });

  it('records elevation as altitude, flagged as a single sample', () => {
    expect(morphologyFromMapAnalysis({ elevation: 43.2 }).topography).toBe(
      'Site centre ~43m ASL (single-point sample)'
    );
    expect(morphologyFromMapAnalysis({ elevation: null }).topography).toBeUndefined();
  });

  it('finds the dominant street axis of a north-south grid', () => {
    const payload: MapAnalysisPayload = {
      streets: {
        features: [
          feature(line([[34.77, 32.06], [34.77, 32.07]]), { highway: 'primary' }),
          feature(line([[34.78, 32.06], [34.78, 32.07]]), { highway: 'primary' }),
          feature(line([[34.79, 32.06], [34.79, 32.07]]), { highway: 'primary' }),
        ],
      },
    };

    const morphology = morphologyFromMapAnalysis(payload);
    expect(morphology.dominant_directionality).toContain('~0°/90°');
  });

  it('treats opposing directions along one axis as the same grain', () => {
    // Drawn one way and the other: a naive angular mean would cancel these to
    // nothing, the doubled-angle mean must keep the axis.
    const payload: MapAnalysisPayload = {
      streets: {
        features: [
          feature(line([[34.77, 32.06], [34.77, 32.07]]), { highway: 'primary' }),
          feature(line([[34.78, 32.07], [34.78, 32.06]]), { highway: 'primary' }),
        ],
      },
    };

    expect(morphologyFromMapAnalysis(payload).dominant_directionality).toContain('~0°/90°');
  });

  it('returns an empty object when the payload carries no fabric data', () => {
    expect(morphologyFromMapAnalysis({})).toEqual({});
  });
});
