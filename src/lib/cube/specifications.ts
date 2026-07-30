/**
 * CUBOID STUDIO - Master Cutter Specifications
 * =============================================
 *
 * This file contains the exact specifications for the 8 master boolean cutters
 * as defined in the Grasshopper script. These cutters are used to generate
 * 70 unique cube variations through C(8,4) combinations.
 *
 * COORDINATE SYSTEM:
 * - Cube spans from (0, 0, 0) to (42, 42, 42)
 * - Origin at corner, not center
 * - X: left (0) to right (42)
 * - Y: front (0) to back (42)
 * - Z: bottom (0) to top (42)
 *
 * MATHEMATICAL SYSTEMS FOR RADII:
 * The 4 radius values are derived from classical mathematical systems:
 * - Golden ratio (φ = 1.618...) → e.g., 16.18034 = 10φ
 * - Pi (π = 3.14159...)
 * - Prime numbers → e.g., 13
 * - Harmonic fifths ratio (3:2 = 1.5)
 *
 * Shell thickness = 1.6 (homage to φ)
 *
 * SOURCES:
 * - Grasshopper script screenshots in /REFERENCES folder
 * - Panel data from cutter-XX_specs.png files
 * - Plane data from cutter-05-06-07_plane.png
 * - Box definition from box_initial.png
 *
 * Last Updated: 2025-01-23
 */

// =============================================================================
// CONSTANTS (re-exported from shared constants for backwards compatibility)
// =============================================================================

export { CUBE_SIZE, CUBE_GAP, GRID_STRIDE, SHELL_THICKNESS, PHI, PHI_TIMES_10 } from './constants';
import { CUBE_SIZE as CUBE_SIZE_INTERNAL } from './constants';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface SphereSpec {
  id: number;
  type: 'sphere';
  center: [number, number, number];  // World coordinates
  radius: number;
  face: 'X0' | 'X42' | 'Y0' | 'Y42' | 'Z0' | 'Z42';  // Which cube face it's on
  notes?: string;
}

export interface CylinderSpec {
  id: number;
  type: 'cylinder';
  // For cylinders, we define the axis line position in the 2 perpendicular dimensions
  axisPosition: [number, number];  // Position in the plane perpendicular to axis
  axis: 'X' | 'Y' | 'Z';           // Which axis the cylinder runs along
  radius: number;
  length: number;                   // Extrusion length (51 in all cases)
  planeOrigin: [number, number, number];  // Original GH plane origin
  extrusionVector: [number, number, number];  // Direction and magnitude
  notes?: string;
}

export type CutterSpec = SphereSpec | CylinderSpec;

// =============================================================================
// SPHERE SPECIFICATIONS (Cutters 01-04 and 08)
// =============================================================================

/**
 * Sphere centers are taken directly from the baseplane Origin (O) values
 * in the Grasshopper panels. Each sphere is positioned on a cube face,
 * with its center at the face surface, cutting into the cube.
 */

export const SPHERE_01: SphereSpec = {
  id: 0,  // 0-indexed for code compatibility
  type: 'sphere',
  center: [6.30, 0.00, 13.44],
  radius: 16.18034,  // 10φ
  face: 'Y0',
  notes: 'Front face (Y=0), offset toward left-bottom corner'
};

export const SPHERE_02: SphereSpec = {
  id: 1,
  type: 'sphere',
  center: [42.00, 14.40, 29.20],
  radius: 9.864601,  // φ-derived value
  face: 'X42',
  notes: 'Right face (X=42), lower-front quadrant'
};

export const SPHERE_03: SphereSpec = {
  id: 2,
  type: 'sphere',
  center: [26.54, 42.00, 40.90],
  radius: 13,
  face: 'Y42',
  notes: 'Back face (Y=42), upper-right area'
};

export const SPHERE_04: SphereSpec = {
  id: 3,
  type: 'sphere',
  center: [0.00, 24.30, 29.10],
  radius: 17.085938,
  face: 'X0',
  notes: 'Left face (X=0), center-upper area'
};

export const SPHERE_08: SphereSpec = {
  id: 7,  // This is cutter 08, but 0-indexed as 7
  type: 'sphere',
  center: [0.00, 37.00, 21.25],
  radius: 17.085938,
  face: 'X0',
  notes: 'Left face (X=0), back-center area. Same radius as SPHERE_04'
};

// =============================================================================
// CYLINDER SPECIFICATIONS (Cutters 05-07)
// =============================================================================

/**
 * Cylinders are defined by:
 * 1. A plane (origin + normal) from cutter-05-06-07_plane.png
 * 2. An extrusion vector (direction and length = 51)
 *
 * The cylinder axis passes through the PLANE ORIGIN — measured directly
 * from the shipped variation models (public/models/v-01..v-03, each of
 * which contains exactly one cylinder). An earlier reconstruction applied
 * the panel's local 2D offsets on top of the plane origin, which placed
 * all cylinders near the cube center ((21,21) / (40.2,21)); the actual
 * geometry disproves that — the cylinders clip the cube off-center at
 * the plane origins themselves.
 */

export const CYLINDER_05: CylinderSpec = {
  id: 4,
  type: 'cylinder',
  // Plane origin: (4.90, 0.00, -1.20), normal: (0, -1, 0)
  axisPosition: [4.90, -1.20],  // [X, Z] since cylinder runs along Y
  axis: 'Y',
  radius: 16.18034,  // 10φ - same as SPHERE_01
  length: 51,
  planeOrigin: [4.90, 0.00, -1.20],
  extrusionVector: [0, 51, 0],
  notes: 'Runs along Y-axis, off-center near the front-bottom-left edge'
};

export const CYLINDER_06: CylinderSpec = {
  id: 5,
  type: 'cylinder',
  // Plane origin: (42.00, -1.80, 27.80), normal: (1, 0, 0)
  axisPosition: [-1.80, 27.80],  // [Y, Z] since cylinder runs along X
  axis: 'X',
  radius: 9.864601,  // Same as SPHERE_02
  length: 51,
  planeOrigin: [42.00, -1.80, 27.80],
  extrusionVector: [-51, 0, 0],
  notes: 'Runs along X-axis (negative direction), off-center near the front-upper edge'
};

export const CYLINDER_07: CylinderSpec = {
  id: 6,
  type: 'cylinder',
  // Plane origin: (30.60, 42.00, 26.30), normal: (0, 1, 0)
  axisPosition: [30.60, 26.30],  // [X, Z] since cylinder runs along Y
  axis: 'Y',
  radius: 13,  // Same as SPHERE_03
  length: 51,
  planeOrigin: [30.60, 42.00, 26.30],
  extrusionVector: [0, -51, 0],
  notes: 'Runs along Y-axis (negative direction), offset toward the +X upper area'
};

// =============================================================================
// COMBINED MASTER CUTTERS ARRAY
// =============================================================================

// =============================================================================
// FRAME CONVERSION — Grasshopper (Z-up) → shipped models (Y-up)
// =============================================================================

/**
 * The cutter constants above are authored in the Grasshopper document's frame,
 * where Z is up. The GLB models the app actually renders were exported through
 * the standard Rhino→glTF axis conversion, which rotates everything −90° about
 * X so that glTF's Y points up. Nothing ever translated the spec to match.
 *
 * The consequence was measured, not guessed: decoding all 70 shipped GLBs and
 * checking which face of each model is really uncut
 * (`scripts/measure-glb-face-solidity.cjs`), 38 of 70 disagreed with the
 * spec-frame prediction — and every disagreement fit this one rotation. The
 * connection law was judging a rotated twin of every cube on screen: a shell
 * the viewer saw on top was, to the law, a cut face on the depth side. The
 * hollow shell faces make the frame unmistakable: their fabrication rims
 * measure 14.7% solid, exactly what the 1.6 wall thickness predicts, and they
 * sit on Y faces in the models where the spec put them on Z.
 *
 * So the spec is converted here, once, at the array everything downstream
 * reads — face cuts, the connection law, strict alignment, and the CSG
 * fallback geometry (which previously built models in the unconverted frame,
 * silently disagreeing with the GLBs it stands in for). The point map, about
 * the cube's own [0,42]³ box, is (x, y, z) → (x, z, 42 − y).
 */

function pointToRenderFrame(p: [number, number, number]): [number, number, number] {
  return [p[0], p[2], CUBE_SIZE_INTERNAL - p[1]];
}

function vectorToRenderFrame(v: [number, number, number]): [number, number, number] {
  return [v[0], v[2], -v[1]];
}

const FACE_TO_RENDER: Record<SphereSpec['face'], SphereSpec['face']> = {
  X0: 'X0', X42: 'X42',
  Y0: 'Z42', Y42: 'Z0',
  Z0: 'Y0', Z42: 'Y42',
};

const AXIS_TO_RENDER: Record<CylinderSpec['axis'], CylinderSpec['axis']> = {
  X: 'X', Y: 'Z', Z: 'Y',
};

function toRenderFrame(cutter: CutterSpec): CutterSpec {
  if (cutter.type === 'sphere') {
    return {
      ...cutter,
      center: pointToRenderFrame(cutter.center),
      face: FACE_TO_RENDER[cutter.face],
    };
  }
  const axis = AXIS_TO_RENDER[cutter.axis];
  const planeOrigin = pointToRenderFrame(cutter.planeOrigin);
  // axisPosition is the plane origin's two coordinates perpendicular to the
  // axis (X-axis → [Y,Z], Y-axis → [X,Z], Z-axis → [X,Y]) — re-derived rather
  // than permuted by hand, so it cannot drift from planeOrigin. The same
  // derivation reproduces the authored values in the original frame.
  const axisIndex = { X: 0, Y: 1, Z: 2 }[axis];
  const [u, v] = ([0, 1, 2] as const).filter(i => i !== axisIndex);
  return {
    ...cutter,
    axis,
    planeOrigin,
    extrusionVector: vectorToRenderFrame(cutter.extrusionVector),
    axisPosition: [planeOrigin[u], planeOrigin[v]],
  };
}

/**
 * All 8 cutters in order (0-7), matching the Grasshopper script indexing —
 * expressed in the RENDER frame, the one the shipped models occupy.
 * This order determines the variation numbering:
 * - v-00: cutters [0,1,2,3]
 * - v-01: cutters [0,1,2,4]
 * - ...
 * - v-69: cutters [4,5,6,7]
 */
export const MASTER_CUTTERS: CutterSpec[] = [
  SPHERE_01,    // Index 0
  SPHERE_02,    // Index 1
  SPHERE_03,    // Index 2
  SPHERE_04,    // Index 3
  CYLINDER_05,  // Index 4
  CYLINDER_06,  // Index 5
  CYLINDER_07,  // Index 6
  SPHERE_08,    // Index 7
].map(toRenderFrame);

// =============================================================================
// VARIATION GENERATION
// =============================================================================

/**
 * Generates all C(8,4) = 70 combinations of 4 cutters from 8.
 * Uses lexicographic ordering to match Grasshopper's itertools.combinations().
 *
 * Order: [0,1,2,3], [0,1,2,4], [0,1,2,5], ... [4,5,6,7]
 */
export interface CubeVariation {
  id: string;           // "v-00" through "v-69"
  index: number;        // 0-69 (for array indexing)
  name: string;         // "Variation 1" etc.
  cutterIndices: [number, number, number, number];  // Which 4 cutters to use
  cutters: CutterSpec[];  // The actual cutter specifications
}

export function generateVariations(): CubeVariation[] {
  const variations: CubeVariation[] = [];

  // Generate all combinations of 4 indices from [0,1,2,3,4,5,6,7]
  // This matches Python's itertools.combinations(range(8), 4)
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      for (let c = b + 1; c < 8; c++) {
        for (let d = c + 1; d < 8; d++) {
          const indices: [number, number, number, number] = [a, b, c, d];
          const cutters = indices.map(idx => MASTER_CUTTERS[idx]);

          const idx = variations.length;
          variations.push({
            id: `v-${String(idx).padStart(2, '0')}`,  // v-00 through v-69
            index: idx,
            name: `Variation ${idx}`,
            cutterIndices: indices,
            cutters
          });
        }
      }
    }
  }

  return variations;  // Returns exactly 70 variations
}

export const CUBE_VARIATIONS = generateVariations();

// =============================================================================
// QUICK REFERENCE TABLE
// =============================================================================

/**
 * CUTTER SUMMARY TABLE
 * ====================
 *
 * | ID | Type     | Position/Axis              | Radius    | Face/Direction |
 * |----|----------|----------------------------|-----------|----------------|
 * | 0  | Sphere   | (6.30, 0.00, 13.44)        | 16.18034  | Y=0 (front)    |
 * | 1  | Sphere   | (42.00, 14.40, 29.20)      | 9.864601  | X=42 (right)   |
 * | 2  | Sphere   | (26.54, 42.00, 40.90)      | 13        | Y=42 (back)    |
 * | 3  | Sphere   | (0.00, 24.30, 29.10)       | 17.085938 | X=0 (left)     |
 * | 4  | Cylinder | X=4.9, Z=-1.2, axis Y      | 16.18034  | Along +Y       |
 * | 5  | Cylinder | Y=-1.8, Z=27.8, axis X     | 9.864601  | Along -X       |
 * | 6  | Cylinder | X=30.6, Z=26.3, axis Y     | 13        | Along -Y       |
 * | 7  | Sphere   | (0.00, 37.00, 21.25)       | 17.085938 | X=0 (left)     |
 *
 *
 * RADIUS VALUES (Golden Ratio based)
 * ===================================
 * - 16.18034  = 10 × φ
 * - 17.085938 = derived from φ
 * - 13        = derived from φ
 * - 9.864601  = derived from φ
 *
 *
 * VARIATION ORDERING
 * ==================
 * Uses lexicographic C(8,4) combinations (0-indexed):
 * - v-00: [0,1,2,3] = Spheres 1-4
 * - v-01: [0,1,2,4] = Spheres 1-3 + Cylinder 5
 * - v-02: [0,1,2,5] = Spheres 1-3 + Cylinder 6
 * - ...
 * - v-34: [0,4,5,6] = Sphere 1 + all Cylinders
 * - ...
 * - v-69: [4,5,6,7] = all Cylinders + Sphere 8
 */
