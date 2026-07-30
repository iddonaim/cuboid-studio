import { describe, it, expect } from 'vitest';
import { CUBE_VARIATIONS, MASTER_CUTTERS } from './specifications';
import { computeFaceCuts, isShell } from './faceCuts';
import type { Face } from './faceCuts';

/**
 * The spec must describe the models the user is actually looking at.
 *
 * The cutter constants are authored in the Grasshopper document's frame (Z up);
 * the shipped GLBs went through the standard Rhino→glTF conversion (Y up).
 * Until the conversion was applied to the spec too, the connection law judged a
 * rotated twin of every cube on screen — 38 of 70 models disagreed with it
 * about which faces are uncut, and a placement preview could sit green on a
 * face the viewer could see is a shell.
 *
 * Every fact below was MEASURED from the shipped models, not derived from the
 * spec: `scripts/measure-glb-face-solidity.cjs` decodes each GLB and reports
 * how much of each face plane is solid. An uncut face shows up either as a
 * hollowing rim (~14.7% solid — exactly what the 1.6 wall thickness predicts)
 * or as a full panel (~100%). These witnesses cover all six face directions,
 * so any frame slip — a wrong axis, a wrong sign, a reflection — breaks
 * several of them at once.
 */
describe('the spec lives in the render frame of the shipped models', () => {
  const uncutFacesOf = (id: string): Face[] => {
    const variation = CUBE_VARIATIONS.find(v => v.id === id)!;
    const cuts = computeFaceCuts(variation);
    return (Object.keys(cuts) as Face[]).filter(f => isShell(cuts[f])).sort();
  };

  it('matches the measured uncut faces of witness models in all six directions', () => {
    // v-33.glb: hollowing rim on TOP. This is the variation whose "shelled face
    // allowing placement" was reported twice from the field — the law believed
    // its shell was on a depth face.
    expect(uncutFacesOf('v-33')).toEqual(['Y_POS']);

    // v-36.glb: rim on the BOTTOM.
    expect(uncutFacesOf('v-36')).toEqual(['Y_NEG']);

    // v-57.glb: rim on +X — the only lateral-shell family.
    expect(uncutFacesOf('v-57')).toEqual(['X_POS']);

    // The two double-shell models, one uncut face fabricated as the hollow
    // rim and the other left as a full closed panel:
    expect(uncutFacesOf('v-38')).toEqual(['Y_NEG', 'Z_POS'].sort());
    expect(uncutFacesOf('v-54')).toEqual(['Y_NEG', 'Y_POS'].sort());
  });

  it('distributes the 37 uncut faces the way the models do', () => {
    const where: Partial<Record<Face, number>> = {};
    for (const variation of CUBE_VARIATIONS) {
      const cuts = computeFaceCuts(variation);
      for (const face of Object.keys(cuts) as Face[]) {
        if (isShell(cuts[face])) where[face] = (where[face] ?? 0) + 1;
      }
    }
    expect(where).toEqual({ Y_POS: 15, Y_NEG: 15, X_POS: 5, Z_NEG: 1, Z_POS: 1 });
  });

  it('keeps every cutter inside reach of the cube box', () => {
    // A botched conversion tends to throw geometry outside [0,42]³ entirely;
    // every cutter must still overlap the cube it is supposed to cut.
    for (const cutter of MASTER_CUTTERS) {
      if (cutter.type === 'sphere') {
        for (let axis = 0; axis < 3; axis++) {
          expect(cutter.center[axis]).toBeGreaterThan(-cutter.radius);
          expect(cutter.center[axis]).toBeLessThan(42 + cutter.radius);
        }
      } else {
        const lo = Math.min(
          cutter.planeOrigin[0] + Math.min(0, cutter.extrusionVector[0]),
          cutter.planeOrigin[1] + Math.min(0, cutter.extrusionVector[1]),
          cutter.planeOrigin[2] + Math.min(0, cutter.extrusionVector[2])
        );
        expect(lo).toBeLessThan(42);
      }
    }
  });
});
