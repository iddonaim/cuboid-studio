# Claude Code CLI - Project Handoff Prompt

## Context & Project Overview

I'm Iddo, an architecture student working on my B.Arch thesis at Tel Aviv University. This is **Cuboid Studio**, a 3D modular logic builder for architectural exploration that combines parametric cube variations with boolean cuts.

**Project Path:** `/Users/kageyoshiki/Downloads/cuboid-studio-updated`

**Live Deployment:** https://cuboidstudio.vercel.app

**GitHub Repository:** https://github.com/iddonaim/cuboid-studio

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
- Export to STL/OBJ for 3D printing

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

**Last Updated:** 2026-01-29
**Status:** Production-ready PWA with GitHub/Vercel CI/CD pipeline + Strict Alignment Rules
**Remaining Bug:** #3 - Remove placed variation from sidebar selection (low priority)
**Deployed:** https://cuboidstudio.vercel.app
**Repository:** https://github.com/iddonaim/cuboid-studio
