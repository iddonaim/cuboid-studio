# Claude Code CLI - Project Handoff Prompt

## Context & Project Overview

I'm Iddo, an architecture student working on my B.Arch thesis at Tel Aviv University. This is **Cuboid Studio**, a 3D modular logic builder for architectural exploration that combines parametric cube variations with boolean cuts.

**Workflow:** GitHub-first. Work on the repo at https://github.com/iddonaim/cuboid-studio via cloud Claude Code or any local clone. Architect's design artifacts (prompt, spec, curator) live inside the repo — no loose files outside version control.

**Live Deployment:** https://cuboidstudio.vercel.app

**GitHub Repository:** https://github.com/iddonaim/cuboid-studio

---

## CURRENT STATE (2026-06-07) — read this first

> The dated session log further down is **build history**, not a description of the
> current app. For the authoritative, reconciled picture of what's live and usable,
> see [`CONTEXT.md`](../../CONTEXT.md). Quick summary:

- **Four live nav tabs:** **Map → Encode → Evolution → Decode** (`AppMode = 'map' | 'encoding' | 'evolution' | 'decode'`). All `NAV_SLOTS` are `mounted: true`. The old "two visible tabs, Map/Decode hidden" arrangement is gone.
- **Builder** is no longer a tab — it surfaces inline inside Encode (Merge seed editor) and underpins Evolution.
- **Pataphysical** is a **sub-mode of Evolution** (`EvolutionSubMode = 'evolve' | 'pataphysical'`), not a top-level mode.
- **Map** (live): Leaflet site picker + an embedded external site-analysis app (`VITE_MAP_CONTEXT_URL`); Nominatim geocode proxy + Overpass POI proxy; writes site context to `localStorage` for Encode/Pataphysical.
- **Encode** (live): 1–7 images, five-axis reading (L1), prompt composed at runtime from `spatial-encoding-grammar.md` + `lexicon.default.ts`; standalone / merge / remix modes.
- **Evolution / Evolve** (live, **implemented** — not stubbed): compressibility engine with **four** sub-scores — geometric clustering (0.3), spatial regularity (0.3), operator sequence (0.2), meme coherence (0.2). Candidate generation + apply/undo + sparkline. *Note: the spec's two extra axes (CSG tree edit distance, topological genus) are NOT implemented.*
- **Evolution / Pataphysical** (live): v1 single-pass and v2 two-pass both wired to UI; default `passMode = 'single'`, user-toggleable. Operators: inversion/amplification/drift/reassignment/preservation/shuffle (v1) + consolidation/erosion/reinforcement (v2). 4-axis confidence vector. OpenRouter default (`anthropic/claude-sonnet-4`), Anthropic fallback.
- **Decode** (live, **implemented**): Konva 2D notation canvas — drag/place/rotate glyph tiles, snap grid, SVG + DXF export, history.
- **Projects / Auth (NEW, not in older docs):** Firebase email/password auth + Firestore Projects→Sites→Compositions cloud persistence. Opt-in via `VITE_FIREBASE_*` (same Firebase project as archthesis); invisible when unconfigured.
- **Export/AR:** JSON, GLB, DXF, SVG; AR via `<model-viewer>`; WebSocket live-link to the `grasshopper/` bridge; local saved-states layer.
- **Stack additions since the log below:** Leaflet, Konva/react-konva, `dxf-writer`, Firebase, jszip, shadcn/Radix, Zustand 5.

---

## IMPORTANT: Git Configuration

**ALWAYS** ensure these git settings are configured:

```bash
git config --global user.name "Iddo Naim"
git config --global user.email "iddonaim@gmail.com"
```

**NEVER** commit with the Mac user email (kageyoshiki@...). Always use `iddonaim@gmail.com`.

---

## IMPORTANT: REFERENCES Folder

The `REFERENCES/` folder contains internal Grasshopper screenshots, specs, and reference files (including an 84MB video).

**CRITICAL RULES:**
- ✅ REFERENCES/ is in .gitignore
- ✅ Folder exists LOCALLY ONLY
- ❌ NEVER commit or push REFERENCES/ to GitHub
- ❌ NEVER remove REFERENCES/ from .gitignore
- ❌ NEVER use `git add .` without checking .gitignore first

If REFERENCES accidentally gets committed:
```bash
# Remove from git history
git filter-branch --force --index-filter 'git rm -r --cached --ignore-unmatch REFERENCES/' --prune-empty --tag-name-filter cat -- --all
git push --force
```

---

## What This App Does

Cuboid Studio is a web-based 3D editor that lets me:
1. **Browse 70 cube variations** - C(8,4) combinations of 4 boolean cutters from 8 master cutters
2. **Place cubes in 3D space** - Left-click on grid to place selected variation
3. **Select and delete cubes** - Click placed cubes to select, delete button to remove
4. **Auto-fill algorithm** - Grow assemblies from selected cube or randomly
5. **Section cut** - Slice through assemblies with adjustable clipping planes
6. **Navigate 3D space** - Right-drag to orbit, scroll to zoom
7. **Install as PWA** - Offline-capable progressive web app

---

## Tech Stack

- **Frontend:** React 18 + TypeScript
- **3D Rendering:** Three.js + React Three Fiber + drei
- **Build Tool:** Vite 5
- **Deployment:** Vercel

---

## Current Working Structure (2026-01-23)

```
cuboid-studio-updated/
├── App.tsx                    # Main app with all features
├── ThumbnailGenerator.tsx     # Utility to generate thumbnail images
├── constants.ts               # Grid settings (CUBE_SIZE, GRID_STRIDE)
├── CUTTER_SPECIFICATIONS.ts   # Exact cutter specs from Grasshopper
├── csgUtils.ts                # CSG boolean operations + GLB loading
├── connectionRules.ts         # Face mapping & connection logic
├── index.html                 # Vite entry point
├── index.css                  # Base styles
├── index.tsx                  # React root (routes to App or ThumbnailGenerator)
├── vite.config.ts             # Vite configuration
├── tsconfig.json              # TypeScript config
├── package.json               # Dependencies
├── types.ts                   # TypeScript type definitions
├── public/
│   ├── v-00.glb .. v-69.glb   # Pre-computed GLB models (70 files)
│   └── thumbnails/            # Pre-rendered thumbnail images
│       └── v-00.png .. v-69.png
├── REFERENCES/                # Grasshopper screenshots and specs
│   ├── CUT-INPUT-01..08.png   # Cutter definition screenshots
│   ├── cutter-01..08_specs.png # Panel data for each cutter
│   ├── cutter-05-06-07_plane.png # Cylinder plane definitions
│   ├── box_initial.png        # Cube origin/size definition
│   ├── 8x4_gh_pythonscript.mkd # Python combination generator
│   └── cube-model_v0.mov      # 3D visualization video
└── components/                # Legacy components (not currently used)
```

**Note:** The `components/` folder contains legacy code. Current working version uses `App.tsx` with all functionality.

---

## Recent Work Completed

### Session 2026-01-22/23 - Complete Overhaul

**Problem:** Original project was built for Google AI Studio's custom runtime (esm.sh importmaps, direct .tsx loading). It wouldn't work as a standard web app - just showed infinite loading animation.

**Solution:** Rebuilt step-by-step with proper Vite configuration, debugging each addition.

#### Critical Bug Fixed

The original `constants.tsx` had an **infinite loop** in `generateVariations()`:

```typescript
// BAD - This could loop forever
while (activeIndices.length < 4) {
  const idx = seed % 8;
  if (!activeIndices.includes(idx)) activeIndices.push(idx);
  seed = Math.floor(seed / 1.5) + 7;
}
```

**Fixed** with proper combination generation in `constants.ts`:

```typescript
// GOOD - Proper C(8,4) = 70 combinations
for (let a = 0; a < 8; a++) {
  for (let b = a + 1; b < 8; b++) {
    for (let c = b + 1; c < 8; c++) {
      for (let d = c + 1; d < 8; d++) {
        // Create variation with cutters [a,b,c,d]
      }
    }
  }
}
```

#### Features Implemented

1. **70 Cube Variations** - Proper C(8,4) combinations of 4 spheres + 4 cylinders
2. **Sidebar Catalog** - Scrollable list with visual indicators (purple=sphere, green=cylinder)
3. **3D Canvas** - OrbitControls (right-drag), proper camera setup
4. **3D Spatial Grid** - Shows lattice at GRID_STRIDE intervals (7x7x4 levels)
5. **Hover Preview** - Transparent cube preview at snap position
6. **Left-click to Place** - Places selected variation at grid position
7. **Cube Selection** - Click placed cube to select (purple highlight)
8. **Delete Function** - Panel with delete button for selected cube
9. **Import JSON** - Load previously saved assemblies
10. **Export JSON** - Download current assembly as `cuboid-assembly.json`
11. **Clear All** - Remove all placed cubes

#### Controls
- **Click** - Place cube at grid position (or on cube face for stacking)
- **Spacebar** - Cycle through valid rotations
- **Escape** - Release picker (stop showing preview)
- **Right-drag** - Orbit camera
- **Scroll** - Zoom in/out
- **Click placed cube** - Select it
- **Delete/Backspace** - Remove selected cube
- **Cmd/Ctrl+Z** - Undo
- **Cmd/Ctrl+Shift+Z** - Redo

---

## Data Formats

### Cube Variation (generated in constants.ts)
```typescript
interface CubeVariation {
  id: string;           // "v-1" through "v-70"
  name: string;         // "Boolean Set 1"
  cuts: BooleanCut[];   // Array of 4 cutters
}

interface BooleanCut {
  id: number;
  type: 'sphere' | 'cylinder';
  position: [number, number, number];
  rotation?: [number, number, number];
}
```

### Placed Cube (for export/import)
```typescript
interface PlacedCube {
  id: string;                        // "cube-1705973234567"
  variationId: string;               // "v-42"
  position: [number, number, number]; // [42.6, 21, 85.2]
  rotation: Rotation;                // 0, 1, 2, or 3 (Y-axis: 0°, 90°, 180°, 270°)
}
```

### Assembly Export JSON
```json
[
  {"id": "cube-123", "variationId": "v-1", "position": [0, 21, 0], "rotation": 0},
  {"id": "cube-456", "variationId": "v-15", "position": [42.6, 21, 0], "rotation": 2}
]
```

---

## Important Constants

```typescript
CUBE_SIZE = 42           // Base cube dimension
CUBE_GAP = 0.6           // Spacing between cubes
GRID_STRIDE = 42.6       // Snap-to-grid spacing (CUBE_SIZE + CUBE_GAP)
SHELL_THICKNESS = 1.6    // Wall thickness (golden ratio homage)
PHI = 1.618034           // Golden ratio (φ)
```

### Coordinate System
- **Cube origin:** (0, 0, 0) - corner, NOT center
- **Cube extent:** (0, 0, 0) to (42, 42, 42)
- **Axes:** X (left→right), Y (front→back), Z (bottom→top)

### Master Cutters (8 total) - EXACT SPECIFICATIONS

See `CUTTER_SPECIFICATIONS.ts` for full details. Summary:

| ID | Type     | Position/Axis              | Radius    | Face/Direction |
|----|----------|----------------------------|-----------|----------------|
| 0  | Sphere   | (6.30, 0.00, 13.44)        | 16.18034  | Y=0 (front)    |
| 1  | Sphere   | (42.00, 14.40, 29.20)      | 9.864601  | X=42 (right)   |
| 2  | Sphere   | (26.54, 42.00, 40.90)      | 13        | Y=42 (back)    |
| 3  | Sphere   | (0.00, 24.30, 29.10)       | 17.085938 | X=0 (left)     |
| 4  | Cylinder | X=21.0, Z=21.0, axis Y     | 16.18034  | Along +Y       |
| 5  | Cylinder | Y=21.0, Z=21.0, axis X     | 9.864601  | Along -X       |
| 6  | Cylinder | X=40.2, Z=21.0, axis Y     | 13        | Along -Y       |
| 7  | Sphere   | (0.00, 37.00, 21.25)       | 17.085938 | X=0 (left)     |

**Radius values are derived from 4 classical mathematical systems:**
- Golden ratio (φ = 1.618...)
- Pi (π = 3.14159...)
- Prime numbers
- Harmonic fifths ratio (3:2)

---

## How to Run

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Deploy to Vercel
vercel --prod
```

---

## Next Steps / Future Work

### COMPLETED: CSG + Connection Rules ✓

**CSG Boolean Geometry:**
- ✓ `three-bvh-csg` library for boolean subtraction
- ✓ Shell mode toggle (1.6 wall thickness)
- ✓ Geometry caching for performance

**Connection Rules System:**
- ✓ Face-to-cutter mapping (which cuts affect which faces)
- ✓ Connection rules: sphere↔sphere, cylinder↔cylinder, shell↔any
- ✓ Auto-rotation to find valid placements
- ✓ Green/red visual feedback for valid/invalid placements
- ✓ Spacebar cycles through valid rotations only

**Key Files:**
- `csgUtils.ts` - CSG boolean operations
- `connectionRules.ts` - Face mapping and connection logic
- `CUTTER_SPECIFICATIONS.ts` - Exact cutter definitions

### Next: Algorithmic Build Mode
- Greedy auto-fill algorithm (place X cubes following rules)
- WFC (Wave Function Collapse) for more sophisticated solving
- Export state for further exploration

### Could Be Added Later
- Performance optimization with InstancedMesh
- Camera presets/views

### Export / Rhino Integration (Backlog)
- **Export assembly as JSON** — positions, variations, rotations, operator history per cube (for round-tripping back to Grasshopper)
- **Export to GLB/glTF** — single merged mesh of the full assembly (viewable in any 3D tool, importable to Rhino via glTF plugin)
- **Export to STL/OBJ** — for 3D printing or direct Rhino import
- **Export to 3DM (Rhino native)** — via rhino3dm.js (WASM library), write NURBS-accurate Breps or meshes directly
- **Grasshopper live-link** — export assembly state over WebSocket/HTTP to a running GH definition (Hops or custom component)
- **CSV/table export** — cube positions + variation indices + cutter indices, importable as GH data tree for parametric reconstruction
- **Per-cube operator log export** — full meme operator history per cube as JSON, for replaying the pataphysical pipeline in GH/Python

---

## Known Bugs (To Fix)

1. ~~**Red marks rotation doesn't work**~~ - **FIXED** (Session 2026-01-25: Added dual-axis rotation with Spacebar + R key)

2. ~~**Grid goes through cubes**~~ - **FIXED** (Session 2026-01-26: Grid now shows at cube edges, not through volumes)

3. **Placed cube should be removed from selection** - Once a variation is placed, it should be removed from the sidebar selection options (to encourage variety)

---

## Known Issues

- **Large bundle size** (~1MB) - Three.js + CSG library is heavy

---

## Working With Me

**I'm an architect, not a programmer.** Please:
- Explain technical concepts clearly
- Provide complete working code
- Test changes incrementally
- Update this document after changes

---

## Thesis Context

**Project:** "The Mocking and Criticism Machine" - exploring memes as architectural criticism
**Current Focus:** Virtual/digital architectural systems using geometric elements
**Studio Emphasis:** Mathematical axioms for spatial organization

This Cuboid Studio app explores modular systems and computational design methods for my B.Arch thesis at Tel Aviv University.

---

## Important: Keep This Document Updated

**Always update this handoff document after making changes to the project.** This ensures continuity between sessions and keeps documentation accurate.

---

## Session Log

### Session 2026-01-23 (Evening) - CSG + Connection Rules + Build Mode Foundation

**Completed:**

**Part 1: Grasshopper Specs + CSG**
- Analyzed all Grasshopper screenshots in REFERENCES folder
- Extracted exact cutter specifications from panel data
- Documented coordinate system (cube at 0,0,0 to 42,42,42)
- Created `CUTTER_SPECIFICATIONS.ts` with full type definitions
- Implemented CSG boolean operations using `three-bvh-csg`
- Added shell mode toggle (1.6 wall thickness)
- Updated App.tsx to render actual cut geometry

**Part 2: UX Improvements**
- Fixed cube placement (hover preview was blocking clicks)
- Changed background to light gray for visibility
- Made grid lines more visible
- Added undo/redo (Cmd/Ctrl+Z, buttons in sidebar)
- Added Escape key to release picker
- Added Delete/Backspace key for selected cube
- Added 3D face-based placement (click cube faces to stack)

**Part 3: Connection Rules System**
- Created `connectionRules.ts` with face-cutter mapping logic
- Implemented connection rules:
  - Sphere face ↔ Sphere face ✓
  - Cylinder face ↔ Cylinder face ✓
  - Shell face ↔ Any face ✓
- Added auto-rotation to find valid placements
- Added green/red visual feedback for valid/invalid
- Spacebar cycles through valid rotations only
- Rotation now pivots around cube center (not corner)
- Added toggle to enable/disable connection rules

**Key Files Added/Modified:**
- `CUTTER_SPECIFICATIONS.ts` - Complete cutter data with types
- `csgUtils.ts` - CSG boolean subtraction and shell operations
- `connectionRules.ts` - Face mapping and connection logic
- `App.tsx` - Major updates for all features
- `package.json` - Added `three-bvh-csg` dependency

**Architectural Context (from user):**
- This is a mapping tool for physical→virtual space
- Door (z=0 opening) → Sphere cutter
- Window (z≠0 opening) → Cylinder cutter
- Connection rules enforce logical spatial relationships

---

### Session 2026-01-25 - Connection Rules Refinement + Rotation System + Shell Investigation

**Completed:**

**Part 1: Rotation Bug Fix**
- Fixed spacebar rotation cycling when placement is invalid (red)
- Now cycles through all rotations when no valid ones exist

**Part 2: Dual-Axis Rotation System**
- Added X-axis rotation in addition to Y-axis
- Spacebar: cycles Y-axis rotation (horizontal spin)
- R key: cycles X-axis rotation (tip forward/back)
- Rotation now stored as `{ y: 0-3, x: 0-3 }` instead of single number
- Updated `connectionRules.ts` with combined rotation face mapping
- This allows reaching all face configurations (Y-only couldn't change top/bottom faces)

**Part 3: Connection Rules Refinement**
- Changed from permissive rules to stricter rules:
  - Door (sphere) ↔ Door (sphere) ✓
  - Window (cylinder) ↔ Window (cylinder) ✓
  - Wall (shell) ↔ Wall (shell) ✓
  - Wall (shell) ↔ Door (sphere) ✓
  - Wall ↔ Window ✗
  - Door ↔ Window ✗
- Added collapsible Rules panel in sidebar showing all rules

**Part 4: Shell Geometry Investigation (NOT COMPLETED)**
- Attempted multiple approaches for runtime shell generation:
  1. OuterSolid - InnerSolid (simple box subtraction) - Wrong: rectangular cavity
  2. Larger inner cutters - Wrong: logic inverted
  3. Smaller inner cutters with UNION - Wrong: empty space doesn't subtract
  4. Hollow cutters (spherical/cylindrical shells) + UNION + INTERSECTION - Too heavy, crashed browser
- **Conclusion:** Runtime CSG too complex/slow for proper shell geometry
- **Solution:** Export pre-computed meshes from Grasshopper as GLB files

**Part 5: GLB Loading System**
- Added `loadVariationFromGLB()` function for loading pre-computed models
- Added `USE_PRECOMPUTED_MODELS` flag to switch between CSG and GLB modes
- Added `preLoadAllGLBModels()` for batch loading
- Fallback to CSG if GLB loading fails

**Part 6: Serialization Documentation**
- Created `SERIALIZATION_GUIDE.md` with:
  - Complete variation table (all 70 with cutter indices)
  - Master cutter specifications
  - Grasshopper export instructions
  - Python script for generating same ordering
  - Connection rules explanation (independent of mesh)
  - Verification checklist

**Key Insight:** Connection rules are computed from cutter METADATA (position, type, axis), NOT from mesh geometry. This means:
- Visual meshes can be loaded from pre-computed GLB files
- Rules still work using `CUTTER_SPECIFICATIONS.ts` data
- Two independent systems working together

**Files Added:**
- `SERIALIZATION_GUIDE.md` - Complete export/sync documentation

**Files Modified:**
- `csgUtils.ts` - Simplified to solid CSG + GLB loading support
- `connectionRules.ts` - Dual-axis rotation, stricter rules
- `App.tsx` - R key for X-rotation, simplified Rules toggle, removed shell toggle

**Shell Geometry Algorithm (for Grasshopper reference):**
```
1. Create hollow box (outer cube - inner cube, one face open)
2. Create hollow cutters (spherical/cylindrical shells with wall thickness)
3. UNION hollow cutters with hollow box
4. INTERSECT with cube bounds to trim
5. Open face = face with largest flat surface area (least cuts)
```

---

### Session 2026-01-25 (Evening) - GLB Loading Pipeline Complete

**Completed:**

**Part 1: Variation Naming Convention**
- Changed from 1-indexed (`v-1` to `v-70`) to 0-indexed with padding (`v-00` to `v-69`)
- Updated `CUTTER_SPECIFICATIONS.ts` to match Grasshopper's list ordering
- This ensures direct correspondence between GH script index and app variation ID

**Part 2: GLB Loading Implementation**
- Updated `App.tsx` to use async geometry loading with `getVariationGeometryAsync()`
- Skip CSG pre-generation when `USE_PRECOMPUTED_MODELS = true`
- Added loading state handling (geometry loads asynchronously)

**Part 3: Multi-Mesh GLB Support**
- Grasshopper exports NURBS as multiple mesh fragments (31 meshes for v-00)
- Added mesh merging using `BufferGeometryUtils.mergeGeometries()`
- All mesh parts combined into single geometry with world transforms applied

**Part 4: DRACO Compression Support**
- Added `DRACOLoader` for compressed GLB files
- Uses Google's hosted DRACO decoder (no local files needed)
- Significantly smaller file sizes (~87KB vs ~948KB uncompressed)

**Part 5: Auto-Scaling for Unit Mismatch**
- Rhino exports in meters, model is in millimeters (1000x scale difference)
- Auto-detects small geometries (< 1 unit) and scales to CUBE_SIZE (42 units)
- Auto-translates to origin (0,0,0) to match expected cube position
- No manual unit adjustment needed in Rhino export settings

**Key Technical Details:**

```typescript
// GLB Loading Pipeline (csgUtils.ts)
1. Load GLB with DRACOLoader support
2. Traverse scene, collect all mesh geometries
3. Apply world transforms to each geometry
4. Merge all geometries into one
5. Auto-scale if size < 1 unit (scale to 42 units)
6. Auto-translate to origin (0,0,0)
7. Cache result for reuse
```

**Files Modified:**
- `CUTTER_SPECIFICATIONS.ts` - 0-indexed naming (`v-00` to `v-69`)
- `csgUtils.ts` - DRACO loader, mesh merging, auto-scaling
- `App.tsx` - Async geometry loading, skip CSG when using GLB

**Export Settings (Rhino → GLB):**
- DRACO compression: Enabled (recommended)
- Units: Any (auto-scaling handles conversion)
- Mesh settings: Default is fine (multiple meshes get merged)

---

---

### Session 2026-01-26 - All GLB Files Exported + Grid Fix

**Completed:**

1. **All 70 GLB files exported and deployed**
   - Files: v-00.glb through v-69.glb
   - Total size: ~5MB (with DRACO compression)
   - All variations now load shelled geometry from pre-computed models

2. **Grid fix (Bug #2)**
   - Changed grid lines from cube centers to cube edges
   - Lines now appear between cubes, not through them
   - Reduced opacity to 0.4 for subtler appearance

**Deployed:** https://cuboidstudio.vercel.app

---

### Session 2026-01-26 (Continued) - Graphics, Auto-fill, Section Cut

**Completed:**

**Part 1: Graphics Overhaul**
- Changed from shaded 3D look to clean architectural style
- White flat surfaces with black edge outlines (using `EdgesGeometry`)
- No lighting/shadows - pure line drawing aesthetic
- Color states: white (normal), light purple (selected), light green (valid), light red (invalid)
- Increased preview opacity to 0.8 for better visibility

**Part 2: Thumbnail Grid**
- Replaced text list with 3x grid of thumbnails
- Simple styled divs showing variation ID + cutter type indicators (circles=spheres, squares=cylinders)
- Avoids WebGL context limits (70 canvases would exceed browser limits)

**Part 3: Connection Rules Bug Fix**
- Fixed bug where validity changed based on mouse position (hovering cube vs ground)
- Now checks ALL adjacent placed cubes at the preview position
- Added `findValidRotationsAtPosition()` function in connectionRules.ts
- Consistent green/red feedback regardless of hover source

**Part 4: Post-Placement Rotation**
- Can now rotate placed cubes after placement
- Select a cube (click), then Spacebar (Y-axis) or R (X-axis) to rotate
- Respects connection rules - only rotates to valid orientations
- Rotation creates undo history entry

**Part 5: Auto-Fill Algorithm (Greedy Growth)**
- +5 / +10 / +25 buttons to auto-place cubes
- If cube selected: grows only from that cube outward
- If no cube selected: grows from any edge (random)
- Algorithm finds valid position + variation + rotation, picks randomly
- New cubes become part of frontier for continued growth

**Part 6: Section Cut (Clipping Plane)**
- Toggle-able section plane for architectural sections
- Choose axis (X/Y/Z) and position (slider -100 to 200)
- Uses Three.js clipping planes
- Section cap fill: dark gray back-faces show at cut surface
- Canvas configured with `localClippingEnabled: true`

**Key Code Changes:**

```typescript
// Section plane state (App.tsx)
const [sectionEnabled, setSectionEnabled] = useState(false);
const [sectionAxis, setSectionAxis] = useState<'x' | 'y' | 'z'>('y');
const [sectionPosition, setSectionPosition] = useState(50);

// Clipping plane creation
const clippingPlanes = useMemo(() => {
  if (!sectionEnabled) return [];
  const normal = new THREE.Vector3(
    sectionAxis === 'x' ? -1 : 0,
    sectionAxis === 'y' ? -1 : 0,
    sectionAxis === 'z' ? -1 : 0
  );
  return [new THREE.Plane(normal, sectionPosition)];
}, [sectionEnabled, sectionAxis, sectionPosition]);

// Auto-fill with seed selection (App.tsx)
handleAutoFill(count: number) - grows from selectedCubeId if set

// Connection rules fix (connectionRules.ts)
findValidRotationsAtPosition(position, variationId, placedCubes, gridStride)
```

**Files Modified:**
- `App.tsx` - Graphics, thumbnails, auto-fill, section cut, rotation
- `connectionRules.ts` - Added `findValidRotationsAtPosition()`, `PlacedCubeInfo` interface

**Controls Summary:**
- **Click thumbnail** - Select variation for placement
- **Click canvas** - Place selected variation
- **Click placed cube** - Select it
- **Spacebar** - Rotate Y-axis (preview or selected cube)
- **R** - Rotate X-axis (preview or selected cube)
- **Delete/Backspace** - Delete selected cube
- **Cmd/Ctrl+Z** - Undo
- **Cmd/Ctrl+Shift+Z** - Redo
- **Escape** - Deselect / release picker

---

### Session 2026-01-26 (Evening) - Pre-rendered Thumbnails

**Completed:**

**Part 1: Thumbnail Generator Utility**
- Created `ThumbnailGenerator.tsx` - standalone utility page
- Access via `?thumbnails` query param: `http://localhost:3000/?thumbnails`
- Renders each of 70 variations one-by-one to capture PNG images
- Uses orthographic camera for true isometric projection (no perspective distortion)
- Camera at classic isometric angle: 35.264° from horizontal (arctan(1/√2))
- Same white fill + black edge style as main app

**Part 2: ZIP Download**
- Added JSZip dependency for single-file download
- "Download All" button creates `thumbnails.zip` with all 70 PNGs
- Individual click-to-download still available per thumbnail

**Part 3: Static Thumbnail Images**
- Generated and saved all 70 thumbnails to `/public/thumbnails/`
- Updated `CubeThumbnail` component to use static `<img>` tags
- Images load from `/thumbnails/v-00.png` through `/thumbnails/v-69.png`
- Much better performance than placeholder divs

**Files Added:**
- `ThumbnailGenerator.tsx` - Thumbnail generation utility
- `public/thumbnails/*.png` - 70 pre-rendered thumbnail images

**Files Modified:**
- `index.tsx` - Added route switch for `?thumbnails` query param
- `App.tsx` - Updated `CubeThumbnail` to use static images
- `package.json` - Added `jszip` dependency

**Technical Details:**
```typescript
// Orthographic camera for true isometric (ThumbnailGenerator.tsx)
<Canvas
  orthographic
  camera={{
    zoom: 1.4,
    position: [100, 100 * Math.SQRT2, 100],  // Classic isometric angle
    near: 0.1,
    far: 1000
  }}
/>

// Static thumbnail component (App.tsx)
<img src={`/thumbnails/${variation.id}.png`} />
```

---

### Session 2026-01-27 - PWA Implementation

**Completed:**

**Part 1: PWA Setup**
- Installed `vite-plugin-pwa` and `workbox-window` packages
- Configured Vite PWA plugin with:
  - Web app manifest (name, theme color, display mode)
  - Service worker with auto-update
  - Precaching strategy for all assets
- Generated icon sizes: 192px, 512px, Apple touch icon (180px)
- Initially used JPG format, then converted to PNG for better browser support
- Added iOS-specific meta tags for home screen installation

**Part 2: Web App Manifest Configuration**
```json
{
  "name": "Cuboid Studio",
  "short_name": "Cuboid Studio",
  "description": "3D modular logic builder for architectural exploration",
  "theme_color": "#f5f5f5",
  "background_color": "#f5f5f5",
  "display": "standalone",
  "scope": "/",
  "start_url": "/"
}
```

**Part 3: Service Worker & Caching**
- Precache strategy: All assets cached on first install (~7MB)
- Cached assets include:
  - All 70 GLB models (v-00.glb to v-69.glb)
  - All 70 thumbnails (v-00.png to v-69.png)
  - JavaScript, CSS, HTML
  - Icons
- Runtime caching for external CDNs:
  - Tailwind CSS (cdn.tailwindcss.com)
  - Font Awesome (cdnjs.cloudflare.com)
- Maximum file size increased to 5MB for large GLB files

**Part 4: Install Prompt UI**
- Added event listeners for `beforeinstallprompt` and `appinstalled`
- Created install button that appears when browser offers PWA installation
- Fallback UI with installation instructions when prompt not available
- Button styling: Blue gradient background, positioned in sidebar
- Instructions show browser-specific install steps (e.g., "Menu → Install Cuboid Studio")

**Part 5: Icon Format Fix**
- Changed from JPG to PNG format (Chrome requirement)
- Icons now properly recognized by all browsers
- Files: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`

**Part 6: Sidebar Width Fix**
- Added `minWidth: 250px`, `maxWidth: 250px`, `flexShrink: 0`
- Prevents sidebar from being compressed by canvas
- Maintains consistent width when PWA window resizes

**Part 7: Fullscreen Exit Bug Fix**
- Fixed sidebar losing width constraints when exiting fullscreen on Mac
- Made width constraints more explicit with string units ('250px')
- Added `flexBasis: '250px'` and `flexGrow: 0` to sidebar
- Added `minWidth: 0` to canvas container for proper flex shrinking
- Added `overflow: hidden` to parent and canvas containers
- Sidebar now maintains 250px width through fullscreen transitions

**Key Technical Details:**

```typescript
// PWA install prompt handling (App.tsx)
useEffect(() => {
  const handleBeforeInstallPrompt = (e: Event) => {
    e.preventDefault();
    setDeferredPrompt(e);
    setShowInstallButton(true);
  };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);

  return () => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', handleAppInstalled);
  };
}, []);

// Vite PWA configuration (vite.config.ts)
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,jpg,jpeg,png,svg,glb,json}'],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'tailwind-cache',
          expiration: { maxEntries: 10, maxAgeSeconds: 31536000 }
        }
      }
    ]
  }
})
```

**Files Modified:**
- `vite.config.ts` - Added VitePWA plugin configuration
- `index.html` - Added PWA meta tags and Apple iOS tags
- `App.tsx` - Added install prompt handling and UI
- `package.json` - Added `vite-plugin-pwa` and `workbox-window` dependencies
- `.gitignore` - Added `.env.local` to prevent API key commits

**Files Created:**
- `public/icon-192.png` - PWA icon (192x192)
- `public/icon-512.png` - PWA icon (512x512)
- `public/apple-touch-icon.png` - iOS home screen icon (180x180)

**PWA Features:**
- ✓ Installable as standalone app on desktop and mobile
- ✓ Offline functionality (all assets precached)
- ✓ Fast loading from cache
- ✓ Native app experience (no browser UI)
- ✓ Custom theme color (#f5f5f5 light gray)
- ✓ Auto-updates when new version deployed

**Installation Methods:**
- **Chrome/Edge Desktop**: Menu (⋮) → "Install Cuboid Studio" or click install button when shown
- **Chrome/Edge Mobile**: Menu → "Install app" or "Add to Home Screen"
- **Safari iOS**: Share button → "Add to Home Screen"
- **In-app**: Blue install button appears in sidebar when browser offers installation

**Known Issues:**
- Chrome may delay showing install prompt until user engages with site
- Safari (macOS desktop) does not support PWA installation
- Clearing browser data/permissions required for testing install prompt multiple times

---

### Session 2026-01-28 - GitHub Setup, UI Improvements, Git Configuration

**Completed:**

**Part 1: GitHub Repository Setup**
- Created GitHub repository: https://github.com/iddonaim/cuboid-studio
- Generated SSH key for authentication (ed25519)
- Configured SSH key with correct email (iddonaim@gmail.com)
- Added SSH key to GitHub account
- Initial commit and push to GitHub

**Part 2: REFERENCES Folder Management**
- Removed REFERENCES folder from git repository (84MB video file + internal screenshots)
- Added REFERENCES/ to .gitignore
- Folder remains locally for development reference
- Cleaned from entire git history using git filter-branch
- Updated documentation with strict rules about REFERENCES folder

**Part 3: Git Configuration**
- Set global git config: `user.name = "Iddo Naim"`
- Set global git config: `user.email = "iddonaim@gmail.com"`
- Rewrote all commit history to use correct email (not Mac user email)
- Force-pushed corrected history to GitHub
- Added documentation about required git configuration

**Part 4: Vercel-GitHub Integration**
- Connected Vercel project to GitHub repository
- Enabled automatic deployments on git push
- Enabled Pull Request comments
- Enabled deployment status events
- No more manual `vercel --prod` needed - just `git push`

**Part 5: UI Improvements - Remove Import/Export**
- Removed Import/Export JSON buttons from sidebar
- Removed `handleExport`, `handleImport` functions
- Removed `fileInputRef`
- Cleaner sidebar UI (no longer needed with direct GLB models)

**Part 6: UI Improvements - Section Cut Checkbox**
- Fixed Section Cut controls to appear ABOVE checkbox (not below)
- Checkbox now stays in same position when toggled
- Controls expand upward instead of pushing checkbox down
- Better UX for enabling/disabling section cut

**Part 7: Sidebar Width Fullscreen Fix**
- Enhanced sidebar width constraints for fullscreen stability
- Added `flexBasis: '250px'` and `flexGrow: 0`
- Added `minWidth: 0` to canvas container
- Sidebar maintains exact 250px width through fullscreen transitions on Mac

**Workflow Changes:**

**Before:**
```bash
# Make changes
git add .
git commit -m "message"
vercel --prod  # Manual deployment
```

**After:**
```bash
# Make changes
git add .
git commit -m "message"
git push  # Automatic deployment via GitHub → Vercel
```

**Git Best Practices Added:**
- Always check git config before commits
- Never commit REFERENCES folder
- Use correct email (iddonaim@gmail.com)
- SSH authentication for passwordless push/pull

**Files Modified:**
- `.gitignore` - Added REFERENCES/ and .env.local
- `App.tsx` - Removed import/export UI, fixed section cut layout, enhanced sidebar flex
- `CLAUDE_CODE_HANDOFF.md` - Added git configuration section, REFERENCES warnings

**Files Removed from Git:**
- All files in REFERENCES/ (removed from entire history)

**Repository Information:**
- **GitHub**: https://github.com/iddonaim/cuboid-studio
- **Vercel**: https://cuboidstudio.vercel.app (auto-deploys from main branch)
- **SSH**: Configured for passwordless git operations

---

### Session 2026-01-29 - Strict Alignment Rules

**Completed:**

**Part 1: Strict Alignment Rules System**
- Added second checkbox for "Strict Alignment" rules alongside existing "Rules" toggle
- Strict rules enforce visual continuity of sphere/cylinder cutters
- When enabled, sphere-to-sphere and cylinder-to-cylinder connections must have aligned centers
- Alignment tolerance: ~10% of cutter radius
- Comparison done in local cube space (before rotation/translation)

**Part 2: Connection Rules Logic**
- Added `getRotatedFaceCutter()` - returns the cutter specification affecting a world-space face after rotation
- Added `getCutterPositionOnFace()` - extracts 2D position of cutter on face plane
- Added `cuttersAlign()` - checks if two cutters align within tolerance
- Added `canConnectStrict()` - checks both type compatibility and alignment
- Updated all validation functions to accept `strictMode` parameter:
  - `findValidRotation()`
  - `findAllValidRotations()`
  - `findValidRotationsAtPosition()`

**Part 3: UI Components**
- Created `StrictRulesToggle` component with collapsible details panel
- Shows additional alignment constraints and tolerance explanation
- Disabled when basic "Rules" are disabled (requires basic rules to be enabled)
- Orange color scheme to differentiate from green basic rules

**Part 4: Integration**
- Added `strictRulesEnabled` state to App.tsx
- Passed strict mode parameter to all validation calls
- Updated dependency arrays to include `strictRulesEnabled`
- Strict rules only apply when both `rulesEnabled` AND `strictRulesEnabled` are true

**Key Technical Details:**

```typescript
// Alignment checking (connectionRules.ts)
function cuttersAlign(cutter1, cutter2, face1, face2) {
  const pos1 = getCutterPositionOnFace(cutter1, face1);
  const pos2 = getCutterPositionOnFace(cutter2, face2);
  const distance = Math.sqrt((pos1[0] - pos2[0]) ** 2 + (pos1[1] - pos2[1]) ** 2);
  const tolerance = radius * 0.1; // 10% of radius
  return distance <= tolerance;
}

// Strict connection check
function canConnectStrict(type1, type2, cutter1, cutter2, face1, face2) {
  if (!canConnect(type1, type2)) return false;  // Basic rules first
  if (type1 === 'shell' || type2 === 'shell') return true;  // Shells don't need alignment
  if (cutter1 && cutter2 && type1 === type2) {
    return cuttersAlign(cutter1, cutter2, face1, face2);  // Check alignment
  }
  return true;
}
```

**Files Modified:**
- `connectionRules.ts` - Added strict alignment checking functions
- `App.tsx` - Added strict rules UI and state management

**Behavior:**
- Basic "Rules" checkbox: enables type-based connection rules (sphere↔sphere, cylinder↔cylinder, etc.)
- "Strict Alignment" checkbox: adds alignment requirement for sphere/cylinder pairs
- Strict Alignment requires Rules to be enabled (disabled when Rules is off)
- Visual feedback: green for valid, red for invalid (same as before)
- Rotation cycling (Spacebar/R) respects strict rules when enabled

**Use Case:**
This feature enables more precise architectural assemblies where sphere cutters (doors) and cylinder cutters (windows) must visually align across adjacent cubes, creating continuous openings rather than offset ones.

---

### Session 2026-01-29 (Evening) - Connection Rules Update + Strict Alignment Fix

**Completed:**

**Part 1: Connection Rules Simplification**
- Changed shell connection rules from "shell ↔ some" to "shell ↔ none"
- Shell (blank wall) now blocks ALL connections
- Growth stops at blank walls (no opening = no connection)
- This creates cleaner architectural logic: openings must align with openings

**Updated Basic Rules:**
- ✓ Door ↔ Door (sphere ↔ sphere)
- ✓ Window ↔ Window (cylinder ↔ cylinder)
- ✗ Wall ↔ **anything** (blank walls block all growth)
- ✗ Door ↔ Window (sphere ↔ cylinder)

**Part 2: Strict Alignment Bug Fixes**

**Bug #1: Cutter Mismatch**
- Problem: `getRotatedFaceCutter()` returned FIRST cutter affecting a face
- But `computeFaceCutTypes()` uses LAST cutter (overwrite behavior)
- When multiple cutters affect same face, types didn't match specs
- Fix: Changed to return LAST cutter to match face type determination

**Bug #2: World Space vs Local Space**
- Problem: Strict alignment checked world positions after rotation
- Rotation changed cutter orientation, breaking alignment even for same cutters
- Example: Cutter 1 at different rotations had different world positions
- Fix: Changed to check LOCAL space positions (ignore rotation)
- Same cutter ID = instant alignment ✓
- Different cutters = compare local positions with 10% tolerance

**Part 3: Alignment Logic Simplification**
```typescript
// New simplified logic
if (cutter1.id === cutter2.id) {
  return true;  // Same master cutter = perfect alignment
}
// Different cutters: check local position similarity
const distance = /* calculate distance in local space */;
return distance <= radius * 0.1;
```

**Results:**
- Auto-fill now works with strict alignment enabled
- Same cutters align regardless of cube rotation
- v-00 can connect to variations sharing cutters (0, 1, 2, or 3)
- System is still constrained but usable

**Files Modified:**
- `connectionRules.ts` - Fixed cutter lookup, changed to local space alignment
- `App.tsx` - Updated rules UI text, cleaned up debug logging

**Key Insight:**
Rotation changes cutter orientation in world space, which would make alignment impossible. By checking LOCAL space (the cutter's original position in the cube), same cutters always align perfectly regardless of how cubes are rotated. This makes strict alignment both functional and practical.

---

---

### Session 2026-02-09 - Evolution Mode Implementation

**Completed:**

**Part 1: Compressibility Engine**
- Created `src/lib/evolution/compressibility.ts` — pure scoring functions
- Four sub-scores, each normalised to [0, 1]:
  1. **Geometric Clustering** (weight 0.3) — cosine similarity of 13D per-cube feature vectors (cutter type one-hot + proportions + position + rotation)
  2. **Spatial Regularity** (weight 0.3) — row/column consistency (60%) + mirror symmetry (40%) along X/Y/Z axes
  3. **Operator Sequence** (weight 0.2) — n-gram repetition ratio (n=1,2,3) across concatenated operator classes
  4. **Meme Coherence** (weight 0.2) — within-group cutter parameter variance grouped by last meme, scored via exp(-variance)
- Compression progress (interestingness) = score_after − score_before
- Comprehensive plain-language documentation alongside technical comments

**Part 2: Evolution Store**
- Created `src/store/useEvolutionStore.ts` — Zustand store
- Meme pool pre-fetch from archthesis via `/api/fetch-memes`
- Candidate generation: parallel Claude API calls, each scored by simulated compression progress
- Three target cube strategies: `random`, `least-compressed`, `adaptive` (50/50 hybrid)
- User selection blending via `selectionPressure` weight
- Apply selected candidate through meme store pipeline (reuses translate-meme result, no extra API call)
- Compressibility log with snapshots and deltas

**Part 3: Evolution Panel UI**
- Created `src/components/evolution/EvolutionPanel.tsx` — sidebar panel
- Generation counter with cube/modified stats
- Score breakdown: live bar chart of all 4 sub-scores with weights
- Meme pool status with auto-fetch on mount
- "Generate candidates" button — fires parallel Claude calls, ranks results
- Candidate list ranked by compression progress (green/red colour coding)
- Each candidate shows: rank, delta score, meme excerpt, operator class, cutter type, target cube
- "Apply" and "Undo" buttons
- Settings: target strategy dropdown, population size slider (2-12), algorithm vs. intuition slider, meme tag filter

**Part 4: Compressibility Sparkline**
- Created `src/components/evolution/CompressibilitySparkline.tsx`
- Small SVG chart: green segments for positive deltas, red for negative
- Amber dot on latest generation, score readout, generation labels

**Part 5: Evolution Viewport Scene**
- Added `EvolutionScene` to `src/components/viewport/Viewport3D.tsx`
- Renders assembly with per-cube geometry overrides from pataphysical mode
- Highlights target cube of previewed candidate in amber (reuses `targeted` prop)
- Wired into Canvas alongside builder/pataphysical/encoding scenes

**Part 6: Documentation Updates**
- Added Rhino/Grasshopper export options to backlog (JSON, GLB, STL, 3DM, GH live-link, CSV, operator log)
- Added evolution session log to CLAUDE_CODE_HANDOFF.md

**Files Created:**
- `src/lib/evolution/compressibility.ts` — compressibility engine (4 sub-scores)
- `src/store/useEvolutionStore.ts` — evolution state management
- `src/components/evolution/EvolutionPanel.tsx` — sidebar UI
- `src/components/evolution/CompressibilitySparkline.tsx` — SVG sparkline chart

**Files Modified:**
- `src/App.tsx` — added EvolutionPanel import and render
- `src/components/viewport/Viewport3D.tsx` — added EvolutionScene
- `CLAUDE_CODE_HANDOFF.md` — backlog updates + session log

**API Cost Estimate:**
- ~6 API calls per generation × ~15 generations/session = ~90 calls
- Estimated ~$0.30–0.90 per evolution session (Claude Sonnet for translate-meme)
- Population size slider (2-12) is the main cost lever

**Remaining Refinements:**
- Adaptive strategy learning (track which regions yield most compression progress over time)
- Highlight relevant cube variations in sidebar (show which can connect)

---

### Session 2026-02-09 (Continued) — Grasshopper Live-Link & Assembly Export

**Completed:**

**Part 1: Assembly Export Utility**
- Created `src/lib/export/assemblyExport.ts` — serialises full assembly state to structured JSON
- Exports: positions, variation IDs, cutter indices, grid indices, rotations (steps + degrees), per-cube operator history
- Includes assembly bounding box and grid metadata (cubeSize, gridStride, units)
- `buildAssemblyExport()` is a pure function; `downloadAssemblyJSON()` triggers browser download

**Part 2: WebSocket Live-Link Client**
- Created `src/lib/export/liveLinkClient.ts` — singleton WebSocket client
- Connects to local bridge server at ws://localhost:9876
- Auto-reconnect with 3s delay; status subscription API for UI updates
- `push(data)` sends assembly state; auto-push on assembly changes when connected

**Part 3: Export Panel UI**
- Created `src/components/export/ExportPanel.tsx` — appears at bottom of sidebar in all modes
- "Download Assembly JSON" button for one-shot export
- Live-link controls: connect/stop button, status indicator (green/amber/red dot), manual push
- Port configuration in collapsible settings
- Auto-pushes assembly to bridge on every state change when connected

**Part 4: Local Bridge Server (Python)**
- Created `grasshopper/cuboid_bridge_server.py` — lightweight asyncio server
- WebSocket endpoint on port 9876 for browser push
- HTTP endpoint on port 9877 for GH polling (GET /state, GET /status)
- Optional `--file` flag to also write JSON to disk for File Watcher fallback
- Single dependency: `pip install websockets`

**Part 5: Grasshopper Python Receiver**
- Created `grasshopper/cuboid_gh_receiver.py` — GHPython component script
- Polls bridge server via HTTP, outputs: positions (Point3d), variations, rotations, cutter indices (DataTree), operators (DataTree)
- Compatible with both IronPython 2 (Rhino 7) and Python 3 (Rhino 8+)
- Instructions for Timer-based polling setup

**Part 6: Documentation**
- Created `grasshopper/README.md` — full setup guide with architecture diagram, quick-start, JSON format reference, and GH reconstruction workflow

**Files Created:**
- `src/lib/export/assemblyExport.ts` — assembly state serialiser
- `src/lib/export/liveLinkClient.ts` — WebSocket live-link client
- `src/components/export/ExportPanel.tsx` — sidebar export UI
- `grasshopper/cuboid_bridge_server.py` — Python bridge server
- `grasshopper/cuboid_gh_receiver.py` — GH Python component
- `grasshopper/README.md` — setup guide

**Files Modified:**
- `src/App.tsx` — added ExportPanel import and render in sidebar
- `CLAUDE_CODE_HANDOFF.md` — session log

---

### Session 2026-02-22 — Screenshot, Saved States & AR Viewer (model-viewer Tier 1)

**Completed:**

**Part 1: Screenshot / Save to Gallery**
- Fixed `preserveDrawingBuffer: true` on the R3F `Canvas` gl prop — without this, `toDataURL()` returns a blank PNG on most browsers
- Added `SceneCapture` inner component (uses `useThree`) that calls `gl.render(scene, camera)` then registers a `toDataURL` function via a module-level ref
- Created `src/lib/capture/screenshotCapture.ts` — module-level capture ref with:
  - `registerCaptureFunction()` / `unregisterCaptureFunction()` called by the inner canvas component
  - `captureAndShare()` — on mobile opens the native OS share sheet via Web Share API (`navigator.share({ files: [file] })`), letting the user "Save to Photos / Gallery"; on desktop falls back to a PNG download
- Created `src/components/tools/CaptureButton.tsx` — floating camera icon button (bottom-right of viewport, above HelpBar), always visible in all four modes; shows spinner while busy

**Part 2: Saved States (localStorage)**
- Created `src/lib/savedStates.ts` — `saveState()`, `listSavedStates()`, `deleteSavedState()`, `savedStateToPlacedCubes()`
  - Reuses the existing `AssemblyExport` format (same JSON schema)
  - Up to 20 named slots, newest first; auto-prunes oldest
  - Storage key: `"cuboid-saved-states"`
- Created `src/components/tools/SavedStatesPanel.tsx` — collapsible panel inside ExportPanel:
  - Name text field + "Save" button (disabled when no cubes)
  - List of saved states: name, cube count, date
  - "Load" button restores cubes to builder
  - Two-click delete confirmation (first click turns button red, second click confirms)

**Part 3: GLB Assembly Export**
- Created `src/lib/export/glbExport.ts`:
  - `exportAssemblyAsGLB()` — loads each cube's geometry from the existing `loadVariationFromGLB()` cache, applies position + rotation transforms matching the scene representation (`geometryOffset = [-21, -21, -21]`), merges into a single `THREE.Group`, exports with Three.js `GLTFExporter` as binary GLB
  - Respects pataphysical `cubeGeometryOverrides` (uses meme-modified geometry if available)
  - Material: `MeshStandardMaterial` (white, roughness 0.65) for correct AR PBR rendering
  - `createAssemblyGLBUrl()` — wraps export in a Blob URL (caller must revoke)

**Part 4: AR Viewer (model-viewer Tier 1)**
- Created `src/components/ar/ARViewer.tsx` — full-screen modal:
  - Exports assembly on open via `createAssemblyGLBUrl()`
  - Renders inside `<model-viewer ar ar-modes="scene-viewer quick-look" camera-controls>` web component
  - Android → Scene Viewer (ARCore); iOS 15+ → Quick Look (ARKit, GLB natively supported)
  - Desktop → 3D orbit view (no AR button, graceful degradation)
  - Scale slider: 0.001–0.05 (default 0.01 = ~42 cm/cube); label shows real-world cube size in cm
  - Scale updated via DOM `setAttribute` for reliable web-component reactivity
- Added model-viewer CDN script to `index.html`:
  ```html
  <script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script>
  ```
- Added "View in AR" button (blue, disabled when no cubes) to `ExportPanel.tsx`
- `ARViewer` + `SavedStatesPanel` imported into `ExportPanel.tsx`
- `CaptureButton` added to canvas overlay area in `App.tsx`

**Unit note (important for future AR work):**
GLTF convention is 1 unit = 1 metre. Our scene uses 42-unit cubes (42 mm). In AR, an unscaled export appears as 42 m cubes. The scale slider compensates: default 0.01 → 0.42 m = 42 cm per cube.

**Files Created:**
- `src/lib/capture/screenshotCapture.ts` — screenshot/share utility
- `src/lib/savedStates.ts` — localStorage save/load
- `src/lib/export/glbExport.ts` — GLB assembly export for AR
- `src/components/tools/CaptureButton.tsx` — floating camera button
- `src/components/tools/SavedStatesPanel.tsx` — collapsible save/load panel
- `src/components/ar/ARViewer.tsx` — model-viewer AR modal

**Files Modified:**
- `src/components/viewport/Viewport3D.tsx` — `preserveDrawingBuffer: true`, `SceneCapture` component, `useThree` import
- `src/components/export/ExportPanel.tsx` — AR button, `ARViewer` + `SavedStatesPanel` wired in
- `src/App.tsx` — `CaptureButton` added to canvas overlay
- `index.html` — model-viewer CDN script

**AR Platform Compatibility:**
- ✓ Android Chrome (ARCore / Scene Viewer)
- ✓ iOS 15+ Safari (ARKit / Quick Look with GLB)
- ✗ iOS < 15 (gets 3D orbit view, no AR — graceful degradation)
- ✗ Desktop (3D orbit view only)

**Deployed:** Branch `claude/evaluate-ar-integration-GiC4t` — pending review/merge

---

---

### Session 2026-02-22 (Evening) — Mobile Layout, iOS Safari Fixes, Touch Controls

**Context:** The mobile bottom sheet was not visible on real iPhone 11 in Safari, despite appearing correctly in Chrome's device simulation. Multiple overlapping iOS/WebKit bugs were causing the issue.

---

**Root Causes Identified & Fixed:**

**1. `100vh` iOS Safari bug**
`100vh` in CSS equals the maximum viewport height (browser chrome fully hidden). When Safari's address bar + bottom toolbar are visible (default on page load), the actual visible area is smaller, so a flex column with `height: 100vh` extends below the screen and the bottom sheet is off-screen. Fixed by using `height: 100dvh` (dynamic viewport height) via a CSS class with `100vh` fallback:
```css
.mobile-root {
  height: 100vh;   /* fallback for iOS < 15.4 */
  height: 100dvh;  /* auto-adjusts for browser chrome on iOS 15.4+ */
}
```

**2. WebGL GPU compositing layer bleed**
React Three Fiber's WebGL `<canvas>` is composited by the GPU on its own layer on iOS. This layer can visually paint over sibling HTML elements regardless of CSS `z-index`. Fix:
- `transform: translateZ(0)` on the **viewport container div** → creates a GPU compositing boundary, containing the WebGL canvas within its box
- `transform: translateZ(0)` on the **bottom sheet div** → promotes it to its own GPU layer above the canvas

**3. Touch orbit disabled by mouseButtons override**
`OrbitControls` was configured with `mouseButtons.LEFT = undefined` to reserve left-click for cube placement. In Three.js OrbitControls, single-finger touch maps to `LEFT` by default — so disabling `LEFT` also silently disabled touch rotation on all touch screens. Fix: explicit `touches` prop:
```tsx
touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
```

**4. Mobile layout never deployed**
All mobile fixes were committed to a feature branch and only took effect once the branch was merged and deployed. Earlier "it still doesn't work" feedback was against the old live code — important lesson for future sessions: always confirm changes are deployed before testing.

---

**Mobile Layout Architecture (final):**
```
App.tsx (isMobile branch)
└── <div className="mobile-root">          ← 100dvh height via CSS class
    ├── <div style={{ flex: 1, transform: translateZ(0) }}>   ← GPU boundary
    │   ├── <Viewport3D />                 ← r3f Canvas (WebGL)
    │   └── overlay panels (absolute)
    └── <MobileBottomSheet>               ← flex child, flexShrink: 0
        ├── expandable panel (0 → 55vh)
        └── always-visible handle bar (mode label + arrow)
```

**Controls (mobile):**
- **Tap handle bar** — expand/collapse the bottom drawer
- **Single-finger drag** — orbit camera
- **Two-finger pinch** — zoom
- **Tap grid/cube** — place / select cube (same logic as desktop click)

**PRs Merged:**
- PR #16: Mobile bottom drawer layout + AR/screenshot features + touch controls + iOS height fixes
- PR #17: `100dvh` CSS class + GPU compositing containment (pending merge)

**Files Modified:**
- `src/App.tsx` — mobile flex column layout, `mobileHeight` state → CSS class
- `src/index.css` — added `.mobile-root` with `100vh` / `100dvh` cascade
- `src/components/layout/MobileBottomSheet.tsx` — `translateZ(0)` GPU promotion
- `src/components/viewport/Viewport3D.tsx` — `touches` prop on OrbitControls
- `src/hooks/useIsMobile.ts` — breakpoint 640px (iPhone 11 at 414px → mobile layout)

---

---

## Session Log — 2026-04-20 — Pataphysical v2 Phase 1 (complete) + alignment

**What phase 1 shipped** (branch `pataphysical-v2-phase1`, commits `b12f8a4` and `b97c247`):
- Migrated `api/translate-meme.ts` from direct Anthropic SDK to OpenRouter, with Anthropic legacy fallback
- Added `TRANSLATION_PASS_MODE` feature flag (`single` | `two_pass`) with per-request override — v1 callers (Evolution, Pataphysical mode) are shielded by `translateMeme()` always requesting `single`
- Added two-pass types (`TranslationPass1`, `TranslationPass2`, `ConfidenceVector`, `OperatorClassV2` with `consolidation`/`erosion`/`reinforcement`) in `src/lib/operators/types.ts`
- Added `translateMemeTwoPass()` client function (not yet wired to UI)
- Added embedded **Site Context Curator** modal in the Pataphysical sidebar (`src/components/meme/SiteContextCurator.tsx`) with SunCalc, localStorage persistence, and the geocode proxy integration
- Added **Nominatim geocode proxy** at `api/geocode.ts` (fixes the browser CORS / User-Agent issue described in spec §4.5)
- Filled `src/prompts/pataphysical-translation-v2.md` with the canonical curatorial artifact (Pass 1 + Pass 2 full instructions, not skeleton placeholders)
- Imported the canonical implementation spec as `PATAPHYSICAL_V2_SPEC.md` at repo root

**Phase 2 status** (see `PATAPHYSICAL_V2_SPEC.md` §4 for full detail). *Re-verified against the live code on 2026-06-16 — the bulk of Phase 2 shipped after this session log was first written; the boxes below now reflect what is actually in the codebase.*

- [x] **Cube operators** (§4.3): `consolidation`/`erosion`/`reinforcement` live alongside the original six — typed in `operators/types.ts`, accepted by the validator (`VALID_OPERATORS_V2`), and grouped by the compressibility scorer. (Note: the operator name is a label for scoring + reasoning; the actual geometry comes from the `cutter`, so operators do not have per-name geometry branches.)
- [x] **Wire `translateMemeTwoPass()` to UI** — called by both `useMemeStore` (Pataphysical panel; `passMode` now defaults to `'two_pass'`) and `useEvolutionStore` (every evolution candidate).
- [x] **Pass 1 display** (§4.2b): rendered in `OperatorResultPanel.tsx` (rhetorical moves as tags, meme summary, etc.) and per-candidate in `EvolutionPanel.tsx`.
- [x] **Pass 2 additions** (§4.2c): `target_reasoning` and `cutter.geometry_reasoning` shown as readable text in `OperatorResultPanel.tsx`.
- [x] **Confidence vector display** (§4.2d): four-axis readout via `ConfidenceVectorDisplay` with `confidence_note`.
- [~] **Site context selector** (§4.2a): partial. There is one **active** site context, curated in `SiteContextCurator.tsx` and live-switchable without reload (via the `cuboid:siteContextChanged` event). What's *not* built is a saved **library** of multiple contexts with a dropdown to pick between them — storage holds a single active context only (`siteContext.ts`).
- [ ] **Translation history** (§4.2e): not built. No store of past translations per site; no cross-meme confidence-vector comparison.
- [ ] **Optional — model selector** (§4.1c): not built. The `model` parameter exists end-to-end (client `TranslateMemeV2Request.model` → API), but no UI exposes it.

**Next up — editable translation vocabulary ("Level A"):** give Pataphysical/Evolution the same prompt-as-UI-layer treatment Encode got with lexicons (L3) — edit operator definitions, the rhetorical-move→operator mapping, edge-type and affect→geometry wording, decay and confidence text, while keeping the fixed set of nine operators. In progress (branch `claude/busy-albattani-790leq`).

**Key files for phase 2:**
- `src/prompts/pataphysical-translation-v2.md` — the curatorial artifact. **Editing this is how you change behavior; code rarely needs to change.**
- `PATAPHYSICAL_V2_SPEC.md` — full implementation spec and thesis framing
- `api/translate-meme.ts` — two-pass API route (already supports `two_pass` mode)
- `src/lib/api/translateMeme.ts` — client; `translateMemeTwoPass()` is the Phase 2 entry point
- `src/lib/operators/types.ts` — v2 types
- `src/components/meme/SiteContextCurator.tsx` — embedded curator
- `src/lib/storage/siteContext.ts` — localStorage layer for site contexts
- `api/geocode.ts` — Nominatim proxy

---

## Session Log — 2026-06-08 — Encode reading layer (L1/L2) + editable lexicons (L3)

Three waves on the Encode mode, all merged to `main` (PRs #57–#59).

**L1 — five-axis reading** (`587589e`):
- The vision model emits a structured reading *before* committing geometry: three continuous axes (atmosphere, light, emotion) + two categorical (rhythm, placement).
- The Encode prompt is now **composed at runtime** from `spatial-encoding-grammar.md` (template with `{{slot}}` injections) + a lexicon, instead of a single static prompt file.

**L2 — editable reading + provenance** (`f28c096`, `0a00004`, `adb3a9b`):
- Floating reasoning card for the sidebar/floating split (`EncodingReadingPanel.tsx`).
- The architect can lightly edit the reading. The model's original is preserved (`encodingReadingOriginal`, never mutated) next to the working copy, with a `readingEdited` flag.
- Reading + lexicon provenance is persisted on save and restored on load (`composition.ts`); pre-L1/L2 compositions degrade gracefully (fields absent).

**L3 — editable lexicons** (`a8fc606`, `afb784a`, `8fa81eb`, `d541a1e`):
- Lexicons are no longer code-only. Full authoring surface (`LexiconEditor.tsx`) at the top of the Encode panel: edit poles/options/triggers, tag, save to a cloud library, pick the active one.
- `DEFAULT_LEXICON` is the built-in baseline (never stored); `activeLexiconId === null` means "use default."
- Active id persisted in `localStorage` (`src/lib/storage/activeLexicon.ts`) and **validated against the loaded list on init** — a deleted/stale id silently falls back to default, never points at a ghost lexicon (avoids the silent-wrong-vocabulary trap).
- Firestore: top-level `lexicons` collection scoped by `ownerId` (`lexiconFirestore.ts`); security rules added to `firestore.rules` (deploy additively alongside archthesis rules).
- Reading panel pole labels are sourced from the active lexicon, so editing vocabulary re-labels the reading axes.

**Key new files:** `src/store/useLexiconStore.ts`, `src/lib/projects/lexiconFirestore.ts`, `src/lib/storage/activeLexicon.ts`, `src/components/encoding/LexiconEditor.tsx`, `src/components/encoding/EncodingReadingPanel.tsx`.

---

## Session Log — 2026-06-16 → 2026-06-18 — Test harness (Phases 1–2) + translation pipeline hardening

Two features shipped to `main` first (PRs #62, #63): the translation API now
**retries on an invalid operator** instead of dropping the evolution candidate
(fixed the intermittent 422 where the model emitted `juxtaposition` in the
operator field), and Pataphysical/Evolution gained an **editable translation
vocabulary** ("Level A") — the Encode-lexicon (L3) pattern applied to the v2
prompt, composed at runtime and byte-identical to the old static file on the
default vocabulary.

This session adds the project's **first test harness** (Vitest), still on
branch `claude/test-harness-phase1` (PR #64 — open, draft; both phases below
landed there rather than splitting Phase 2 into its own PR, since #64 hadn't
merged yet).

**Phase 1 — pure logic: prompt + API + core geometry:**
- `src/prompts/translationLexicon.default.test.ts` — prompt composition + a
  byte-for-byte snapshot guard + the `isTranslationLexicon` validator.
- `api/translate-meme.test.ts` — the Pass 1/2/single validators, including the
  exact #62 case (`juxtaposition` operator → rejected).
- `src/lib/cube/connectionRules.test.ts` — face geometry + connection invariants.

**Phase 2 — more pure logic: evolution scoring + cut geometry:**
- `src/lib/evolution/compressibility.test.ts` — `computeCompressibility`'s four
  sub-scores against a hand-verified known assembly, the documented weighting,
  the low-cube-count guard, `compressionProgress`, `createSnapshot`.
- `src/lib/operators/applyOperator.test.ts` — cutter sizing per type (box/
  sphere/cylinder/plane), proportion clamping, and the real CSG subtraction
  (`three-bvh-csg`, unmocked — it's pure geometry math, runs fine in Node).
- `src/lib/decode/snapUtils.test.ts` — tile rotation/transform math and
  `findClosestSnap`'s radius cutoff and closest-candidate selection.
- `src/lib/decode/variation2dPath.test.ts` — trivial path helper.

71 tests total, run with `npm test`. The validators in `api/translate-meme.ts`
are exported for testing (inert at runtime — Vercel only uses the default
export). See **`docs/internal/TESTING.md`** for the full plan and how scope
grows in later passes (stores → components → API orchestration → e2e).

**Resolved — PR #65 closed (2026-06-19):** PR #65 was opened to fix a claimed
`TS5101: baseUrl is deprecated` error breaking `tsc`. On re-verification the
premise didn't hold: `tsc --noEmit` runs clean (exit 0) on the *old*
`baseUrl: "."` config under TypeScript 5.9.3, and in the 5.9.3 option table
`baseUrl` carries no deprecation/removal marker (the only deprecated options
this version flags are `target: es3` and `moduleResolution: node`). The
proposed replacement config typechecked clean too, so the change was harmless
but unnecessary — a fix for a non-reproducing problem. Closed rather than
merged. `tsconfig.json` is unchanged.

---

**Resolved — map-context picker fixed (2026-06-20):** the address picker on
the separate `iddonaim/map-context` repo's Railway deploy (embedded in
Cuboid Studio's Map tab via iframe — `MapContextCanvas`) had a dead inline
`<script>`: `launcher.js` served its page from a Node template literal
containing unescaped `\n` inside what should be a client-side string
literal (added in `0fcc8a9`, "feat: add SSE progress indicator"). Node's
parser converted those to real newlines at serve time, producing an
unterminated string in the served JS → `SyntaxError` → the whole script
died → no autocomplete, no run button. Fixed with the two-line escape
(`\n` → `\\n` at the two call sites around line 508/515) in
`map-context` PR #10, merged into `main`. Cuboid Studio itself needed no
changes (the iframe just points at whatever Railway serves) — Railway
should auto-deploy from `main`; if the picker still looks broken after
that, check the Railway dashboard for a stuck deploy rather than
re-diagnosing the script.

---

**Last Updated:** 2026-06-20
**Status:** Encode reading layer (L1/L2) + editable lexicons (L3) shipped. Pataphysical v2 Phase 1 + the bulk of Phase 2 shipped (two-pass UI live and default; Pass 1/2 display, confidence vector, expanded operators all in). Editable translation vocabulary ("Level A") shipped (#63). Test harness (Vitest) Phases 1–3 shipped: Phases 1–2 merged (PR #64); Phase 3 (stores — `useLexiconStore` + `useTranslationLexiconStore`, 28 tests) added this session. PR #65 (`tsconfig.json` baseUrl) closed unmerged — fixed a non-reproducing problem; see note above. Remaining Pataphysical Phase 2: a saved site-context library/dropdown, translation history, and the optional model selector.
**Next Feature:** Grow test coverage — Phase 4: components. Add `jsdom` + `@testing-library/react`, then test `TranslationLexiconEditor`. See `docs/internal/TESTING.md`.
**Deployed:** https://cuboidstudio.vercel.app
**Repository:** https://github.com/iddonaim/cuboid-studio
