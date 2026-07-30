import { describe, it, expect } from 'vitest';
import {
  VARIATION_FACE_CUTS,
  getRotatedFaceCuts,
  getAllRotations,
  ALL_FACES,
  DEFAULT_ROTATION,
  type Face,
} from './connectionRules';

/**
 * Rotating a cube moves its faces around; it cannot create or destroy cuts.
 * If the world-face → local-face mapping were wrong, these would fail — and a
 * wrong mapping is indistinguishable from a wrong connection law when you are
 * looking at the viewport.
 */
describe('rotation only permutes a cube’s faces', () => {
  const signature = (faces: Record<Face, ReadonlySet<'sphere' | 'cylinder'>>) =>
    ALL_FACES.map(f => [...faces[f]].sort().join('+') || '-').sort().join('|');

  it('the identity rotation changes nothing', () => {
    for (const [, faces] of VARIATION_FACE_CUTS) {
      for (const face of ALL_FACES) {
        expect(getRotatedFaceCuts(faces, face, DEFAULT_ROTATION)).toBe(faces[face]);
      }
    }
  });

  it('every rotation yields a permutation of the same six faces', () => {
    for (const [id, faces] of VARIATION_FACE_CUTS) {
      const atRest = signature(faces);
      for (const rotation of getAllRotations()) {
        const rotated = {} as Record<Face, ReadonlySet<'sphere' | 'cylinder'>>;
        for (const face of ALL_FACES) rotated[face] = getRotatedFaceCuts(faces, face, rotation);
        expect(signature(rotated), `${id} y=${rotation.y} x=${rotation.x}`).toBe(atRest);
      }
    }
  });

  it('an uncut face stays uncut under rotation — it just moves', () => {
    for (const [id, faces] of VARIATION_FACE_CUTS) {
      const uncutAtRest = ALL_FACES.filter(f => faces[f].size === 0).length;
      for (const rotation of getAllRotations()) {
        const uncut = ALL_FACES.filter(
          f => getRotatedFaceCuts(faces, f, rotation).size === 0
        ).length;
        expect(uncut, `${id} y=${rotation.y} x=${rotation.x}`).toBe(uncutAtRest);
      }
    }
  });
});
