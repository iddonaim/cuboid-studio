import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecording,
  clearRecording,
  recordGeocode,
  recordEncode,
  recordEvolveRound,
  recordTwoPass,
  hashImageBase64,
} from './recorder';
import type { EvolutionCandidate } from '../../store/useEvolutionStore';

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
