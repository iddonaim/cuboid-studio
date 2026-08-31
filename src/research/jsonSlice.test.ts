import { describe, expect, it } from 'vitest';
import { extractTopLevelArrayElements, extractTwoPassRawSlices } from './jsonSlice';

describe('extractTopLevelArrayElements', () => {
  it('returns exact character spans, formatting preserved', () => {
    const text = '[\n  { "pass": 1,\n    "note": "a, b" },\n  {"pass":2,"x":[1,2]}\n]';
    const els = extractTopLevelArrayElements(text);
    expect(els).toHaveLength(2);
    expect(els![0]).toBe('{ "pass": 1,\n    "note": "a, b" }');
    expect(els![1]).toBe('{"pass":2,"x":[1,2]}');
  });

  it('is not fooled by commas, brackets or escaped quotes inside strings', () => {
    const text = '[{"a":"], \\" [,"},{"b":"}"}]';
    const els = extractTopLevelArrayElements(text);
    expect(els).toHaveLength(2);
    expect(JSON.parse(els![0])).toEqual({ a: '], " [,' });
    expect(JSON.parse(els![1])).toEqual({ b: '}' });
  });

  it('returns null for a non-array', () => {
    expect(extractTopLevelArrayElements('{"pass1":{},"pass2":{}}')).toBeNull();
  });
});

describe('extractTwoPassRawSlices', () => {
  it('matches passes by their "pass" value, order-independent', () => {
    const text = '[ {"pass": 2, "op": "drift"}, {"pass": 1, "moves": []} ]';
    const slices = extractTwoPassRawSlices(text);
    expect(slices.pass1).toBe('{"pass": 1, "moves": []}');
    expect(slices.pass2).toBe('{"pass": 2, "op": "drift"}');
  });

  it('round-trips: the slice re-parses to the same object as the array element', () => {
    const pass1 = { pass: 1, rhetorical_moves: ['irony'], meme_summary: 'x, y and "z"' };
    const pass2 = { pass: 2, operator: 'drift', cutter: { type: 'box' } };
    const text = JSON.stringify([pass1, pass2], null, 2);
    const slices = extractTwoPassRawSlices(text);
    expect(JSON.parse(slices.pass1!)).toEqual(pass1);
    expect(JSON.parse(slices.pass2!)).toEqual(pass2);
  });

  it('returns nulls for the object form (no verbatim spans pretended)', () => {
    const slices = extractTwoPassRawSlices('{"pass1":{"pass":1},"pass2":{"pass":2}}');
    expect(slices).toEqual({ pass1: null, pass2: null });
  });
});
