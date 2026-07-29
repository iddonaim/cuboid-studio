import { describe, it, expect } from 'vitest';
import {
  ALL_FACES,
  OPPOSITE_FACE,
  FACE_DIRECTIONS,
  canConnect,
  makeRotation,
  rotationsEqual,
  findRotationIndex,
  getAllRotations,
  type Face,
} from './connectionRules';

describe('face geometry invariants', () => {
  it('opposite of the opposite is the original face', () => {
    for (const face of ALL_FACES) {
      expect(OPPOSITE_FACE[OPPOSITE_FACE[face]]).toBe(face);
    }
  });

  it('a face is never its own opposite', () => {
    for (const face of ALL_FACES) {
      expect(OPPOSITE_FACE[face]).not.toBe(face);
    }
  });

  it('opposite faces point in exactly negated directions', () => {
    for (const face of ALL_FACES) {
      const dir = FACE_DIRECTIONS[face];
      const oppDir = FACE_DIRECTIONS[OPPOSITE_FACE[face]];
      // `-c` turns 0 into -0, which deep-equality treats as distinct; the `+ 0`
      // normalises -0 back to 0 so we compare the intended axis vectors.
      expect(oppDir).toEqual(dir.map(c => -c + 0));
    }
  });

  it('each face direction is a unit axis vector', () => {
    for (const face of ALL_FACES) {
      const dir = FACE_DIRECTIONS[face];
      const magnitude = Math.hypot(...dir);
      expect(magnitude).toBe(1);
      expect(dir.filter(c => c !== 0)).toHaveLength(1);
    }
  });
});

describe('canConnect — an uncut face blocks growth, shared cut types join', () => {
  const cuts = (...types: ('sphere' | 'cylinder')[]) => new Set(types);
  const SHELL = new Set<'sphere' | 'cylinder'>();

  it('connects two sphere faces', () => {
    expect(canConnect(cuts('sphere'), cuts('sphere'))).toBe(true);
  });

  it('connects two cylinder faces', () => {
    expect(canConnect(cuts('cylinder'), cuts('cylinder'))).toBe(true);
  });

  it('does not connect a sphere face to a cylinder face', () => {
    expect(canConnect(cuts('sphere'), cuts('cylinder'))).toBe(false);
    expect(canConnect(cuts('cylinder'), cuts('sphere'))).toBe(false);
  });

  it('an uncut face blocks every connection', () => {
    for (const other of [cuts('sphere'), cuts('cylinder'), SHELL]) {
      expect(canConnect(SHELL, other)).toBe(false);
      expect(canConnect(other, SHELL)).toBe(false);
    }
  });

  // A face opened by both a sphere and a cylinder is the common case, not an
  // edge case — 38.6% of variation faces. It joins either kind.
  it('a face carrying both cut types connects to either', () => {
    const both = cuts('sphere', 'cylinder');
    expect(canConnect(both, cuts('sphere'))).toBe(true);
    expect(canConnect(both, cuts('cylinder'))).toBe(true);
    expect(canConnect(both, both)).toBe(true);
    expect(canConnect(both, SHELL)).toBe(false);
  });

  it('is symmetric', () => {
    const all = [SHELL, cuts('sphere'), cuts('cylinder'), cuts('sphere', 'cylinder')];
    for (const a of all) for (const b of all) {
      expect(canConnect(a, b)).toBe(canConnect(b, a));
    }
  });
});

describe('rotations', () => {
  it('enumerates 16 unique rotations (4 × 4)', () => {
    const all = getAllRotations();
    expect(all).toHaveLength(16);
    const keys = new Set(all.map(r => `${r.y},${r.x}`));
    expect(keys.size).toBe(16);
  });

  it('rotationsEqual and findRotationIndex agree', () => {
    const all = getAllRotations();
    const target = makeRotation(2, 3);
    const idx = findRotationIndex(all, target);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(rotationsEqual(all[idx], target)).toBe(true);
  });

  it('returns -1 for a rotation not present', () => {
    // makeRotation is typed to 0..3, so cast a deliberately out-of-range value.
    const absent = { y: 9, x: 9 } as unknown as ReturnType<typeof makeRotation>;
    expect(findRotationIndex(getAllRotations(), absent)).toBe(-1);
  });
});

// Touch the Face type so the import is exercised even if assertions above change.
const _sample: Face = 'X_NEG';
void _sample;
