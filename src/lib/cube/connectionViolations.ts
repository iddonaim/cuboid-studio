/**
 * Connection-law violations — find them, never fix them.
 * =====================================================
 *
 * The connection law lives in `canConnect` (connectionRules.ts) and is enforced
 * interactively in the Builder. Nothing else in the app is subject to it: an
 * encode result, a merge, a remix or a restored composition can all place cubes
 * whose touching faces the law would refuse.
 *
 * This module reports those refusals as data so they can be *shown*. It never
 * deletes, moves, rotates, repairs or rejects anything — the engine is allowed
 * to make mistakes, and the mistakes are material for the architect's judgment.
 *
 * WHAT IT CHECKS — and what it deliberately does not:
 *
 * - Face cut types come from the **base variation** (`VARIATION_FACE_TYPES`,
 *   computed once at module load from each variation's cutter spec). Operators
 *   applied on top by a meme translation do not feed back into them. That is
 *   correct for this checker's purpose: the law governs the *encoding build*.
 *   Once a meme re-cuts a face, the assembly has moved past what the law
 *   describes and the check is context rather than a live finding.
 * - **Cube-to-cube only.** The ground plane is not checked.
 *   `isGroundPlacementValid()` is an unconditional `true` — a deliberate
 *   carve-out ("ground acts as shell, accepts anything"). Treating the ground
 *   as a shell face here would flag nearly every ground-level cube and make the
 *   whole signal worthless.
 * - **`canConnect` only**, never `canConnectStrict`. Strict alignment is a
 *   separate, optional Builder mode; a violation reported here means the
 *   connection law and nothing else.
 */

import {
  Face,
  FaceCutType,
  Rotation,
  OPPOSITE_FACE,
  VARIATION_FACE_TYPES,
  getRotatedFaceCutType,
  canConnect,
  getAdjacentFace,
} from './connectionRules';
import { GRID_STRIDE } from './constants';

/** The minimum a cube needs to expose to be checkable. `PlacedCube` satisfies
 *  this as-is; an encode result's cubes do once they carry an id. */
export interface CheckableCube {
  id: string;
  variationId: string;
  position: [number, number, number];
  rotation: Rotation;
}

/**
 * Why an adjacency was refused. The two are different failures and read
 * differently: a blank wall means growth ran into an uncut face (every
 * unrotated depth adjacency is one of these, since no variation carries a cut
 * on either depth face at rest), while a mismatch means two openings met that
 * don't agree — a door against a window.
 */
export type ViolationKind = 'blank-wall' | 'mismatch';

/** One refused adjacency, as data. Recomputed on display, never persisted. */
export interface ConnectionViolation {
  /** Stable key for this pair, ordered so it doesn't depend on input order. */
  key: string;
  a: { id: string; variationId: string; face: Face; cutType: FaceCutType };
  b: { id: string; variationId: string; face: Face; cutType: FaceCutType };
  /** Midpoint of the shared interface in world units. */
  interfacePosition: [number, number, number];
  /** Which axis the two cubes are separated along. */
  axis: 'x' | 'y' | 'z';
  kind: ViolationKind;
}

/** Everything the UI needs about an assembly's adjacencies, in one pass. A
 *  count of refusals means little without the total it is drawn from. */
export interface ConnectionSummary {
  violations: ConnectionViolation[];
  /** Every adjacency in the assembly, legal or not — the denominator. */
  totalAdjacencies: number;
  /** Refusals where at least one face is an uncut wall. */
  blankWall: number;
  /** Refusals where a door met a window. */
  mismatch: number;
  /** Ids of every cube taking part in at least one refusal. */
  cubeIds: Set<string>;
}

const AXIS_FOR_FACE: Record<Face, 'x' | 'y' | 'z'> = {
  X_NEG: 'x',
  X_POS: 'x',
  Y_NEG: 'y',
  Y_POS: 'y',
  Z_NEG: 'z',
  Z_POS: 'z',
};

/** Grid-cell key, so neighbour lookup is a map hit rather than an n² scan. */
function cellKey(position: [number, number, number], stride: number): string {
  return [
    Math.round(position[0] / stride),
    Math.round(position[1] / stride),
    Math.round(position[2] / stride),
  ].join(',');
}

/**
 * Every adjacent pair in `cubes` whose touching faces the connection law
 * refuses. Pure: same input, same output, no side effects, no store reads.
 *
 * Each pair is reported once. Cubes whose `variationId` isn't in the vocabulary
 * are skipped rather than reported — an unknown variation is a different
 * problem and this function does not invent findings about it.
 */
export function findConnectionViolations(
  cubes: CheckableCube[],
  gridStride: number = GRID_STRIDE
): ConnectionViolation[] {
  return summarizeConnections(cubes, gridStride).violations;
}

/**
 * The same walk, reporting the total it drew from as well as the refusals.
 *
 * "25 adjacencies violate the law" says nothing without a denominator — 25 out
 * of 30 is a different assembly from 25 out of 400. The breakdown separates the
 * two kinds of refusal, which have different causes and different fixes.
 */
export function summarizeConnections(
  cubes: CheckableCube[],
  gridStride: number = GRID_STRIDE
): ConnectionSummary {
  const empty: ConnectionSummary = {
    violations: [],
    totalAdjacencies: 0,
    blankWall: 0,
    mismatch: 0,
    cubeIds: new Set(),
  };
  if (cubes.length < 2) return empty;

  const byCell = new Map<string, CheckableCube>();
  for (const cube of cubes) {
    byCell.set(cellKey(cube.position, gridStride), cube);
  }

  const violations: ConnectionViolation[] = [];
  const cubeIds = new Set<string>();
  let totalAdjacencies = 0;
  let blankWall = 0;
  let mismatch = 0;

  // Walk only the +X, +Y and +Z neighbours so each pair is visited exactly once.
  const forwardSteps: [number, number, number][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (const cube of cubes) {
    const faceTypesA = VARIATION_FACE_TYPES.get(cube.variationId);
    if (!faceTypesA) continue;

    const cell = [
      Math.round(cube.position[0] / gridStride),
      Math.round(cube.position[1] / gridStride),
      Math.round(cube.position[2] / gridStride),
    ];

    for (const step of forwardSteps) {
      const neighbourKey = [cell[0] + step[0], cell[1] + step[1], cell[2] + step[2]].join(',');
      const neighbour = byCell.get(neighbourKey);
      if (!neighbour) continue;

      const faceTypesB = VARIATION_FACE_TYPES.get(neighbour.variationId);
      if (!faceTypesB) continue;

      // `getAdjacentFace` is the single authority on the position→face
      // convention; deriving it here by hand would be a second copy of the rule.
      const faceOnA = getAdjacentFace(cube.position, neighbour.position, gridStride);
      if (!faceOnA) continue;
      const faceOnB = OPPOSITE_FACE[faceOnA];

      const cutTypeA = getRotatedFaceCutType(faceTypesA, faceOnA, cube.rotation);
      const cutTypeB = getRotatedFaceCutType(faceTypesB, faceOnB, neighbour.rotation);

      // Counted before the verdict: this is a real adjacency either way, and
      // it is the denominator the refusal count is meaningless without.
      totalAdjacencies += 1;

      if (canConnect(cutTypeA, cutTypeB)) continue;

      const kind: ViolationKind =
        cutTypeA === 'shell' || cutTypeB === 'shell' ? 'blank-wall' : 'mismatch';
      if (kind === 'blank-wall') blankWall += 1;
      else mismatch += 1;

      cubeIds.add(cube.id);
      cubeIds.add(neighbour.id);

      violations.push({
        key: [cube.id, neighbour.id].sort().join('::'),
        a: { id: cube.id, variationId: cube.variationId, face: faceOnA, cutType: cutTypeA },
        b: {
          id: neighbour.id,
          variationId: neighbour.variationId,
          face: faceOnB,
          cutType: cutTypeB,
        },
        interfacePosition: [
          (cube.position[0] + neighbour.position[0]) / 2,
          (cube.position[1] + neighbour.position[1]) / 2,
          (cube.position[2] + neighbour.position[2]) / 2,
        ],
        axis: AXIS_FOR_FACE[faceOnA],
        kind,
      });
    }
  }

  return { violations, totalAdjacencies, blankWall, mismatch, cubeIds };
}

/** Shape shared by every cube record in the app that this checker accepts —
 *  `PlacedCube`, an encode result's cube, a restored composition's cube. */
interface CubeLike {
  id?: string;
  variationId: string;
  position: [number, number, number];
  rotation: { x: number; y: number };
}

/**
 * Adapt any of those records into checkable cubes.
 *
 * An encode result's cubes only carry ids once the encoding store assigns them,
 * so a cube without one falls back to its grid cell — unique by construction,
 * since a cell holds at most one cube. The rotation cast is safe: every
 * producer writes quarter-turn indices, and `getRotatedFaceCutType` reduces
 * modulo 4 regardless.
 */
export function toCheckableCubes(cubes: CubeLike[]): CheckableCube[] {
  return cubes.map(cube => ({
    id: cube.id ?? `@${cube.position.join(',')}`,
    variationId: cube.variationId,
    position: cube.position,
    rotation: cube.rotation as Rotation,
  }));
}

/** Stable signature of a violation set — used to re-surface a dismissed notice
 *  when the violations actually change, rather than nagging on every render. */
export function violationsSignature(violations: ConnectionViolation[]): string {
  return violations
    .map(v => v.key)
    .sort()
    .join('|');
}

/** Plain-language name for a face's cut type, for the notice and the panel. */
export function cutTypeLabel(type: FaceCutType): string {
  if (type === 'sphere') return 'door';
  if (type === 'cylinder') return 'window';
  return 'blank wall';
}
