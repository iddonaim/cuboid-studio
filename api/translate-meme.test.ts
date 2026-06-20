import { describe, it, expect } from 'vitest';
import { validateAndReturnSingle, validateAndReturnTwoPass } from './translate-meme';

// A geometrically valid cutter shared across fixtures.
const validCutter = {
  type: 'plane',
  proportions: [0.8, 0.1, 0.9],
  position: [0.3, 0.5, 0.4],
  rotation: [0, 15, 0],
  geometry_reasoning: 'a thin diagonal plane',
};

const validPass1 = {
  pass: 1,
  rhetorical_moves: ['irony', 'juxtaposition'],
  cultural_tensions: [{ description: 'residents priced out', friction_type: 'external' }],
  functional_affects: ['indignation'],
  site_resonance: 'the meme touches the contested market edge',
  meme_summary: 'an ironic meme about displacement',
};

const validPass2 = {
  pass: 2,
  operator: 'reassignment',
  targets: ['adjacency', 'threshold'],
  target_reasoning: 'the tension acts on who is next to whom',
  magnitude: 0.4,
  decay: 0.2,
  cutter: validCutter,
  confidence_vector: {
    rhetorical_clarity: 0.9,
    site_resonance: 0.7,
    affective_coherence: 0.8,
    operational_specificity: 0.5,
  },
  confidence_note: 'site resonance is the strained axis',
  reasoning: 'displacement maps to a reassignment of adjacency edges',
};

describe('validateAndReturnTwoPass', () => {
  it('accepts a well-formed two-pass response (array form)', () => {
    const result = validateAndReturnTwoPass([validPass1, validPass2], 'test-model');
    expect(result.ok).toBe(true);
  });

  it('accepts the object form { pass1, pass2 }', () => {
    const result = validateAndReturnTwoPass({ pass1: validPass1, pass2: validPass2 }, 'test-model');
    expect(result.ok).toBe(true);
  });

  it('rejects an operator outside the allowed set — the #62 regression', () => {
    // "juxtaposition" is a rhetorical move, not an operator. This is the exact
    // value that produced the original 422 in the field.
    const bad = { ...validPass2, operator: 'juxtaposition' };
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('operator must be one of');
  });

  it('rejects a target that is not a valid edge type', () => {
    const bad = { ...validPass2, targets: ['adjacency', 'not-an-edge'] };
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
  });

  it('rejects an out-of-range magnitude', () => {
    const bad = { ...validPass2, magnitude: 1.5 };
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
  });

  it('rejects a missing confidence vector', () => {
    const bad = { ...validPass2 } as Record<string, unknown>;
    delete bad.confidence_vector;
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
  });

  it('rejects a cutter with an out-of-bounds position', () => {
    const bad = { ...validPass2, cutter: { ...validCutter, position: [2, 0, 0] } };
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed pass 1 (bad friction_type)', () => {
    const badP1 = { ...validPass1, cultural_tensions: [{ description: 'x', friction_type: 'sideways' }] };
    const result = validateAndReturnTwoPass([badP1, validPass2], 'test-model');
    expect(result.ok).toBe(false);
  });
});

describe('validateAndReturnSingle', () => {
  const validSingle = {
    operator: 'amplification',
    targets: ['visibility'],
    magnitude: 0.6,
    decay: 0.1,
    reasoning: 'amplify the visible edges',
    cutter: validCutter,
  };

  it('accepts a well-formed single-pass response', () => {
    expect(validateAndReturnSingle(validSingle).ok).toBe(true);
  });

  it('rejects an invalid operator', () => {
    expect(validateAndReturnSingle({ ...validSingle, operator: 'juxtaposition' }).ok).toBe(false);
  });

  it('rejects an array (must be a JSON object)', () => {
    expect(validateAndReturnSingle([validSingle]).ok).toBe(false);
  });
});
