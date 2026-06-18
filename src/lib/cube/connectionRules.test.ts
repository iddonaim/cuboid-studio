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

describe('canConnect — wall blocks growth, like cutters join', () => {
  it('connects two doors (sphere ↔ sphere)', () => {
    expect(canConnect('sphere', 'sphere')).toBe(true);
  });

  it('connects two windows (cylinder ↔ cylinder)', () => {
    expect(canConnect('cylinder', 'cylinder')).toBe(true);
  });

  it('does not connect unlike cutters (sphere ↔ cylinder)', () => {
    expect(canConnect('sphere', 'cylinder')).toBe(false);
    expect(canConnect('cylinder', 'sphere')).toBe(false);
  });

  it('a shell (blank wall) blocks every connection', () => {
    const types = ['sphere', 'cylinder', 'shell'] as const;
    for (const t of types) {
      expect(canConnect('shell', t)).toBe(false);
      expect(canConnect(t, 'shell')).toBe(false);
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
