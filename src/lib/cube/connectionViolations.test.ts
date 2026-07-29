import { describe, it, expect } from 'vitest';
import {
  VARIATION_FACE_TYPES,
  type Face,
  type FaceCutType,
} from './connectionRules';
import { GRID_STRIDE } from './constants';
import {
  findConnectionViolations,
  toCheckableCubes,
  summarizeConnections,
  violationsSignature,
  type CheckableCube,
} from './connectionViolations';

const NO_ROTATION = { y: 0, x: 0 } as const;

/** First variation in the vocabulary whose given face carries the given cut
 *  type at rest. Discovered rather than hardcoded so the tests keep meaning if
 *  the variation table is ever regenerated. */
function variationWithFace(face: Face, type: FaceCutType): string {
  for (const [id, faces] of VARIATION_FACE_TYPES) {
    if (faces[face] === type) return id;
  }
  throw new Error(`no variation has a ${type} on ${face}`);
}

/** Two cubes side by side along X: A's X_POS meets B's X_NEG. */
function pairAlongX(variationA: string, variationB: string): CheckableCube[] {
  return [
    { id: 'a', variationId: variationA, position: [0, 21, 0], rotation: NO_ROTATION },
    { id: 'b', variationId: variationB, position: [GRID_STRIDE, 21, 0], rotation: NO_ROTATION },
  ];
}

describe('findConnectionViolations', () => {
  it('reports nothing for an empty or single-cube assembly', () => {
    expect(findConnectionViolations([])).toEqual([]);
    expect(
      findConnectionViolations([
        { id: 'a', variationId: variationWithFace('X_POS', 'sphere'), position: [0, 21, 0], rotation: NO_ROTATION },
      ])
    ).toEqual([]);
  });

  it('reports nothing when matching cut types meet', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'sphere');
    expect(findConnectionViolations(pairAlongX(a, b))).toEqual([]);
  });

  it('reports exactly the illegal pair, with the touching faces and types', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    const violations = findConnectionViolations(pairAlongX(a, b));

    expect(violations).toHaveLength(1);
    const [v] = violations;
    expect(v.a).toMatchObject({ id: 'a', face: 'X_POS', cutType: 'sphere' });
    expect(v.b).toMatchObject({ id: 'b', face: 'X_NEG', cutType: 'cylinder' });
    expect(v.axis).toBe('x');
    // The marker sits midway between the two cube centres.
    expect(v.interfacePosition).toEqual([GRID_STRIDE / 2, 21, 0]);
  });

  it('reports a shell adjacency — growth stops at uncut faces', () => {
    const a = variationWithFace('X_POS', 'shell');
    const b = variationWithFace('X_NEG', 'sphere');
    const violations = findConnectionViolations(pairAlongX(a, b));

    expect(violations).toHaveLength(1);
    expect(violations[0].a.cutType).toBe('shell');
  });

  it('reports a shell meeting a shell', () => {
    const a = variationWithFace('X_POS', 'shell');
    const b = variationWithFace('X_NEG', 'shell');
    expect(findConnectionViolations(pairAlongX(a, b))).toHaveLength(1);
  });

  it('ignores cubes that are not adjacent, however badly their faces disagree', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    const apart: CheckableCube[] = [
      { id: 'a', variationId: a, position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: b, position: [GRID_STRIDE * 3, 21, 0], rotation: NO_ROTATION },
    ];
    expect(findConnectionViolations(apart)).toEqual([]);
  });

  it('reports each pair once, not once per direction', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    // Same pair, given in the reverse order.
    const reversed = [...pairAlongX(a, b)].reverse();
    expect(findConnectionViolations(reversed)).toHaveLength(1);
  });

  it('does not check the ground — a lone cube on the ground plane is clean', () => {
    // Every cube has a bottom face, and most are shells. If the ground were
    // treated as a shell face, this would report a violation.
    const shellBottom = variationWithFace('Y_NEG', 'shell');
    expect(
      findConnectionViolations([
        { id: 'a', variationId: shellBottom, position: [0, 21, 0], rotation: NO_ROTATION },
      ])
    ).toEqual([]);
  });

  it('skips cubes whose variation is not in the vocabulary rather than reporting them', () => {
    const known = variationWithFace('X_POS', 'sphere');
    const withUnknown: CheckableCube[] = [
      { id: 'a', variationId: known, position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: 'v-does-not-exist', position: [GRID_STRIDE, 21, 0], rotation: NO_ROTATION },
    ];
    expect(() => findConnectionViolations(withUnknown)).not.toThrow();
    expect(findConnectionViolations(withUnknown)).toEqual([]);
  });

  it('is pure — repeated calls agree and the input is untouched', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    const cubes = pairAlongX(a, b);
    const snapshot = JSON.parse(JSON.stringify(cubes));

    const first = findConnectionViolations(cubes);
    const second = findConnectionViolations(cubes);

    expect(second).toEqual(first);
    expect(cubes).toEqual(snapshot);
  });

  it('finds violations when cubes are stacked vertically', () => {
    const above = variationWithFace('Y_POS', 'sphere');
    const below = variationWithFace('Y_NEG', 'cylinder');
    const stacked: CheckableCube[] = [
      { id: 'a', variationId: above, position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: below, position: [0, 21 + GRID_STRIDE, 0], rotation: NO_ROTATION },
    ];
    const violations = findConnectionViolations(stacked);
    expect(violations).toHaveLength(1);
    expect(violations[0].axis).toBe('y');
  });

  it('finds violations along the depth axis', () => {
    // Follows from the (incorrect) face model: it records every Z face as
    // shell, so any unrotated depth adjacency reads as closed. See the
    // face-model describe block below — this is behaviour, not geometry.
    const cubes: CheckableCube[] = [
      { id: 'a', variationId: 'v-00', position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: 'v-01', position: [0, 21, GRID_STRIDE], rotation: NO_ROTATION },
    ];
    const violations = findConnectionViolations(cubes);
    expect(violations).toHaveLength(1);
    expect(violations[0].axis).toBe('z');
    expect(violations[0].a.cutType).toBe('shell');
    expect(violations[0].b.cutType).toBe('shell');
  });

  it('clears a depth adjacency once the cubes are tipped to face each other', () => {
    // An X-rotation brings a face the model records as cut round to the depth
    // axis. Under the current (incorrect) face model this is the only way two
    // cubes read as meeting in depth.
    const tipped = { y: 0, x: 1 } as const;
    const cubes: CheckableCube[] = [
      { id: 'a', variationId: 'v-00', position: [0, 21, 0], rotation: tipped },
      { id: 'b', variationId: 'v-00', position: [0, 21, GRID_STRIDE], rotation: tipped },
    ];
    expect(findConnectionViolations(cubes)).toEqual([]);
  });
});

describe('the face model the law reads — NOT the real geometry', () => {
  // ⛔ These assertions describe what `computeFaceCutTypes` currently believes,
  // and it is WRONG. `getSphereFace()` returns a single face and
  // `getCylinderFaces()` only the two faces perpendicular to the axis, but the
  // master spheres (r 9.9–17.1 on a 42mm cube) breach two or three faces and
  // the cylinders (length 51) breach side faces too. Measured against the
  // cutter specs: 69 of 70 variations have a depth face genuinely cut, and 68
  // of 70 have zero or one uncut face — the code believes 0 and 2–4.
  //
  // They are kept, and named honestly, so the gap is visible and so a fix to
  // computeFaceCutTypes fails loudly here instead of silently changing every
  // connection verdict in the app. Do NOT cite them as facts about the cubes.
  it('believes every variation is shell on both depth faces (it is not)', () => {
    expect(VARIATION_FACE_TYPES.size).toBeGreaterThan(0);
    for (const [id, faces] of VARIATION_FACE_TYPES) {
      expect(faces.Z_NEG, `${id} Z_NEG`).toBe('shell');
      expect(faces.Z_POS, `${id} Z_POS`).toBe('shell');
    }
  });

  it('records cut faces on the horizontal and vertical axes', () => {
    const nonShell = (face: Face) =>
      [...VARIATION_FACE_TYPES.values()].some(types => types[face] !== 'shell');
    expect(nonShell('X_NEG')).toBe(true);
    expect(nonShell('X_POS')).toBe(true);
    expect(nonShell('Y_NEG')).toBe(true);
    expect(nonShell('Y_POS')).toBe(true);
  });
});

describe('summarizeConnections', () => {
  it('reports the denominator every refusal count needs', () => {
    // Three cubes in a row: two adjacencies, whatever their verdicts.
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    const row: CheckableCube[] = [
      { id: 'a', variationId: a, position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: b, position: [GRID_STRIDE, 21, 0], rotation: NO_ROTATION },
      { id: 'c', variationId: b, position: [GRID_STRIDE * 2, 21, 0], rotation: NO_ROTATION },
    ];
    expect(summarizeConnections(row).totalAdjacencies).toBe(2);
  });

  it('counts legal adjacencies in the total but not as violations', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'sphere');
    const summary = summarizeConnections(pairAlongX(a, b));
    expect(summary.totalAdjacencies).toBe(1);
    expect(summary.violations).toHaveLength(0);
  });

  it('separates a blank wall from a door meeting a window', () => {
    const wall = summarizeConnections(
      pairAlongX(variationWithFace('X_POS', 'shell'), variationWithFace('X_NEG', 'sphere'))
    );
    expect(wall.shell).toBe(1);
    expect(wall.crossed).toBe(0);
    expect(wall.violations[0].kind).toBe('shell');

    const crossedSummary = summarizeConnections(
      pairAlongX(variationWithFace('X_POS', 'sphere'), variationWithFace('X_NEG', 'cylinder'))
    );
    expect(crossedSummary.shell).toBe(0);
    expect(crossedSummary.crossed).toBe(1);
    expect(crossedSummary.violations[0].kind).toBe('crossed');
  });

  it('names every cube taking part in a refusal, each once', () => {
    // A middle cube refused on both sides is still one cube to outline.
    const left = variationWithFace('X_POS', 'sphere');
    const middle = variationWithFace('X_NEG', 'cylinder');
    const row: CheckableCube[] = [
      { id: 'a', variationId: left, position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: middle, position: [GRID_STRIDE, 21, 0], rotation: NO_ROTATION },
      { id: 'c', variationId: left, position: [GRID_STRIDE * 2, 21, 0], rotation: NO_ROTATION },
    ];
    const summary = summarizeConnections(row);
    expect(summary.cubeIds.has('b')).toBe(true);
    expect(summary.cubeIds.size).toBeLessThanOrEqual(3);
  });

  it('is empty and zeroed for an assembly too small to have adjacencies', () => {
    const summary = summarizeConnections([]);
    expect(summary).toMatchObject({
      totalAdjacencies: 0,
      shell: 0,
      crossed: 0,
    });
    expect(summary.violations).toEqual([]);
    expect(summary.cubeIds.size).toBe(0);
  });
});
