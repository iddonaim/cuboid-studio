# Cuboid Studio Serialization Guide

This document ensures that Grasshopper exports match the web app's variation numbering and connection rules.

## Overview

- **70 variations** generated from C(8,4) combinations of 8 master cutters
- **Lexicographic ordering** using Python's `itertools.combinations(range(8), 4)`
- **Connection rules** derived from cutter metadata, not mesh geometry

---

## Master Cutters (0-indexed)

| ID | Type     | Position/Center            | Radius     | Face Affected       |
|----|----------|----------------------------|------------|---------------------|
| 0  | Sphere   | (6.30, 0.00, 13.44)        | 16.18034   | Y_NEG (front, Y=0)  |
| 1  | Sphere   | (42.00, 14.40, 29.20)      | 9.864601   | X_POS (right, X=42) |
| 2  | Sphere   | (26.54, 42.00, 40.90)      | 13.0       | Y_POS (back, Y=42)  |
| 3  | Sphere   | (0.00, 24.30, 29.10)       | 17.085938  | X_NEG (left, X=0)   |
| 4  | Cylinder | axis=Y, pos=(21.0, 21.0)   | 16.18034   | Y_NEG + Y_POS       |
| 5  | Cylinder | axis=X, pos=(21.0, 21.0)   | 9.864601   | X_NEG + X_POS       |
| 6  | Cylinder | axis=Y, pos=(40.2, 21.0)   | 13.0       | Y_NEG + Y_POS       |
| 7  | Sphere   | (0.00, 37.00, 21.25)       | 17.085938  | X_NEG (left, X=0)   |

### Cutter Types for Connection Rules
- **Spheres (0,1,2,3,7)** → "door" connections
- **Cylinders (4,5,6)** → "window" connections
- **No cutter on face** → "wall/shell" connections

---

## Complete Variation Table

Each variation uses exactly 4 cutters from the 8 master cutters.
**Note:** Variations are 0-indexed with zero-padding (`v-00` to `v-69`).

| Variation | Cutter Indices | Cutters Used                    |
|-----------|----------------|---------------------------------|
| v-00      | [0,1,2,3]      | Sph0 + Sph1 + Sph2 + Sph3       |
| v-01      | [0,1,2,4]      | Sph0 + Sph1 + Sph2 + Cyl4       |
| v-02      | [0,1,2,5]      | Sph0 + Sph1 + Sph2 + Cyl5       |
| v-03      | [0,1,2,6]      | Sph0 + Sph1 + Sph2 + Cyl6       |
| v-04      | [0,1,2,7]      | Sph0 + Sph1 + Sph2 + Sph7       |
| v-05      | [0,1,3,4]      | Sph0 + Sph1 + Sph3 + Cyl4       |
| v-06      | [0,1,3,5]      | Sph0 + Sph1 + Sph3 + Cyl5       |
| v-07      | [0,1,3,6]      | Sph0 + Sph1 + Sph3 + Cyl6       |
| v-08      | [0,1,3,7]      | Sph0 + Sph1 + Sph3 + Sph7       |
| v-09      | [0,1,4,5]      | Sph0 + Sph1 + Cyl4 + Cyl5       |
| v-10      | [0,1,4,6]      | Sph0 + Sph1 + Cyl4 + Cyl6       |
| v-11      | [0,1,4,7]      | Sph0 + Sph1 + Cyl4 + Sph7       |
| v-12      | [0,1,5,6]      | Sph0 + Sph1 + Cyl5 + Cyl6       |
| v-13      | [0,1,5,7]      | Sph0 + Sph1 + Cyl5 + Sph7       |
| v-14      | [0,1,6,7]      | Sph0 + Sph1 + Cyl6 + Sph7       |
| v-15      | [0,2,3,4]      | Sph0 + Sph2 + Sph3 + Cyl4       |
| v-16      | [0,2,3,5]      | Sph0 + Sph2 + Sph3 + Cyl5       |
| v-17      | [0,2,3,6]      | Sph0 + Sph2 + Sph3 + Cyl6       |
| v-18      | [0,2,3,7]      | Sph0 + Sph2 + Sph3 + Sph7       |
| v-19      | [0,2,4,5]      | Sph0 + Sph2 + Cyl4 + Cyl5       |
| v-20      | [0,2,4,6]      | Sph0 + Sph2 + Cyl4 + Cyl6       |
| v-21      | [0,2,4,7]      | Sph0 + Sph2 + Cyl4 + Sph7       |
| v-22      | [0,2,5,6]      | Sph0 + Sph2 + Cyl5 + Cyl6       |
| v-23      | [0,2,5,7]      | Sph0 + Sph2 + Cyl5 + Sph7       |
| v-24      | [0,2,6,7]      | Sph0 + Sph2 + Cyl6 + Sph7       |
| v-25      | [0,3,4,5]      | Sph0 + Sph3 + Cyl4 + Cyl5       |
| v-26      | [0,3,4,6]      | Sph0 + Sph3 + Cyl4 + Cyl6       |
| v-27      | [0,3,4,7]      | Sph0 + Sph3 + Cyl4 + Sph7       |
| v-28      | [0,3,5,6]      | Sph0 + Sph3 + Cyl5 + Cyl6       |
| v-29      | [0,3,5,7]      | Sph0 + Sph3 + Cyl5 + Sph7       |
| v-30      | [0,3,6,7]      | Sph0 + Sph3 + Cyl6 + Sph7       |
| v-31      | [0,4,5,6]      | Sph0 + Cyl4 + Cyl5 + Cyl6       |
| v-32      | [0,4,5,7]      | Sph0 + Cyl4 + Cyl5 + Sph7       |
| v-33      | [0,4,6,7]      | Sph0 + Cyl4 + Cyl6 + Sph7       |
| v-34      | [0,5,6,7]      | Sph0 + Cyl5 + Cyl6 + Sph7       |
| v-35      | [1,2,3,4]      | Sph1 + Sph2 + Sph3 + Cyl4       |
| v-36      | [1,2,3,5]      | Sph1 + Sph2 + Sph3 + Cyl5       |
| v-37      | [1,2,3,6]      | Sph1 + Sph2 + Sph3 + Cyl6       |
| v-38      | [1,2,3,7]      | Sph1 + Sph2 + Sph3 + Sph7       |
| v-39      | [1,2,4,5]      | Sph1 + Sph2 + Cyl4 + Cyl5       |
| v-40      | [1,2,4,6]      | Sph1 + Sph2 + Cyl4 + Cyl6       |
| v-41      | [1,2,4,7]      | Sph1 + Sph2 + Cyl4 + Sph7       |
| v-42      | [1,2,5,6]      | Sph1 + Sph2 + Cyl5 + Cyl6       |
| v-43      | [1,2,5,7]      | Sph1 + Sph2 + Cyl5 + Sph7       |
| v-44      | [1,2,6,7]      | Sph1 + Sph2 + Cyl6 + Sph7       |
| v-45      | [1,3,4,5]      | Sph1 + Sph3 + Cyl4 + Cyl5       |
| v-46      | [1,3,4,6]      | Sph1 + Sph3 + Cyl4 + Cyl6       |
| v-47      | [1,3,4,7]      | Sph1 + Sph3 + Cyl4 + Sph7       |
| v-48      | [1,3,5,6]      | Sph1 + Sph3 + Cyl5 + Cyl6       |
| v-49      | [1,3,5,7]      | Sph1 + Sph3 + Cyl5 + Sph7       |
| v-50      | [1,3,6,7]      | Sph1 + Sph3 + Cyl6 + Sph7       |
| v-51      | [1,4,5,6]      | Sph1 + Cyl4 + Cyl5 + Cyl6       |
| v-52      | [1,4,5,7]      | Sph1 + Cyl4 + Cyl5 + Sph7       |
| v-53      | [1,4,6,7]      | Sph1 + Cyl4 + Cyl6 + Sph7       |
| v-54      | [1,5,6,7]      | Sph1 + Cyl5 + Cyl6 + Sph7       |
| v-55      | [2,3,4,5]      | Sph2 + Sph3 + Cyl4 + Cyl5       |
| v-56      | [2,3,4,6]      | Sph2 + Sph3 + Cyl4 + Cyl6       |
| v-57      | [2,3,4,7]      | Sph2 + Sph3 + Cyl4 + Sph7       |
| v-58      | [2,3,5,6]      | Sph2 + Sph3 + Cyl5 + Cyl6       |
| v-59      | [2,3,5,7]      | Sph2 + Sph3 + Cyl5 + Sph7       |
| v-60      | [2,3,6,7]      | Sph2 + Sph3 + Cyl6 + Sph7       |
| v-61      | [2,4,5,6]      | Sph2 + Cyl4 + Cyl5 + Cyl6       |
| v-62      | [2,4,5,7]      | Sph2 + Cyl4 + Cyl5 + Sph7       |
| v-63      | [2,4,6,7]      | Sph2 + Cyl4 + Cyl6 + Sph7       |
| v-64      | [2,5,6,7]      | Sph2 + Cyl5 + Cyl6 + Sph7       |
| v-65      | [3,4,5,6]      | Sph3 + Cyl4 + Cyl5 + Cyl6       |
| v-66      | [3,4,5,7]      | Sph3 + Cyl4 + Cyl5 + Sph7       |
| v-67      | [3,4,6,7]      | Sph3 + Cyl4 + Cyl6 + Sph7       |
| v-68      | [3,5,6,7]      | Sph3 + Cyl5 + Cyl6 + Sph7       |
| v-69      | [4,5,6,7]      | Cyl4 + Cyl5 + Cyl6 + Sph7       |

---

## Grasshopper Export Instructions

### File Naming Convention
Export each variation as (0-indexed with zero-padding):
```
v-00.glb
v-01.glb
...
v-69.glb
```

### Grasshopper Python Script for Ordering
```python
import itertools

# Generate combinations in same order as web app
cutters = list(range(8))  # [0,1,2,3,4,5,6,7]
combinations = list(itertools.combinations(cutters, 4))

# combinations[0] = (0,1,2,3) → v-00
# combinations[1] = (0,1,2,4) → v-01
# ...
# combinations[69] = (4,5,6,7) → v-69

for i, combo in enumerate(combinations):
    variation_id = f"v-{str(i).zfill(2)}"  # Zero-padded: v-00, v-01, ...
    cutter_indices = list(combo)
    print(f"{variation_id}: cutters {cutter_indices}")
```

### Export Folder Structure
```
public/models/
  v-00.glb
  v-01.glb
  ...
  v-69.glb
```

### Rhino/Grasshopper Export Settings

**Recommended:** Enable DRACO compression for smaller files (~87KB vs ~948KB).

**Units:** Any unit system works - the web app auto-scales geometry to 42 units.

**Mesh Quality:** Default settings are fine. Multiple mesh parts are automatically merged.

### Auto-Scaling (handled by web app)

The web app automatically handles unit mismatches:
1. Detects if geometry is smaller than 1 unit
2. Scales up to match CUBE_SIZE (42 units)
3. Translates to origin (0,0,0)

This means you don't need to worry about Rhino's export unit settings.

---

## Connection Rules (Independent of Mesh)

The web app calculates connection rules from `src/lib/cube/specifications.ts`, NOT from the mesh geometry.

### Face Cut Types
For each face of a variation:
- **Sphere on face** → `'sphere'` (door)
- **Cylinder through face** → `'cylinder'` (window)
- **No cutter** → `'shell'` (wall)

### Connection Rules
| Type 1   | Type 2   | Can Connect? |
|----------|----------|--------------|
| sphere   | sphere   | ✓            |
| cylinder | cylinder | ✓            |
| shell    | shell    | ✓            |
| shell    | sphere   | ✓            |
| shell    | cylinder | ✗            |
| sphere   | cylinder | ✗            |

### How Rules Are Computed
```typescript
// From src/lib/cube/connectionRules.ts
function computeFaceCutTypes(variation: CubeVariation) {
  for (const cutter of variation.cutters) {
    if (cutter.type === 'sphere') {
      // Sphere center position determines which face
      const face = getSphereFace(cutter);  // e.g., Y_NEG
      result[face] = 'sphere';
    } else {
      // Cylinder axis determines which two faces
      const faces = getCylinderFaces(cutter);  // e.g., [Y_NEG, Y_POS]
      faces.forEach(f => result[f] = 'cylinder');
    }
  }
}
```

---

## Coordinate System

```
        Y+ (back)
        |
        |
        +------ X+ (right)
       /
      /
     Z+ (up)

Cube: (0,0,0) to (42,42,42)
```

### Face Naming
| Face   | Axis | Position | Description |
|--------|------|----------|-------------|
| X_NEG  | X    | X=0      | Left        |
| X_POS  | X    | X=42     | Right       |
| Y_NEG  | Y    | Y=0      | Front       |
| Y_POS  | Y    | Y=42     | Back        |
| Z_NEG  | Z    | Z=0      | Bottom      |
| Z_POS  | Z    | Z=42     | Top         |

---

## Verification Checklist

When exporting from Grasshopper, verify:

1. [ ] Variation v-00 uses cutters [0,1,2,3]
2. [ ] Variation v-69 uses cutters [4,5,6,7]
3. [ ] Cutter 0 is Sphere at (6.30, 0.00, 13.44) with r=16.18034
4. [ ] Cutter 4 is Cylinder along Y-axis at (21.0, _, 21.0)
5. [ ] All 70 .glb files are present (v-00.glb through v-69.glb)
6. [ ] File sizes are reasonable (~50-150KB each with DRACO compression)

---

## Loading Pre-computed Models (Web App)

The web app is already configured to load GLB files. Key settings in `src/lib/cube/csgUtils.ts`:

```typescript
// Enable GLB loading (already set to true)
export const USE_PRECOMPUTED_MODELS = true;

// Path to models (relative to public folder)
export const MODELS_PATH = '/models';
```

### What the loader does automatically:

1. **DRACO decompression** - Handles compressed GLB files
2. **Mesh merging** - Combines multiple mesh fragments into one geometry
3. **Auto-scaling** - Scales small geometries (< 1 unit) to 42 units
4. **Auto-positioning** - Translates geometry to origin (0,0,0)
5. **Caching** - Loaded geometries are cached for reuse
6. **Fallback** - Falls back to runtime CSG if GLB file is missing

This eliminates runtime CSG computation for exported variations.
