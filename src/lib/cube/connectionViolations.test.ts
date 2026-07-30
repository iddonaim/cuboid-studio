import { describe, it, expect } from 'vitest';
import { VARIATION_FACE_CUTS, type Face } from './connectionRules';
import { GRID_STRIDE } from './constants';
import {
  findConnectionViolations,
  toCheckableCubes,
  summarizeConnections,
  violationsSignature,
  type CheckableCube,
} from './connectionViolations';

const NO_ROTATION = { y: 0, x: 0 } as const;
type Cut = 'sphere' | 'cylinder';

/**
 * First variation whose given face carries *exactly* the given cut types.
 *
 * Exact rather than "contains", because a face carrying both types connects to
 * either — useful on its own, but useless for building a pair with a known
 * verdict. Discovered rather than hardcoded so these keep meaning if the
 * variation table is regenerated.
 */
function variationWithFace(face: Face, ...types: Cut[]): string {
  const want = new Set(types);
  for (const [id, faces] of VARIATION_FACE_CUTS) {
    const have = faces[face];
    if (have.size !== want.size) continue;
    if ([...want].every(t => have.has(t))) return id;
  }
  throw new Error(`no variation has exactly {${types.join(',')}} on ${face}`);
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
        { id: 'a', variationId: 'v-00', position: [0, 21, 0], rotation: NO_ROTATION },
      ])
    ).toEqual([]);
  });

  it('reports nothing when the faces share a cut type', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'sphere');
    expect(findConnectionViolations(pairAlongX(a, b))).toEqual([]);
  });

  it('reports exactly the refused pair, with the touching faces and what they carry', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    const violations = findConnectionViolations(pairAlongX(a, b));

    expect(violations).toHaveLength(1);
    const [v] = violations;
    expect(v.a).toMatchObject({ id: 'a', face: 'X_POS', cutLabel: 'sphere' });
    expect(v.b).toMatchObject({ id: 'b', face: 'X_NEG', cutLabel: 'cylinder' });
    expect(v.kind).toBe('crossed');
    expect(v.axis).toBe('x');
    // The marker sits midway between the two cube centres.
    expect(v.interfacePosition).toEqual([GRID_STRIDE / 2, 21, 0]);
  });

  it('refuses an uncut face against a cut one, and labels it shell', () => {
    const a = variationWithFace('X_POS'); // no cut types = shell
    const b = variationWithFace('X_NEG', 'sphere');
    const violations = findConnectionViolations(pairAlongX(a, b));

    expect(violations).toHaveLength(1);
    expect(violations[0].a.cutLabel).toBe('shell');
    expect(violations[0].kind).toBe('shell');
  });

  it('a face carrying both cut types connects to either', () => {
    // 38.6% of variation faces carry a sphere cut and a cylinder cut. Those
    // faces are the reason a face is a set rather than one type.
    const both = variationWithFace('X_POS', 'sphere', 'cylinder');
    for (const type of ['sphere', 'cylinder'] as Cut[]) {
      const other = variationWithFace('X_NEG', type);
      expect(findConnectionViolations(pairAlongX(both, other))).toEqual([]);
    }
  });

  it('ignores cubes that are not adjacent, however badly their faces disagree', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    expect(
      findConnectionViolations([
        { id: 'a', variationId: a, position: [0, 21, 0], rotation: NO_ROTATION },
        { id: 'b', variationId: b, position: [GRID_STRIDE * 3, 21, 0], rotation: NO_ROTATION },
      ])
    ).toEqual([]);
  });

  it('reports each pair once, not once per direction', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    const reversed = [...pairAlongX(a, b)].reverse();
    expect(findConnectionViolations(reversed)).toHaveLength(1);
  });

  it('does not check the ground — a lone cube on the ground plane is clean', () => {
    // If the ground were treated as a shell face, any cube with an uncut bottom
    // would report a violation just for standing there.
    const shellBottom = variationWithFace('Y_NEG');
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
    const cubes = pairAlongX(
      variationWithFace('X_POS', 'sphere'),
      variationWithFace('X_NEG', 'cylinder')
    );
    const snapshot = JSON.parse(JSON.stringify(cubes));
    const first = findConnectionViolations(cubes);
    expect(findConnectionViolations(cubes)).toEqual(first);
    expect(cubes).toEqual(snapshot);
  });

  it('finds refusals when cubes are stacked vertically', () => {
    const above = variationWithFace('Y_POS', 'sphere');
    const below = variationWithFace('Y_NEG', 'cylinder');
    const violations = findConnectionViolations([
      { id: 'a', variationId: above, position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: below, position: [0, 21 + GRID_STRIDE, 0], rotation: NO_ROTATION },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0].axis).toBe('y');
  });

  it('allows unrotated depth contacts, which the old face model made impossible', () => {
    // Regression guard for GAPS P0-6. The previous derivation recorded every
    // depth face as uncut, so ANY unrotated front-to-back contact was refused.
    // Depth faces are genuinely cut on all 70 variations (render frame).
    const a = variationWithFace('Z_POS', 'sphere');
    const b = variationWithFace('Z_NEG', 'sphere');
    const violations = findConnectionViolations([
      { id: 'a', variationId: a, position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: b, position: [0, 21, GRID_STRIDE], rotation: NO_ROTATION },
    ]);
    expect(violations).toEqual([]);
  });
});

describe('the corrected face model (GAPS P0-6)', () => {
  // These are facts about the 70 variations, measured from the cutter geometry.
  // The old model got every one of them wrong; they are locked down so a
  // regression in faceCuts.ts fails here loudly rather than quietly changing
  // every connection verdict in the app.
  const countUncut = (faces: Record<Face, ReadonlySet<Cut>>) =>
    (Object.keys(faces) as Face[]).filter(f => faces[f].size === 0).length;

  it('leaves at most two faces uncut, and usually zero or one', () => {
    const histogram = new Map<number, number>();
    for (const [, faces] of VARIATION_FACE_CUTS) {
      const n = countUncut(faces);
      histogram.set(n, (histogram.get(n) ?? 0) + 1);
    }
    expect(histogram.get(0)).toBe(35);
    expect(histogram.get(1)).toBe(33);
    expect(histogram.get(2)).toBe(2);
    expect(histogram.get(3)).toBeUndefined();
    expect(histogram.get(4)).toBeUndefined();
  });

  it('cuts a depth face on all 70 variations, a vertical face on 69', () => {
    // In the RENDER frame — the frame of the shipped models, which the spec is
    // converted into at MASTER_CUTTERS. The uncut faces live mostly on top and
    // bottom (15 each), where the fabricated models carry their hollowing rims;
    // the spec-frame version of this fact put them on the depth faces, which is
    // exactly the mismatch the conversion corrects.
    let depth = 0;
    let vertical = 0;
    for (const [, faces] of VARIATION_FACE_CUTS) {
      if (faces.Z_NEG.size > 0 || faces.Z_POS.size > 0) depth += 1;
      if (faces.Y_NEG.size > 0 || faces.Y_POS.size > 0) vertical += 1;
    }
    expect(depth).toBe(70);
    expect(vertical).toBe(69);
  });

  it('records both cut types on 38.6% of faces', () => {
    let mixed = 0;
    let total = 0;
    for (const [, faces] of VARIATION_FACE_CUTS) {
      for (const face of Object.keys(faces) as Face[]) {
        total += 1;
        if (faces[face].size > 1) mixed += 1;
      }
    }
    expect(total).toBe(420);
    expect(mixed).toBe(162);
  });

  it('cuts every axis, depth included', () => {
    const anyCut = (face: Face) =>
      [...VARIATION_FACE_CUTS.values()].some(faces => faces[face].size > 0);
    for (const face of ['X_NEG', 'X_POS', 'Y_NEG', 'Y_POS', 'Z_NEG', 'Z_POS'] as Face[]) {
      expect(anyCut(face), face).toBe(true);
    }
  });
});

describe('summarizeConnections', () => {
  it('reports the denominator every refusal count needs', () => {
    const a = variationWithFace('X_POS', 'sphere');
    const b = variationWithFace('X_NEG', 'cylinder');
    const row: CheckableCube[] = [
      { id: 'a', variationId: a, position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: b, position: [GRID_STRIDE, 21, 0], rotation: NO_ROTATION },
      { id: 'c', variationId: b, position: [GRID_STRIDE * 2, 21, 0], rotation: NO_ROTATION },
    ];
    expect(summarizeConnections(row).totalAdjacencies).toBe(2);
  });

  it('counts open adjacencies in the total but not as violations', () => {
    const summary = summarizeConnections(
      pairAlongX(variationWithFace('X_POS', 'sphere'), variationWithFace('X_NEG', 'sphere'))
    );
    expect(summary.totalAdjacencies).toBe(1);
    expect(summary.violations).toHaveLength(0);
  });

  it('separates an uncut face from two cut faces that disagree', () => {
    const wall = summarizeConnections(
      pairAlongX(variationWithFace('X_POS'), variationWithFace('X_NEG', 'sphere'))
    );
    expect(wall.shell).toBe(1);
    expect(wall.crossed).toBe(0);
    expect(wall.violations[0].kind).toBe('shell');

    const crossed = summarizeConnections(
      pairAlongX(variationWithFace('X_POS', 'sphere'), variationWithFace('X_NEG', 'cylinder'))
    );
    expect(crossed.shell).toBe(0);
    expect(crossed.crossed).toBe(1);
    expect(crossed.violations[0].kind).toBe('crossed');
  });

  it('names every cube taking part in a refusal, each once', () => {
    const outer = variationWithFace('X_POS', 'sphere');
    const middle = variationWithFace('X_NEG', 'cylinder');
    const summary = summarizeConnections([
      { id: 'a', variationId: outer, position: [0, 21, 0], rotation: NO_ROTATION },
      { id: 'b', variationId: middle, position: [GRID_STRIDE, 21, 0], rotation: NO_ROTATION },
      { id: 'c', variationId: outer, position: [GRID_STRIDE * 2, 21, 0], rotation: NO_ROTATION },
    ]);
    expect(summary.cubeIds.has('b')).toBe(true);
    expect(summary.cubeIds.size).toBeLessThanOrEqual(3);
  });

  it('is empty and zeroed for an assembly too small to have adjacencies', () => {
    const summary = summarizeConnections([]);
    expect(summary).toMatchObject({ totalAdjacencies: 0, shell: 0, crossed: 0 });
    expect(summary.violations).toEqual([]);
    expect(summary.cubeIds.size).toBe(0);
  });
});

describe('violationsSignature', () => {
  it('is stable regardless of the order violations were found in', () => {
    const cubes = pairAlongX(
      variationWithFace('X_POS', 'sphere'),
      variationWithFace('X_NEG', 'cylinder')
    );
    expect(violationsSignature(findConnectionViolations(cubes))).toBe(
      violationsSignature(findConnectionViolations([...cubes].reverse()))
    );
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
