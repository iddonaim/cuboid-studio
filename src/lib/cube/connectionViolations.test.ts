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

  it('reports a shell adjacency — growth stops at blank walls', () => {
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
    // Every variation is shell on both Z faces at rest (see the vocabulary
    // invariant below), so any unrotated depth adjacency is a violation.
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
    // An X-rotation brings a cut face around to the depth axis. This is the
    // only way two cubes can legally meet in depth.
    const tipped = { y: 0, x: 1 } as const;
    const cubes: CheckableCube[] = [
      { id: 'a', variationId: 'v-00', position: [0, 21, 0], rotation: tipped },
      { id: 'b', variationId: 'v-00', position: [0, 21, GRID_STRIDE], rotation: tipped },
    ];
    expect(findConnectionViolations(cubes)).toEqual([]);
  });
});

describe('vocabulary invariant — the depth axis is closed at rest', () => {
  // Not a property of this checker but of the 70 variations themselves, and it
  // decides how the flag behaves in practice: an assembly that grows in depth
  // without tipping its cubes is refused at every one of those joints. Locked
  // down here so a regenerated variation table can't change it silently.
  it('every variation is a blank wall on both depth faces at rest', () => {
    expect(VARIATION_FACE_TYPES.size).toBeGreaterThan(0);
    for (const [id, faces] of VARIATION_FACE_TYPES) {
      expect(faces.Z_NEG, `${id} Z_NEG`).toBe('shell');
      expect(faces.Z_POS, `${id} Z_POS`).toBe('shell');
    }
  });

  it('the horizontal and vertical axes are open at rest', () => {
    const nonShell = (face: Face) =>
      [...VARIATION_FACE_TYPES.values()].some(types => types[face] !== 'shell');
    expect(nonShell('X_NEG')).toBe(true);
    expect(nonShell('X_POS')).toBe(true);
    expect(nonShell('Y_NEG')).toBe(true);
    expect(nonShell('Y_POS')).toBe(true);
  });
});

describe('violationsSignature', () => {
  it('is stable regardless of the order violations were found in', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    const cubes = pairAlongX(a, b);

    const forward = findConnectionViolations(cubes);
    const reverse = findConnectionViolations([...cubes].reverse());

    expect(violationsSignature(forward)).toBe(violationsSignature(reverse));
  });

  it('is empty when there is nothing to report', () => {
    expect(violationsSignature([])).toBe('');
  });
});

describe('toCheckableCubes', () => {
  it('keeps ids when present', () => {
    const [cube] = toCheckableCubes([
      { id: 'keep-me', variationId: 'v-00', position: [0, 21, 0], rotation: { x: 0, y: 0 } },
    ]);
    expect(cube.id).toBe('keep-me');
  });

  it('falls back to the grid cell for cubes without an id', () => {
    // Encode results only gain ids once the store assigns them; a cell holds at
    // most one cube, so the position is a safe stand-in.
    const [cube] = toCheckableCubes([
      { variationId: 'v-00', position: [0, 21, 0], rotation: { x: 0, y: 0 } },
    ]);
    expect(cube.id).toBe('@0,21,0');
  });

  it('gives distinct ids to distinct cells', () => {
    const cubes = toCheckableCubes([
      { variationId: 'v-00', position: [0, 21, 0], rotation: { x: 0, y: 0 } },
      { variationId: 'v-01', position: [GRID_STRIDE, 21, 0], rotation: { x: 0, y: 0 } },
    ]);
    expect(new Set(cubes.map(c => c.id)).size).toBe(2);
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
    expect(wall.blankWall).toBe(1);
    expect(wall.mismatch).toBe(0);
    expect(wall.violations[0].kind).toBe('blank-wall');

    const crossed = summarizeConnections(
      pairAlongX(variationWithFace('X_POS', 'sphere'), variationWithFace('X_NEG', 'cylinder'))
    );
    expect(crossed.blankWall).toBe(0);
    expect(crossed.mismatch).toBe(1);
    expect(crossed.violations[0].kind).toBe('mismatch');
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
      blankWall: 0,
      mismatch: 0,
    });
    expect(summary.violations).toEqual([]);
    expect(summary.cubeIds.size).toBe(0);
  });
});
