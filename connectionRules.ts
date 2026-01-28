/**
 * Connection Rules for Cuboid Studio
 * ===================================
 *
 * Mapping logic:
 * - Door (z=0 opening) → Sphere cutter
 * - Window (z≠0 opening) → Cylinder cutter
 *
 * Connection rules:
 * - Sphere face ↔ Sphere face ✓
 * - Cylinder face ↔ Cylinder face ✓
 * - Shell face ↔ Any face ✓
 */

import {
  MASTER_CUTTERS,
  CUBE_VARIATIONS,
  CUBE_SIZE,
  CubeVariation,
  CutterSpec,
  SphereSpec,
  CylinderSpec
} from './CUTTER_SPECIFICATIONS';

// Face identifiers
export type Face = 'X_NEG' | 'X_POS' | 'Y_NEG' | 'Y_POS' | 'Z_NEG' | 'Z_POS';

// What type of cut is on a face
export type FaceCutType = 'sphere' | 'cylinder' | 'shell';

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
 * Determines which face a sphere cutter affects.
 * Spheres are positioned ON faces (one coordinate is 0 or 42).
 */
function getSphereFace(spec: SphereSpec): Face | null {
  const [x, y, z] = spec.center;
  const tolerance = 0.1;

  if (Math.abs(x) < tolerance) return 'X_NEG';
  if (Math.abs(x - CUBE_SIZE) < tolerance) return 'X_POS';
  if (Math.abs(y) < tolerance) return 'Y_NEG';
  if (Math.abs(y - CUBE_SIZE) < tolerance) return 'Y_POS';
  if (Math.abs(z) < tolerance) return 'Z_NEG';
  if (Math.abs(z - CUBE_SIZE) < tolerance) return 'Z_POS';

  return null; // Sphere doesn't sit exactly on a face
}

/**
 * Determines which faces a cylinder cutter affects.
 * Cylinders pierce through the cube along an axis, affecting two opposite faces.
 */
function getCylinderFaces(spec: CylinderSpec): Face[] {
  switch (spec.axis) {
    case 'X': return ['X_NEG', 'X_POS'];
    case 'Y': return ['Y_NEG', 'Y_POS'];
    case 'Z': return ['Z_NEG', 'Z_POS'];
  }
}

/**
 * Computes the cut type for each face of a variation.
 */
export function computeFaceCutTypes(variation: CubeVariation): Record<Face, FaceCutType> {
  const result: Record<Face, FaceCutType> = {
    'X_NEG': 'shell',
    'X_POS': 'shell',
    'Y_NEG': 'shell',
    'Y_POS': 'shell',
    'Z_NEG': 'shell',
    'Z_POS': 'shell'
  };

  for (const cutter of variation.cutters) {
    if (cutter.type === 'sphere') {
      const face = getSphereFace(cutter as SphereSpec);
      if (face) {
        result[face] = 'sphere';
      }
    } else {
      const faces = getCylinderFaces(cutter as CylinderSpec);
      for (const face of faces) {
        result[face] = 'cylinder';
      }
    }
  }

  return result;
}

/**
 * Gets the face cut type considering combined rotation (Y then X).
 * When a cube is rotated, we need to know what's on the "world" face.
 */
export function getRotatedFaceCutType(
  faceCutTypes: Record<Face, FaceCutType>,
  worldFace: Face,
  rotation: Rotation
): FaceCutType {
  // We need to find which original face ends up at worldFace after combined rotation.
  // Rotation order: Y first, then X
  // To find the inverse, we reverse: first undo X, then undo Y

  const yMap = Y_ROTATION_FACE_MAP[rotation.y];
  const xMap = X_ROTATION_FACE_MAP[rotation.x];

  // Find which face is at worldFace after X rotation (inverse lookup)
  let afterYFace: Face = worldFace;
  for (const [orig, rotated] of Object.entries(xMap)) {
    if (rotated === worldFace) {
      afterYFace = orig as Face;
      break;
    }
  }

  // Find which original face is at afterYFace after Y rotation (inverse lookup)
  let originalFace: Face = afterYFace;
  for (const [orig, rotated] of Object.entries(yMap)) {
    if (rotated === afterYFace) {
      originalFace = orig as Face;
      break;
    }
  }

  return faceCutTypes[originalFace];
}

/**
 * Checks if two face cut types can connect.
 */
export function canConnect(type1: FaceCutType, type2: FaceCutType): boolean {
  // Connection rules:
  // - Door (sphere) ↔ Door (sphere) ✓
  // - Window (cylinder) ↔ Window (cylinder) ✓
  // - Wall (shell) ↔ Wall (shell) ✓
  // - Wall (shell) ↔ Door (sphere) ✓
  // - Wall (shell) ↔ Window (cylinder) ✗
  // - Door (sphere) ↔ Window (cylinder) ✗

  // Same types always connect
  if (type1 === type2) return true;

  // Shell + Sphere (wall meets door) is allowed
  if ((type1 === 'shell' && type2 === 'sphere') ||
      (type1 === 'sphere' && type2 === 'shell')) {
    return true;
  }

  // All other combinations are invalid
  return false;
}

/**
 * Gets the cutter specification that affects a world-space face after rotation.
 * Returns null if the face is a shell (no cutter).
 */
export function getRotatedFaceCutter(
  variation: CubeVariation,
  worldFace: Face,
  rotation: Rotation
): CutterSpec | null {
  // Find which original face ends up at worldFace after combined rotation
  // Same logic as getRotatedFaceCutType but returns the actual cutter
  const yMap = Y_ROTATION_FACE_MAP[rotation.y];
  const xMap = X_ROTATION_FACE_MAP[rotation.x];

  // Reverse rotation to find original face
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

  // Find which cutter affects this original face
  for (const cutter of variation.cutters) {
    if (cutter.type === 'sphere') {
      const face = getSphereFace(cutter as SphereSpec);
      if (face === originalFace) {
        return cutter;
      }
    } else {
      const faces = getCylinderFaces(cutter as CylinderSpec);
      if (faces.includes(originalFace)) {
        return cutter;
      }
    }
  }

  return null; // No cutter on this face (shell)
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
 * Checks if two cutters align in local space (strict rules).
 * Tolerance is ~10% of the cutter's radius.
 */
function cuttersAlign(
  cutter1: CutterSpec,
  cutter2: CutterSpec,
  face1: Face,
  face2: Face
): boolean {
  // Get 2D positions on their respective face planes
  const pos1 = getCutterPositionOnFace(cutter1, face1);
  const pos2 = getCutterPositionOnFace(cutter2, face2);

  // Calculate distance between positions
  const dx = pos1[0] - pos2[0];
  const dz = pos1[1] - pos2[1];
  const distance = Math.sqrt(dx * dx + dz * dz);

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
  type1: FaceCutType,
  type2: FaceCutType,
  cutter1: CutterSpec | null,
  cutter2: CutterSpec | null,
  face1: Face,
  face2: Face
): boolean {
  // First check basic connection rules
  if (!canConnect(type1, type2)) {
    return false;
  }

  // For shell connections, basic rules are sufficient
  if (type1 === 'shell' || type2 === 'shell') {
    return true;
  }

  // For sphere-sphere and cylinder-cylinder, check alignment
  if (cutter1 && cutter2 && type1 === type2) {
    return cuttersAlign(cutter1, cutter2, face1, face2);
  }

  return true;
}

/**
 * Pre-computed face cut types for all variations.
 */
export const VARIATION_FACE_TYPES: Map<string, Record<Face, FaceCutType>> = new Map();

// Initialize on module load
for (const variation of CUBE_VARIATIONS) {
  VARIATION_FACE_TYPES.set(variation.id, computeFaceCutTypes(variation));
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
  const existingFaceTypes = VARIATION_FACE_TYPES.get(existingVariationId);
  const newFaceTypes = VARIATION_FACE_TYPES.get(newVariationId);

  if (!existingFaceTypes || !newFaceTypes) return null;

  const existingVariation = CUBE_VARIATIONS.find(v => v.id === existingVariationId);
  const newVariation = CUBE_VARIATIONS.find(v => v.id === newVariationId);
  if (!existingVariation || !newVariation) return null;

  // Get the cut type on the existing cube's face (considering its rotation)
  const existingCutType = getRotatedFaceCutType(existingFaceTypes, existingFace, existingRotation);

  // The new cube's touching face is the opposite
  const newTouchingFace = OPPOSITE_FACE[existingFace];

  // Try all rotation combinations (Y then X) to find one that works
  for (const y of ALL_AXIS_ROTATIONS) {
    for (const x of ALL_AXIS_ROTATIONS) {
      const rotation: Rotation = { y, x };
      const newCutType = getRotatedFaceCutType(newFaceTypes, newTouchingFace, rotation);

      if (strictMode) {
        const existingCutter = getRotatedFaceCutter(existingVariation, existingFace, existingRotation);
        const newCutter = getRotatedFaceCutter(newVariation, newTouchingFace, rotation);
        if (canConnectStrict(existingCutType, newCutType, existingCutter, newCutter, existingFace, newTouchingFace)) {
          return rotation;
        }
      } else {
        if (canConnect(existingCutType, newCutType)) {
          return rotation;
        }
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
  const existingFaceTypes = VARIATION_FACE_TYPES.get(existingVariationId);
  const newFaceTypes = VARIATION_FACE_TYPES.get(newVariationId);

  if (!existingFaceTypes || !newFaceTypes) return [];

  const existingVariation = CUBE_VARIATIONS.find(v => v.id === existingVariationId);
  const newVariation = CUBE_VARIATIONS.find(v => v.id === newVariationId);
  if (!existingVariation || !newVariation) return [];

  const existingCutType = getRotatedFaceCutType(existingFaceTypes, existingFace, existingRotation);
  const newTouchingFace = OPPOSITE_FACE[existingFace];

  const validRotations: Rotation[] = [];

  for (const y of ALL_AXIS_ROTATIONS) {
    for (const x of ALL_AXIS_ROTATIONS) {
      const rotation: Rotation = { y, x };
      const newCutType = getRotatedFaceCutType(newFaceTypes, newTouchingFace, rotation);

      if (strictMode) {
        const existingCutter = getRotatedFaceCutter(existingVariation, existingFace, existingRotation);
        const newCutter = getRotatedFaceCutter(newVariation, newTouchingFace, rotation);
        if (canConnectStrict(existingCutType, newCutType, existingCutter, newCutter, existingFace, newTouchingFace)) {
          validRotations.push(rotation);
        }
      } else {
        if (canConnect(existingCutType, newCutType)) {
          validRotations.push(rotation);
        }
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

  const newFaceTypes = VARIATION_FACE_TYPES.get(newVariationId);
  if (!newFaceTypes) return [];

  const newVariation = CUBE_VARIATIONS.find(v => v.id === newVariationId);
  if (!newVariation) return [];

  // Check each rotation against ALL adjacent cubes
  const validRotations: Rotation[] = [];

  for (const y of ALL_AXIS_ROTATIONS) {
    for (const x of ALL_AXIS_ROTATIONS) {
      const rotation: Rotation = { y, x };
      let allValid = true;

      for (const { cube, faceOnNew, faceOnExisting } of adjacentCubes) {
        const existingFaceTypes = VARIATION_FACE_TYPES.get(cube.variationId);
        if (!existingFaceTypes) {
          allValid = false;
          break;
        }

        const existingVariation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!existingVariation) {
          allValid = false;
          break;
        }

        const existingCutType = getRotatedFaceCutType(existingFaceTypes, faceOnExisting, cube.rotation);
        const newCutType = getRotatedFaceCutType(newFaceTypes, faceOnNew, rotation);

        if (strictMode) {
          const existingCutter = getRotatedFaceCutter(existingVariation, faceOnExisting, cube.rotation);
          const newCutter = getRotatedFaceCutter(newVariation, faceOnNew, rotation);
          if (!canConnectStrict(existingCutType, newCutType, existingCutter, newCutter, faceOnExisting, faceOnNew)) {
            allValid = false;
            break;
          }
        } else {
          if (!canConnect(existingCutType, newCutType)) {
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
