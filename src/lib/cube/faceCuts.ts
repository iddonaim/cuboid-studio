/**
 * Which cube faces each cutter actually opens.
 * ============================================
 *
 * This replaces two helpers that could not express the geometry they claimed to
 * read (GAPS_AND_HOLES P0-6). The old model recorded **one** face per sphere —
 * whichever plane its centre sat on — and **two** per cylinder, the pair
 * perpendicular to its axis. But the master cutters are large relative to the
 * cube: spheres of r 9.9–17.1 mm on a 42 mm cube, cylinders 51 mm long. Six of
 * the eight breach two or three faces.
 *
 * The consequence was not cosmetic: the old and new derivations disagreed on
 * 69 of 70 variations — so `canConnect` refused connections the geometry
 * permits. (Faces here are in the RENDER frame: `MASTER_CUTTERS` arrives
 * already converted from the Grasshopper frame to the frame the shipped
 * models occupy — see specifications.ts. The uncut faces sit mostly on top
 * and bottom, where the fabricated models carry their hollowing rims.)
 *
 * A face is treated as opened by a cutter when the cutter's solid crosses that
 * face's plane *within the face's bounds*. No area threshold: measured across
 * all 8 cutters, every opening this produces is between 6.5% and 50% of a face,
 * so there is nothing marginal to filter out. (Verified with
 * `scripts/analyze-cutter-face-area.mjs`; the counts are identical for any
 * threshold from 0% to 5%.)
 *
 * A single face can be opened by more than one cutter, and by cutters of
 * different types — that happens on **38.6%** of variation faces. Which is why
 * a face carries a *set* of cut types rather than one, and why two faces
 * connect when their sets intersect: "they share a cutter, or they don't."
 */

import { CUBE_SIZE } from './constants';
import {
  CubeVariation,
  CutterSpec,
  SphereSpec,
  CylinderSpec,
} from './specifications';

export type Face = 'X_NEG' | 'X_POS' | 'Y_NEG' | 'Y_POS' | 'Z_NEG' | 'Z_POS';

/** Which axis a face is perpendicular to, and the plane's coordinate on it. */
const FACE_PLANE: Record<Face, { axis: 0 | 1 | 2; at: number }> = {
  X_NEG: { axis: 0, at: 0 },
  X_POS: { axis: 0, at: CUBE_SIZE },
  Y_NEG: { axis: 1, at: 0 },
  Y_POS: { axis: 1, at: CUBE_SIZE },
  Z_NEG: { axis: 2, at: 0 },
  Z_POS: { axis: 2, at: CUBE_SIZE },
};

const AXIS_INDEX: Record<'X' | 'Y' | 'Z', 0 | 1 | 2> = { X: 0, Y: 1, Z: 2 };

/** Does a disc of `radius` centred at (a, b) reach the face square [0,S]²? */
function discReachesFace(a: number, b: number, radius: number): boolean {
  const nearestA = Math.min(Math.max(a, 0), CUBE_SIZE);
  const nearestB = Math.min(Math.max(b, 0), CUBE_SIZE);
  return Math.hypot(a - nearestA, b - nearestB) < radius;
}

/** Do the intervals [aLo,aHi] and [0,S] overlap? */
const spansFace = (lo: number, hi: number): boolean => hi > 0 && lo < CUBE_SIZE;

/** The axial extent a cylinder occupies, from its plane origin and extrusion. */
function cylinderAxialExtent(spec: CylinderSpec): [number, number] {
  const axis = AXIS_INDEX[spec.axis];
  const start = spec.planeOrigin[axis];
  const end = start + spec.extrusionVector[axis];
  return start <= end ? [start, end] : [end, start];
}

/** Every face this sphere opens. */
function sphereFaces(spec: SphereSpec): Face[] {
  const opened: Face[] = [];
  for (const face of Object.keys(FACE_PLANE) as Face[]) {
    const { axis, at } = FACE_PLANE[face];
    const distance = Math.abs(spec.center[axis] - at);
    if (distance >= spec.radius) continue;
    // The sphere meets the plane in a disc; it only opens the face if that disc
    // falls inside the face's square rather than off its edge.
    const discRadius = Math.sqrt(spec.radius * spec.radius - distance * distance);
    const [u, v] = ([0, 1, 2] as const).filter(i => i !== axis) as [0 | 1 | 2, 0 | 1 | 2];
    if (discReachesFace(spec.center[u], spec.center[v], discRadius)) opened.push(face);
  }
  return opened;
}

/** Every face this cylinder opens — the two it pierces, plus any it breaches. */
function cylinderFaces(spec: CylinderSpec): Face[] {
  const axis = AXIS_INDEX[spec.axis];
  const perp = ([0, 1, 2] as const).filter(i => i !== axis) as [0 | 1 | 2, 0 | 1 | 2];
  const [axialLo, axialHi] = cylinderAxialExtent(spec);
  const opened: Face[] = [];

  for (const face of Object.keys(FACE_PLANE) as Face[]) {
    const { axis: faceAxis, at } = FACE_PLANE[face];

    if (faceAxis === axis) {
      // A face the cylinder points at: it must reach that plane along its own
      // axis, and its cross-section must land inside the face.
      if (axialLo > at || axialHi < at) continue;
      if (discReachesFace(spec.axisPosition[0], spec.axisPosition[1], spec.radius)) {
        opened.push(face);
      }
      continue;
    }

    // A face the cylinder runs alongside. It breaches the plane when the axis
    // passes within `radius` of it; the breach is a strip, which has to fall
    // inside the face in both directions.
    const which = perp[0] === faceAxis ? 0 : 1;
    const other = which === 0 ? 1 : 0;
    const distance = Math.abs(spec.axisPosition[which] - at);
    if (distance >= spec.radius) continue;

    const halfWidth = Math.sqrt(spec.radius * spec.radius - distance * distance);
    const across = spec.axisPosition[other];
    if (!spansFace(across - halfWidth, across + halfWidth)) continue;
    if (!spansFace(axialLo, axialHi)) continue;
    opened.push(face);
  }

  return opened;
}

/** Every face this cutter opens, whatever its type. */
export function cutterFaces(cutter: CutterSpec): Face[] {
  return cutter.type === 'sphere'
    ? sphereFaces(cutter as SphereSpec)
    : cylinderFaces(cutter as CylinderSpec);
}

/** What a face carries. Empty means uncut — a shell. */
export type FaceCuts = ReadonlySet<'sphere' | 'cylinder'>;

const EMPTY: FaceCuts = new Set();

/**
 * The cut types on each face of a variation.
 *
 * A face may carry both a sphere and a cylinder cut — that is the common case,
 * not an edge case — so nothing here collapses a face to a single type.
 */
export function computeFaceCuts(variation: CubeVariation): Record<Face, FaceCuts> {
  const building: Record<Face, Set<'sphere' | 'cylinder'>> = {
    X_NEG: new Set(), X_POS: new Set(),
    Y_NEG: new Set(), Y_POS: new Set(),
    Z_NEG: new Set(), Z_POS: new Set(),
  };
  for (const cutter of variation.cutters) {
    for (const face of cutterFaces(cutter)) building[face].add(cutter.type);
  }
  return building;
}

/** Which of a variation's cutters open a given face. Used by strict alignment. */
export function cuttersOnFace(variation: CubeVariation, face: Face): CutterSpec[] {
  return variation.cutters.filter(cutter => cutterFaces(cutter).includes(face));
}

/** True when a face carries no cut at all. */
export const isShell = (cuts: FaceCuts): boolean => cuts.size === 0;

/** Human-readable name for what a face carries. */
export function faceCutLabel(cuts: FaceCuts): string {
  if (cuts.size === 0) return 'shell';
  if (cuts.size === 1) return [...cuts][0];
  return 'sphere+cylinder';
}

export { EMPTY as NO_CUTS };
