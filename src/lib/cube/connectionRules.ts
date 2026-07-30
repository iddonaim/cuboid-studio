/**
 * Connection Rules for Cuboid Studio
 * ===================================
 *
 * Mapping logic:
 * - Door (z=0 opening) → Sphere cutter
 * - Window (z≠0 opening) → Cylinder cutter
 *
 * Connection rules (see `canConnect` below — it is the authority):
 * - Two faces connect when their cut types intersect: sphere↔sphere or
 *   cylinder↔cylinder.
 * - A face carries a SET of cut types. One cutter can open three faces, and one
 *   face can be opened by several cutters — 38.6% of variation faces carry both
 *   a sphere and a cylinder cut, so a single type per face cannot describe them.
 * - A shell (the empty set) connects to nothing; growth stops at uncut faces.
 *
 * The geometry behind the sets lives in `faceCuts.ts`. It replaced a derivation
 * that recorded one face per sphere and two per cylinder, and so disagreed with
 * the real geometry on 69 of 70 variations (GAPS_AND_HOLES P0-6).
 */

import {
  MASTER_CUTTERS,
  CUBE_VARIATIONS,
  CubeVariation,
  CutterSpec,
  SphereSpec,
  CylinderSpec
} from './specifications';
import { CUBE_SIZE } from './constants';
import {
  FaceCuts,
  computeFaceCuts,
  cuttersOnFace,
  faceCutLabel,
  isShell,
} from './faceCuts';

// Face identifiers
export type Face = 'X_NEG' | 'X_POS' | 'Y_NEG' | 'Y_POS' | 'Z_NEG' | 'Z_POS';

// All 6 faces
export const ALL_FACES: Face[] = ['X_NEG', 'X_POS', 'Y_NEG', 'Y_POS', 'Z_NEG', 'Z_POS'];

// Opposite face mapping
export const OPPOSITE_FACE: Record<Face, Face> = {
  'X_NEG': 'X_POS',
  'X_POS': 'X_NEG',
  'Y_NEG': 'Y_POS',
  'Y_POS': 'Y_NEG',
  'Z_NEG': 'Z_POS',
  'Z_POS': 'Z_NEG'
};

// Direction vectors for each face (used for finding adjacent positions)
export const FACE_DIRECTIONS: Record<Face, [number, number, number]> = {
  'X_NEG': [-1, 0, 0],
  'X_POS': [1, 0, 0],
  'Y_NEG': [0, -1, 0],
  'Y_POS': [0, 1, 0],
  'Z_NEG': [0, 0, -1],
  'Z_POS': [0, 0, 1]
};

// 4 rotations around each axis (0°, 90°, 180°, 270°)
export type AxisRotation = 0 | 1 | 2 | 3;

// Combined rotation: Y-axis (horizontal spin) + X-axis (tip forward/back)
export interface Rotation {
  y: AxisRotation;
  x: AxisRotation;
}

// Default rotation (no rotation)
export const DEFAULT_ROTATION: Rotation = { y: 0, x: 0 };

// Helper to create rotation
export function makeRotation(y: AxisRotation, x: AxisRotation): Rotation {
  return { y, x };
}

// How faces map when rotated around Y-axis (looking from above, CW)
// Maps: originalFace → worldPosition
const Y_ROTATION_FACE_MAP: Record<AxisRotation, Record<Face, Face>> = {
  0: { 'X_NEG': 'X_NEG', 'X_POS': 'X_POS', 'Y_NEG': 'Y_NEG', 'Y_POS': 'Y_POS', 'Z_NEG': 'Z_NEG', 'Z_POS': 'Z_POS' },
  1: { 'X_NEG': 'Z_POS', 'X_POS': 'Z_NEG', 'Y_NEG': 'Y_NEG', 'Y_POS': 'Y_POS', 'Z_NEG': 'X_NEG', 'Z_POS': 'X_POS' },
  2: { 'X_NEG': 'X_POS', 'X_POS': 'X_NEG', 'Y_NEG': 'Y_NEG', 'Y_POS': 'Y_POS', 'Z_NEG': 'Z_POS', 'Z_POS': 'Z_NEG' },
  3: { 'X_NEG': 'Z_NEG', 'X_POS': 'Z_POS', 'Y_NEG': 'Y_NEG', 'Y_POS': 'Y_POS', 'Z_NEG': 'X_POS', 'Z_POS': 'X_NEG' }
};

// How faces map when rotated around X-axis (looking from right, CW)
// Maps: originalFace → worldPosition
const X_ROTATION_FACE_MAP: Record<AxisRotation, Record<Face, Face>> = {
  0: { 'X_NEG': 'X_NEG', 'X_POS': 'X_POS', 'Y_NEG': 'Y_NEG', 'Y_POS': 'Y_POS', 'Z_NEG': 'Z_NEG', 'Z_POS': 'Z_POS' },
  1: { 'X_NEG': 'X_NEG', 'X_POS': 'X_POS', 'Y_NEG': 'Z_NEG', 'Y_POS': 'Z_POS', 'Z_NEG': 'Y_POS', 'Z_POS': 'Y_NEG' },
  2: { 'X_NEG': 'X_NEG', 'X_POS': 'X_POS', 'Y_NEG': 'Y_POS', 'Y_POS': 'Y_NEG', 'Z_NEG': 'Z_POS', 'Z_POS': 'Z_NEG' },
  3: { 'X_NEG': 'X_NEG', 'X_POS': 'X_POS', 'Y_NEG': 'Z_POS', 'Y_POS': 'Z_NEG', 'Z_NEG': 'Y_NEG', 'Z_POS': 'Y_POS' }
};

// Legacy single-axis rotation type for backwards compatibility
export type LegacyRotation = 0 | 1 | 2 | 3;


/**
 * Which of the cube's own faces ends up at `worldFace` once the cube is rotated.
 *
 * Rotation is applied Y first, then X, so the inverse undoes X then Y. Extracted
 * so the cut lookup and the cutter lookup cannot drift apart.
 */
function originalFaceAt(worldFace: Face, rotation: Rotation): Face {
  const yMap = Y_ROTATION_FACE_MAP[rotation.y];
  const xMap = X_ROTATION_FACE_MAP[rotation.x];

  let afterYFace: Face = worldFace;
  for (const [orig, rotated] of Object.entries(xMap)) {
    if (rotated === worldFace) {
      afterYFace = orig as Face;
      break;
    }
  }

  let originalFace: Face = afterYFace;
  for (const [orig, rotated] of Object.entries(yMap)) {
    if (rotated === afterYFace) {
      originalFace = orig as Face;
      break;
    }
  }

  return originalFace;
}

/**
 * What the cube presents on a world-space face, once rotated.
 */
export function getRotatedFaceCuts(
  faceCuts: Record<Face, FaceCuts>,
  worldFace: Face,
  rotation: Rotation
): FaceCuts {
  return faceCuts[originalFaceAt(worldFace, rotation)];
}

/**
 * Whether two faces can join: do they share a cut type?
 *
 * This is the closed-vocabulary claim as an operation — "two cubes either share
 * a cutter or they don't" is a set intersection. A shell is the empty set, so it
 * intersects nothing and growth stops at uncut faces, exactly as before. What
 * changed is that a face may carry more than one type, so a face with both a
 * sphere and a cylinder opening now joins either.
 */
export function canConnect(cuts1: FaceCuts, cuts2: FaceCuts): boolean {
  for (const cut of cuts1) {
    if (cuts2.has(cut)) return true;
  }
  return false;
}

/**
 * Every cutter this variation presents on a world-space face, once rotated.
 *
 * Plural because a face is routinely opened by more than one cutter. The old
 * single-cutter version returned only the last one found, which silently
 * discarded the others — and with them any chance of a strict-alignment match
 * against a cutter that was not the last in the list.
 */
export function getRotatedFaceCutters(
  variation: CubeVariation,
  worldFace: Face,
  rotation: Rotation
): CutterSpec[] {
  return cuttersOnFace(variation, originalFaceAt(worldFace, rotation));
}

/**
 * Extracts the 2D position of a cutter on a face plane.
 * Returns [coord1, coord2] based on the face orientation.
 */
function getCutterPositionOnFace(cutter: CutterSpec, face: Face): [number, number] {
  if (cutter.type === 'sphere') {
    const sphere = cutter as SphereSpec;
    const [x, y, z] = sphere.center;

    // Get the 2D coordinates on the face plane
    if (face === 'Y_NEG' || face === 'Y_POS') {
      return [x, z];
    } else if (face === 'X_NEG' || face === 'X_POS') {
      return [y, z];
    } else { // Z_NEG or Z_POS
      return [x, y];
    }
  } else {
    const cylinder = cutter as CylinderSpec;

    // Cylinders have axisPosition which is already the 2D perpendicular coordinates
    // For Y-axis cylinder: axisPosition = [X, Z]
    // For X-axis cylinder: axisPosition = [Y, Z]
    // For Z-axis cylinder: axisPosition = [X, Y]
    return cylinder.axisPosition;
  }
}

/**
 * Rotates a 3D point around the Y-axis and then X-axis.
 */
function rotatePoint(point: [number, number, number], rotation: Rotation): [number, number, number] {
  let [x, y, z] = point;

  // First rotate around Y-axis (0, 90, 180, 270 degrees)
  const yAngle = rotation.y * Math.PI / 2;
  const cosY = Math.cos(yAngle);
  const sinY = Math.sin(yAngle);
  const x1 = x * cosY - z * sinY;
  const z1 = x * sinY + z * cosY;
  x = x1;
  z = z1;

  // Then rotate around X-axis (0, 90, 180, 270 degrees)
  const xAngle = rotation.x * Math.PI / 2;
  const cosX = Math.cos(xAngle);
  const sinX = Math.sin(xAngle);
  const y1 = y * cosX - z * sinX;
  const z2 = y * sinX + z * cosX;
  y = y1;
  z = z2;

  return [x, y, z];
}

/**
 * Gets the 3D world position of a cutter center after cube rotation and translation.
 */
function getCutterWorldPosition(
  cutter: CutterSpec,
  cubePosition: [number, number, number],
  rotation: Rotation
): [number, number, number] {
  let localPos: [number, number, number];

  if (cutter.type === 'sphere') {
    localPos = (cutter as SphereSpec).center;
  } else {
    // For cylinders, construct a 3D position from axisPosition
    const cylinder = cutter as CylinderSpec;
    const [a, b] = cylinder.axisPosition;
    if (cylinder.axis === 'Y') {
      localPos = [a, CUBE_SIZE / 2, b]; // [X, Y, Z] - Y at center
    } else if (cylinder.axis === 'X') {
      localPos = [CUBE_SIZE / 2, a, b]; // [X, Y, Z] - X at center
    } else { // Z
      localPos = [a, b, CUBE_SIZE / 2]; // [X, Y, Z] - Z at center
    }
  }

  // Apply rotation around cube center
  const centerOffset: [number, number, number] = [
    localPos[0] - CUBE_SIZE / 2,
    localPos[1] - CUBE_SIZE / 2,
    localPos[2] - CUBE_SIZE / 2
  ];
  const rotatedOffset = rotatePoint(centerOffset, rotation);
  const rotatedLocal: [number, number, number] = [
    rotatedOffset[0] + CUBE_SIZE / 2,
    rotatedOffset[1] + CUBE_SIZE / 2,
    rotatedOffset[2] + CUBE_SIZE / 2
  ];

  // Apply translation to world position
  return [
    rotatedLocal[0] + cubePosition[0],
    rotatedLocal[1] + cubePosition[1],
    rotatedLocal[2] + cubePosition[2]
  ];
}

/**
 * Checks if two cutters align in LOCAL space (ignoring rotation).
 * Same cutter ID = perfect alignment. Different IDs = check local position similarity.
 * Tolerance is ~10% of the cutter's radius.
 */
function cuttersAlign(
  cutter1: CutterSpec,
  cutter2: CutterSpec,
  cube1Position: [number, number, number],
  cube1Rotation: Rotation,
  cube2Position: [number, number, number],
  cube2Rotation: Rotation,
  face1: Face,
  face2: Face
): boolean {
  // If same cutter ID, they align perfectly (same master cutter)
  if (cutter1.id === cutter2.id) {
    return true;
  }

  // Different cutters - check if their LOCAL positions are similar
  const pos1 = getCutterPositionOnFace(cutter1, face1);
  const pos2 = getCutterPositionOnFace(cutter2, face2);

  // Calculate distance between LOCAL positions
  const dx = pos1[0] - pos2[0];
  const dy = pos1[1] - pos2[1];
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Get radius for tolerance calculation
  let radius: number;
  if (cutter1.type === 'sphere') {
    radius = (cutter1 as SphereSpec).radius;
  } else {
    radius = (cutter1 as CylinderSpec).radius;
  }

  // Tolerance is 10% of radius
  const tolerance = radius * 0.1;

  return distance <= tolerance;
}

/**
 * Checks if two face cut types can connect with strict alignment rules.
 * First checks basic type compatibility, then checks alignment for sphere/cylinder pairs.
 */
export function canConnectStrict(
  cuts1: FaceCuts,
  cuts2: FaceCuts,
  cutters1: CutterSpec[],
  cutters2: CutterSpec[],
  cube1Position: [number, number, number],
  cube1Rotation: Rotation,
  cube2Position: [number, number, number],
  cube2Rotation: Rotation,
  face1: Face,
  face2: Face
): boolean {
  // Shell faces and type mismatches are refused before alignment is considered.
  if (!canConnect(cuts1, cuts2)) {
    return false;
  }

  // A face can carry several cutters, so strict mode asks whether ANY pair of
  // matching type lines up — not whether one arbitrarily-chosen pair does.
  for (const cut of cuts1) {
    if (!cuts2.has(cut)) continue;
    for (const cutter1 of cutters1) {
      if (cutter1.type !== cut) continue;
      for (const cutter2 of cutters2) {
        if (cutter2.type !== cut) continue;
        if (cuttersAlign(cutter1, cutter2, cube1Position, cube1Rotation, cube2Position, cube2Rotation, face1, face2)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Pre-computed per-face cut sets for all variations.
 *
 * Renamed from `VARIATION_FACE_TYPES` when the single-type-per-face model was
 * replaced, so any stale reader fails to compile rather than silently reading a
 * set where it expects a string.
 */
export const VARIATION_FACE_CUTS: Map<string, Record<Face, FaceCuts>> = new Map();

// Initialize on module load
for (const variation of CUBE_VARIATIONS) {
  VARIATION_FACE_CUTS.set(variation.id, computeFaceCuts(variation));
}

// All possible axis rotations
const ALL_AXIS_ROTATIONS: AxisRotation[] = [0, 1, 2, 3];

/**
 * Finds a valid rotation for placing a new cube adjacent to an existing cube.
 * Returns the rotation if valid, or null if no valid rotation exists.
 *
 * @param existingVariationId - ID of the already-placed cube
 * @param existingRotation - Rotation of the already-placed cube
 * @param existingFace - Which face of the existing cube we're connecting to
 * @param newVariationId - ID of the cube we want to place
 * @param strictMode - Whether to enforce strict alignment rules
 * @returns Valid rotation for the new cube, or null if impossible
 */
export function findValidRotation(
  existingVariationId: string,
  existingRotation: Rotation,
  existingFace: Face,
  newVariationId: string,
  strictMode: boolean = false
): Rotation | null {
  const existingFaceCuts = VARIATION_FACE_CUTS.get(existingVariationId);
  const newFaceCuts = VARIATION_FACE_CUTS.get(newVariationId);

  if (!existingFaceCuts || !newFaceCuts) return null;

  const existingVariation = CUBE_VARIATIONS.find(v => v.id === existingVariationId);
  const newVariation = CUBE_VARIATIONS.find(v => v.id === newVariationId);
  if (!existingVariation || !newVariation) return null;

  // Get the cut type on the existing cube's face (considering its rotation)
  const existingCuts = getRotatedFaceCuts(existingFaceCuts, existingFace, existingRotation);

  // The new cube's touching face is the opposite
  const newTouchingFace = OPPOSITE_FACE[existingFace];

  // Try all rotation combinations (Y then X) to find one that works
  // Note: strictMode is ignored here since we don't have position information
  for (const y of ALL_AXIS_ROTATIONS) {
    for (const x of ALL_AXIS_ROTATIONS) {
      const rotation: Rotation = { y, x };
      const newCuts = getRotatedFaceCuts(newFaceCuts, newTouchingFace, rotation);
      if (canConnect(existingCuts, newCuts)) {
        return rotation;
      }
    }
  }

  return null; // No valid rotation found
}

/**
 * Gets all valid rotations for placing a new cube adjacent to an existing cube.
 */
export function findAllValidRotations(
  existingVariationId: string,
  existingRotation: Rotation,
  existingFace: Face,
  newVariationId: string,
  strictMode: boolean = false
): Rotation[] {
  const existingFaceCuts = VARIATION_FACE_CUTS.get(existingVariationId);
  const newFaceCuts = VARIATION_FACE_CUTS.get(newVariationId);

  if (!existingFaceCuts || !newFaceCuts) return [];

  const existingVariation = CUBE_VARIATIONS.find(v => v.id === existingVariationId);
  const newVariation = CUBE_VARIATIONS.find(v => v.id === newVariationId);
  if (!existingVariation || !newVariation) return [];

  const existingCuts = getRotatedFaceCuts(existingFaceCuts, existingFace, existingRotation);
  const newTouchingFace = OPPOSITE_FACE[existingFace];

  const validRotations: Rotation[] = [];

  // Note: strictMode is ignored here since we don't have position information
  for (const y of ALL_AXIS_ROTATIONS) {
    for (const x of ALL_AXIS_ROTATIONS) {
      const rotation: Rotation = { y, x };
      const newCuts = getRotatedFaceCuts(newFaceCuts, newTouchingFace, rotation);
      if (canConnect(existingCuts, newCuts)) {
        validRotations.push(rotation);
      }
    }
  }

  return validRotations;
}

/**
 * Check if two rotations are equal
 */
export function rotationsEqual(a: Rotation, b: Rotation): boolean {
  return a.y === b.y && a.x === b.x;
}

/**
 * Find index of a rotation in an array
 */
export function findRotationIndex(rotations: Rotation[], target: Rotation): number {
  return rotations.findIndex(r => rotationsEqual(r, target));
}

/**
 * Get all 16 possible rotations
 */
export function getAllRotations(): Rotation[] {
  const rotations: Rotation[] = [];
  for (const y of ALL_AXIS_ROTATIONS) {
    for (const x of ALL_AXIS_ROTATIONS) {
      rotations.push({ y, x });
    }
  }
  return rotations;
}

/**
 * Determines which face of cube A is adjacent to cube B based on their positions.
 */
export function getAdjacentFace(
  posA: [number, number, number],
  posB: [number, number, number],
  gridStride: number
): Face | null {
  const dx = Math.round((posB[0] - posA[0]) / gridStride);
  const dy = Math.round((posB[1] - posA[1]) / gridStride);
  const dz = Math.round((posB[2] - posA[2]) / gridStride);

  // Must be exactly one unit apart in one direction
  const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
  if (dist !== 1) return null;

  if (dx === 1) return 'X_POS';
  if (dx === -1) return 'X_NEG';
  if (dy === 1) return 'Y_POS';
  if (dy === -1) return 'Y_NEG';
  if (dz === 1) return 'Z_POS';
  if (dz === -1) return 'Z_NEG';

  return null;
}

/**
 * For ground plane placement (no existing cube to connect to),
 * check if the bottom face (Z_NEG) is valid.
 * Ground is considered a "shell" face, so anything can connect.
 */
export function isGroundPlacementValid(): boolean {
  return true; // Ground acts as shell, accepts anything
}

/**
 * Represents a placed cube for adjacency checking
 */
export interface PlacedCubeInfo {
  variationId: string;
  position: [number, number, number];
  rotation: Rotation;
}

/**
 * Find all valid rotations for a new cube at a given position,
 * checking against ALL adjacent placed cubes.
 */
export function findValidRotationsAtPosition(
  newPosition: [number, number, number],
  newVariationId: string,
  placedCubes: PlacedCubeInfo[],
  gridStride: number,
  strictMode: boolean = false
): Rotation[] {
  // Find all adjacent cubes
  const adjacentCubes: { cube: PlacedCubeInfo; faceOnNew: Face; faceOnExisting: Face }[] = [];

  for (const cube of placedCubes) {
    const faceOnExisting = getAdjacentFace(cube.position, newPosition, gridStride);
    if (faceOnExisting) {
      const faceOnNew = OPPOSITE_FACE[faceOnExisting];
      adjacentCubes.push({ cube, faceOnNew, faceOnExisting });
    }
  }

  // If no adjacent cubes, all rotations are valid
  if (adjacentCubes.length === 0) {
    return getAllRotations();
  }

  const newFaceCuts = VARIATION_FACE_CUTS.get(newVariationId);
  if (!newFaceCuts) return [];

  const newVariation = CUBE_VARIATIONS.find(v => v.id === newVariationId);
  if (!newVariation) return [];

  // Check each rotation against ALL adjacent cubes
  const validRotations: Rotation[] = [];

  for (const y of ALL_AXIS_ROTATIONS) {
    for (const x of ALL_AXIS_ROTATIONS) {
      const rotation: Rotation = { y, x };
      let allValid = true;

      for (const { cube, faceOnNew, faceOnExisting } of adjacentCubes) {
        const existingFaceCuts = VARIATION_FACE_CUTS.get(cube.variationId);
        if (!existingFaceCuts) {
          allValid = false;
          break;
        }

        const existingVariation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!existingVariation) {
          allValid = false;
          break;
        }

        const existingCuts = getRotatedFaceCuts(existingFaceCuts, faceOnExisting, cube.rotation);
        const newCuts = getRotatedFaceCuts(newFaceCuts, faceOnNew, rotation);

        if (strictMode) {
          const existingCutters = getRotatedFaceCutters(existingVariation, faceOnExisting, cube.rotation);
          const newCutters = getRotatedFaceCutters(newVariation, faceOnNew, rotation);
          if (!canConnectStrict(
            existingCuts, newCuts,
            existingCutters, newCutters,
            cube.position, cube.rotation,
            newPosition, rotation,
            faceOnExisting, faceOnNew
          )) {
            allValid = false;
            break;
          }
        } else {
          if (!canConnect(existingCuts, newCuts)) {
            allValid = false;
            break;
          }
        }
      }

      if (allValid) {
        validRotations.push(rotation);
      }
    }
  }

  return validRotations;
}
