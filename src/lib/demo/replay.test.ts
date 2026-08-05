import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  getDemoGeocode,
  getDemoEncode,
  getDemoEvolveRound,
  getDemoPois,
  getDemoTranslation,
} from './bundle';

/** POI payload carrying `n` transit stops, so recordings are distinguishable. */
const poiData = (n: number) => ({
  transit: Array.from({ length: n }, (_, i) => ({ name: `stop-${i}`, type: 'bus_stop', lat: 32.1, lng: 34.8 })),
  education: [],
  healthcare: [],
  civic: [],
  greenSpace: [],
  markets: [],
  majorRoads: [],
});

// loadDemoBundle fetches /demo/bundle.json once and caches — serve a synthetic
// bundle exercising the recording-replay paths.
const bundle = {
  version: 1,
  exportedAt: '2026-07-19T00:00:00.000Z',
  pins: [],
  compositions: [],
  memes: [],
  translations: [
    { memeDescription: 'harvested-only', result: { model: 'harvested' } },
    { memeDescription: 'in-both', result: { model: 'harvested' } },
  ],
  images: { 'https://remote/thumb.jpg': '/demo/memes/img-000.jpg' },
  recordings: {
    startedAt: '2026-07-19T00:00:00.000Z',
    geocode: [{ query: 'חיים לבנון 30, תל אביב', lat: 32.1064, lng: 34.8006, displayName: 'חיים לבנון' }],
    encodes: [{ imageHash: 'deadbeef', response: { reasoning: 'r', cubes: [] } }],
    evolveRounds: [
      { candidates: [{ id: 'r0c0', memeImageUrl: 'https://remote/thumb.jpg' }, { id: 'r0c1', memeImageUrl: null }] },
      { candidates: [{ id: 'r1c0', memeImageUrl: 'https://remote/unknown.jpg' }] },
    ],
    twoPass: [{ memeDescription: 'in-both', result: { model: 'recorded' } }],
    pois: [
      { lat: 32.1064, lng: 34.8006, radius: 500, data: poiData(2) },
      { lat: 31.7683, lng: 35.2137, radius: 500, data: poiData(1) },
    ],
  },
};

beforeAll(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(bundle), { status: 200 })) as typeof fetch;
});

describe('recorded geocode replay', () => {
  it('matches exact and normalised queries', async () => {
    const hit = await getDemoGeocode('  חיים לבנון 30,   תל אביב ');
    expect(hit.lat).toBeCloseTo(32.1064);
  });

  it('matches partial typing (substring both ways)', async () => {
    const hit = await getDemoGeocode('חיים לבנון 30');
    expect(hit.displayName).toBe('חיים לבנון');
  });

  it('falls back to the single recorded address on a stage typo', async () => {
    const hit = await getDemoGeocode('totally-wrong-address');
    expect(hit.lat).toBeCloseTo(32.1064);
  });
});

describe('recorded POI replay', () => {
  it('serves the recording taken at the same radius, nearest first', async () => {
    // Standing on the Tel Aviv pin at its recorded radius.
    const near = await getDemoPois(32.1064, 34.8006, 500);
    expect(near.transit).toHaveLength(2);
    // Jerusalem is nearer the other recording.
    const far = await getDemoPois(31.7683, 35.2137, 500);
    expect(far.transit).toHaveLength(1);
  });

  it('falls back across radii rather than losing the beat', async () => {
    // No 900m recording exists — the nearest capture still answers.
    const hit = await getDemoPois(32.1064, 34.8006, 900);
    expect(hit.transit).toHaveLength(2);
  });

  it('a bundle exported before POIs were recorded fails soft, not hard', async () => {
    // Fresh module instance so loadDemoBundle re-fetches; the statically
    // imported helpers above keep using the original cached bundle.
    vi.resetModules();
    const realFetch = globalThis.fetch;
    const legacy = { ...bundle, recordings: { ...bundle.recordings, pois: undefined } };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(legacy), { status: 200 })) as typeof fetch;
    const { getDemoPois: legacyGetDemoPois } = await import('./bundle');
    // The caller treats a throw here as "site saved without POI data".
    await expect(legacyGetDemoPois(32.1064, 34.8006, 500)).rejects.toThrow(
      /no recorded POI lookup/,
    );
    globalThis.fetch = realFetch;
  });
});

describe('recorded encode replay', () => {
  it('returns the recorded reading for a known photo hash', async () => {
    const res = await getDemoEncode('deadbeef');
    expect(res.reasoning).toBe('r');
  });

  it('throws a presenter-readable error for an unknown photo', async () => {
    await expect(getDemoEncode('00000000')).rejects.toThrow(/no recorded encode/);
  });
});

describe('recorded evolve-round replay', () => {
  it('serves rounds in click order and rewrites thumbnails to bundled copies', async () => {
    const round0 = await getDemoEvolveRound(0);
    expect(round0.map(c => c.id)).toEqual(['r0c0', 'r0c1']);
    expect(round0[0].memeImageUrl).toBe('/demo/memes/img-000.jpg');
    expect(round0[1].memeImageUrl).toBeNull();
    const round1 = await getDemoEvolveRound(1);
    // Unknown remote URLs pass through untouched rather than breaking.
    expect(round1[0].memeImageUrl).toBe('https://remote/unknown.jpg');
  });

  it('explains the choreography limit when rounds run out', async () => {
    await expect(getDemoEvolveRound(2)).rejects.toThrow(/only 2 evolve round\(s\)/);
  });
});

describe('translation lookup with recordings', () => {
  it('live-recorded translations take precedence over harvested ones', async () => {
    const both = await getDemoTranslation('in-both');
    expect((both as { model: string }).model).toBe('recorded');
    const harvested = await getDemoTranslation('harvested-only');
    expect((harvested as { model: string }).model).toBe('harvested');
  });
});
