/**
 * Reading which contacts in an assembly are open — never changing any of them.
 * ==========================================================================
 *
 * The connection law lives in `canConnect` (connectionRules.ts) and is enforced
 * during interactive placement only. Nothing else in the app is subject to it: an
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
 *   as a shell face here would close nearly every ground-level cube and make
 *   the whole reading worthless.
 * - **`canConnect` only**, never `canConnectStrict`. Strict alignment is a
 *   separate, optional placement mode; a violation reported here means the
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
 * Why a contact is closed. Two different conditions:
 *
 * - `shell` — at least one face is uncut. Every unrotated depth contact is one
 *   of these, since no variation carries a cutter on either depth face.
 * - `crossed` — a sphere face meets a cylinder face. Both are cut; the cutters
 *   disagree.
 *
 * Named for the cutter geometry, which is what the rule actually reads. The
 * door/window/wall gloss is an interpretation laid on top and does not belong
 * in the mechanism.
 */
export type ContactKind = 'shell' | 'crossed';

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
  kind: ContactKind;
}

/** Everything the UI needs about an assembly's adjacencies, in one pass. A
 *  count of refusals means little without the total it is drawn from. */
export interface ConnectionSummary {
  violations: ConnectionViolation[];
  /** Every adjacency in the assembly, legal or not — the denominator. */
  totalAdjacencies: number;
  /** Closed contacts where at least one face is an uncut shell. */
  shell: number;
  /** Closed contacts where a sphere face met a cylinder face. */
  crossed: number;
  /** Ids of every cube taking part in at least one refusal. */
  cubeIds: Set<string>;
  /**
   * Ids of cubes taking part in a *crossed* contact specifically.
   *
   * This is the set worth marking. A shell contact is structural rather than a
   * choice — no variation is cut on its depth faces — so marking those lights
   * up most of a three-dimensional assembly for something it could not have
   * avoided. A crossed contact is two cutters genuinely disagreeing.
   */
  crossedCubeIds: Set<string>;
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
    shell: 0,
    crossed: 0,
    cubeIds: new Set(),
    crossedCubeIds: new Set(),
  };
  if (cubes.length < 2) return empty;

  const byCell = new Map<string, CheckableCube>();
  for (const cube of cubes) {
    byCell.set(cellKey(cube.position, gridStride), cube);
  }

  const violations: ConnectionViolation[] = [];
  const cubeIds = new Set<string>();
  const crossedCubeIds = new Set<string>();
  let totalAdjacencies = 0;
  let shell = 0;
  let crossed = 0;

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

      const kind: ContactKind =
        cutTypeA === 'shell' || cutTypeB === 'shell' ? 'shell' : 'crossed';
      if (kind === 'shell') {
        shell += 1;
      } else {
        crossed += 1;
        crossedCubeIds.add(cube.id);
        crossedCubeIds.add(neighbour.id);
      }

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

  return { violations, totalAdjacencies, shell, crossed, cubeIds, crossedCubeIds };
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
export function checkableId(cube: CubeLike): string {
  return cube.id ?? `@${cube.position.join(',')}`;
}

export function toCheckableCubes(cubes: CubeLike[]): CheckableCube[] {
  return cubes.map(cube => ({
    id: checkableId(cube),
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


/** One neighbour standing in the way of a placement, and why. */
export interface PlacementBlocker {
  neighbourId: string;
  neighbourVariationId: string;
  /** The neighbour's face that meets the hovered cell. */
  face: Face;
  /** What that face carries. `shell` blocks unconditionally. */
  cutType: FaceCutType;
  axis: 'x' | 'y' | 'z';
}

/**
 * Why a hovered cell refuses every rotation.
 *
 * The placement preview goes red when *no* rotation of the picked
 * variation satisfies all of the cell's neighbours at once, but it still draws
 * the cube in the rotation the user chose — so the face they happen to be
 * looking at can look perfectly compatible while an unseen neighbour is the one
 * saying no. This names the neighbours that do.
 *
 * A `shell` face is the interesting case: it refuses every cutter, so no
 * rotation of any variation can ever satisfy it. Since no variation carries a
 * cutter on either depth face at rest, an unrotated neighbour in depth blocks
 * its cell permanently — which is the usual reason a cell looks unplaceable for
 * no visible reason.
 */
export function findPlacementBlockers(
  cellPosition: [number, number, number],
  neighbours: CheckableCube[],
  gridStride: number = GRID_STRIDE
): PlacementBlocker[] {
  const blockers: PlacementBlocker[] = [];

  for (const neighbour of neighbours) {
    const faceTypes = VARIATION_FACE_TYPES.get(neighbour.variationId);
    if (!faceTypes) continue;

    const faceOnNeighbour = getAdjacentFace(neighbour.position, cellPosition, gridStride);
    if (!faceOnNeighbour) continue;

    const cutType = getRotatedFaceCutType(faceTypes, faceOnNeighbour, neighbour.rotation);
    if (cutType !== 'shell') continue; // only unconditional blockers

    blockers.push({
      neighbourId: neighbour.id,
      neighbourVariationId: neighbour.variationId,
      face: faceOnNeighbour,
      cutType,
      axis: AXIS_FOR_FACE[faceOnNeighbour],
    });
  }

  return blockers;
}
