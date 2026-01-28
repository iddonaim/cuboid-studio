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
// CONSTANTS
// =============================================================================

export const CUBE_SIZE = 42;
export const CUBE_GAP = 0.6;
export const GRID_STRIDE = CUBE_SIZE + CUBE_GAP; // 42.6
export const SHELL_THICKNESS = 1.6; // Golden ratio homage

// Golden ratio derived values
export const PHI = 1.6180339887498948;
export const PHI_TIMES_10 = 16.18034;

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
 * 2. A local 2D position on that plane from cutter-XX_specs.png
 * 3. An extrusion vector (direction and length = 51)
 *
 * The cylinder axis position is computed by transforming the local 2D
 * coordinates to world 3D coordinates using the plane definition.
 *
 * COORDINATE TRANSFORMATION:
 * For a plane with normal N, the local X and Y axes are perpendicular to N.
 * - Plane normal (0, -1, 0): local X = world X, local Y = world -Z
 * - Plane normal (1, 0, 0): local X = world Y, local Y = world -Z
 * - Plane normal (0, 1, 0): local X = world X, local Y = world Z
 */

export const CYLINDER_05: CylinderSpec = {
  id: 4,
  type: 'cylinder',
  // Plane origin: (4.90, 0.00, -1.20), normal: (0, -1, 0)
  // Local position: (16.10, -22.20)
  // World X = 4.90 + 16.10 = 21.0
  // World Z = -1.20 + 22.20 = 21.0 (local Y inverted due to -Y normal)
  axisPosition: [21.0, 21.0],  // [X, Z] since cylinder runs along Y
  axis: 'Y',
  radius: 16.18034,  // 10φ - same as SPHERE_01
  length: 51,
  planeOrigin: [4.90, 0.00, -1.20],
  extrusionVector: [0, 51, 0],
  notes: 'Runs along Y-axis, centered in XZ plane at cube center'
};

export const CYLINDER_06: CylinderSpec = {
  id: 5,
  type: 'cylinder',
  // Plane origin: (42.00, -1.80, 27.80), normal: (1, 0, 0)
  // Local position: (22.80, 6.80)
  // World Y = -1.80 + 22.80 = 21.0
  // World Z = 27.80 - 6.80 = 21.0 (local Y inverted)
  axisPosition: [21.0, 21.0],  // [Y, Z] since cylinder runs along X
  axis: 'X',
  radius: 9.864601,  // Same as SPHERE_02
  length: 51,
  planeOrigin: [42.00, -1.80, 27.80],
  extrusionVector: [-51, 0, 0],
  notes: 'Runs along X-axis (negative direction), centered in YZ plane'
};

export const CYLINDER_07: CylinderSpec = {
  id: 6,
  type: 'cylinder',
  // Plane origin: (30.60, 42.00, 26.30), normal: (0, 1, 0)
  // Local position: (9.60, 5.30)
  // World X = 30.60 + 9.60 = 40.20
  // World Z = 26.30 - 5.30 = 21.0 (local Y inverted due to +Y normal convention)
  axisPosition: [40.20, 21.0],  // [X, Z] since cylinder runs along Y
  axis: 'Y',
  radius: 13,  // Same as SPHERE_03
  length: 51,
  planeOrigin: [30.60, 42.00, 26.30],
  extrusionVector: [0, -51, 0],
  notes: 'Runs along Y-axis (negative direction), offset toward +X edge'
};

// =============================================================================
// COMBINED MASTER CUTTERS ARRAY
// =============================================================================

/**
 * All 8 cutters in order (0-7), matching the Grasshopper script indexing.
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
];

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
 * | 4  | Cylinder | X=21.0, Z=21.0, axis Y     | 16.18034  | Along +Y       |
 * | 5  | Cylinder | Y=21.0, Z=21.0, axis X     | 9.864601  | Along -X       |
 * | 6  | Cylinder | X=40.2, Z=21.0, axis Y     | 13        | Along -Y       |
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
