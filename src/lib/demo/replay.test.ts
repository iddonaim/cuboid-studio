import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  getDemoGeocode,
  getDemoEncode,
  getDemoEvolveRound,
  getDemoSiteAnalysis,
  getDemoTranslation,
} from './bundle';

/** Named site context, standing in for one recorded map-context analysis. */
const siteContext = (name: string) => ({
  site_name: name,
  generated: '2026-08-05T00:00:00.000Z',
  quantitative: { location: { lat: '32.1064', lng: '34.8006', address: name } },
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
    siteAnalyses: [
      { lat: 32.1064, lng: 34.8006, context: siteContext('tel aviv site') },
      { lat: 31.7683, lng: 35.2137, context: siteContext('jerusalem site') },
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

describe('recorded site-analysis replay', () => {
  it('serves the analysis nearest the asked-for point', async () => {
    const tlv = await getDemoSiteAnalysis(32.1064, 34.8006);
    expect(tlv?.site_name).toBe('tel aviv site');
    const jlm = await getDemoSiteAnalysis(31.7683, 35.2137);
    expect(jlm?.site_name).toBe('jerusalem site');
  });

  it('a pin dropped a little off still resolves to that site', async () => {
    const hit = await getDemoSiteAnalysis(32.108, 34.802);
    expect(hit?.site_name).toBe('tel aviv site');
  });

  it('a bundle exported before analyses were recorded reads as none, not an error', async () => {
    // Fresh module instance so loadDemoBundle re-fetches; the statically
    // imported helpers above keep using the original cached bundle.
    vi.resetModules();
    const realFetch = globalThis.fetch;
    const legacy = { ...bundle, recordings: { ...bundle.recordings, siteAnalyses: undefined } };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(legacy), { status: 200 })) as typeof fetch;
    const { getDemoSiteAnalysis: legacyLookup } = await import('./bundle');
    await expect(legacyLookup(32.1064, 34.8006)).resolves.toBeNull();
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
