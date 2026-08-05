import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecording,
  clearRecording,
  recordGeocode,
  recordEncode,
  recordEvolveRound,
  recordTwoPass,
  recordPois,
  hashImageBase64,
  metersBetween,
} from './recorder';
import type { EvolutionCandidate } from '../../store/useEvolutionStore';
import type { NearbyPoisData } from '../storage/siteContext';

// Node test env has no localStorage — provide a minimal in-memory stand-in.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const geo = { query: 'חיים לבנון 30', lat: 32.1064, lng: 34.8006, displayName: 'חיים לבנון, תל אביב' };

/** POI payload carrying `n` transit stops, so captures are distinguishable. */
const pois = (n: number): NearbyPoisData => ({
  transit: Array.from({ length: n }, (_, i) => ({
    name: `stop-${i}`,
    type: 'bus_stop',
    lat: 32.1,
    lng: 34.8,
  })),
  education: [],
  healthcare: [],
  civic: [],
  greenSpace: [],
  markets: [],
  majorRoads: [],
});

describe('demo recorder', () => {
  it('starts empty and accumulates events', () => {
    expect(getRecording()).toBeNull();
    recordGeocode(geo);
    recordTwoPass({ memeDescription: 'm', result: { pass1: {}, pass2: {}, model: 'x' } as never });
    const rec = getRecording();
    expect(rec?.geocode).toHaveLength(1);
    expect(rec?.twoPass).toHaveLength(1);
    expect(rec?.startedAt).toBeTruthy();
  });

  it('re-recording the same geocode query or photo overwrites, not duplicates', () => {
    recordGeocode(geo);
    recordGeocode({ ...geo, displayName: 'updated' });
    recordEncode({ imageHash: 'abc', response: { reasoning: 'r1', cubes: [] } });
    recordEncode({ imageHash: 'abc', response: { reasoning: 'r2', cubes: [] } });
    const rec = getRecording();
    expect(rec?.geocode).toHaveLength(1);
    expect(rec?.geocode[0].displayName).toBe('updated');
    expect(rec?.encodes).toHaveLength(1);
    expect(rec?.encodes[0].response.reasoning).toBe('r2');
  });

  it('evolve rounds append in click order', () => {
    const cand = (id: string) => ({ id }) as unknown as EvolutionCandidate;
    recordEvolveRound({ candidates: [cand('a'), cand('b')] });
    recordEvolveRound({ candidates: [cand('c')] });
    const rec = getRecording();
    expect(rec?.evolveRounds.map(r => r.candidates.length)).toEqual([2, 1]);
  });

  it('re-committing the same site overwrites its POIs; a different one appends', () => {
    recordPois({ lat: 32.1064, lng: 34.8006, radius: 500, data: pois(1) });
    // Same spot within the drift tolerance, same radius → replaces.
    recordPois({ lat: 32.10641, lng: 34.80061, radius: 500, data: pois(2) });
    expect(getRecording()?.pois).toHaveLength(1);
    expect(getRecording()?.pois?.[0].data.transit).toHaveLength(2);

    // Same spot, different radius → a genuinely different lookup.
    recordPois({ lat: 32.1064, lng: 34.8006, radius: 800, data: pois(3) });
    // Far enough away to be another site.
    recordPois({ lat: 31.7683, lng: 35.2137, radius: 500, data: pois(4) });
    expect(getRecording()?.pois).toHaveLength(3);
  });

  it('a recording made before POIs existed accepts them instead of throwing', () => {
    // Exactly what an older ?demoRecord session left in localStorage.
    store.set(
      'cs-demo-recording',
      JSON.stringify({
        startedAt: '2026-07-19T00:00:00.000Z',
        geocode: [geo],
        encodes: [],
        evolveRounds: [],
        twoPass: [],
      }),
    );
    expect(getRecording()?.pois).toEqual([]);
    expect(() => recordPois({ lat: 32.1, lng: 34.8, radius: 500, data: pois(1) })).not.toThrow();
    expect(getRecording()?.pois).toHaveLength(1);
    // The pre-existing captures survive the backfill.
    expect(getRecording()?.geocode).toHaveLength(1);
  });

  it('metersBetween reads in metres at neighbourhood scale', () => {
    const a = { lat: 32.1064, lng: 34.8006 };
    expect(metersBetween(a, a)).toBe(0);
    // ~0.001° of latitude is ~111m.
    expect(metersBetween(a, { lat: 32.1074, lng: 34.8006 })).toBeCloseTo(111.3, 0);
  });

  it('clearRecording wipes everything; corrupt storage reads as null', () => {
    recordGeocode(geo);
    clearRecording();
    expect(getRecording()).toBeNull();
    store.set('cs-demo-recording', '{not json');
    expect(getRecording()).toBeNull();
  });

  it('hashImageBase64 is stable and discriminates', () => {
    const a = hashImageBase64('iVBORw0KGgoAAAANS');
    expect(hashImageBase64('iVBORw0KGgoAAAANS')).toBe(a);
    expect(hashImageBase64('iVBORw0KGgoAAAANT')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});
