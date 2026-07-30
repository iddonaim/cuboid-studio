# Cuboid Studio — Project Context

> This file is the always-on context for the Cuboid Studio Claude Project.
> Read it in full before responding to any message in this project.
> Last updated: 2026-07-22
>
> This is a factual map of what is **actually in the repo and usable today**,
> reconciled against the live code (not aspirational spec). Where a feature is
> only specced and not built, it says so explicitly.
>
> **2026-07-12:** a full audit found drift in this file — see the
> "Audit corrections (2026-07-12)" section at the bottom, which overrides the
> body where they conflict. Deep reference: `docs/SYSTEM_MAP.md`,
> `docs/GAPS_AND_HOLES.md`, `docs/BOOK_AND_PRESENTATION_GUIDE.md`.
>
> **2026-07-22:** external-review fixes landed — see "Review fixes
> (2026-07-22)" at the bottom for merge-seed encoding, provenance capture,
> the removed Evolve fitness slider, capture metadata, and the Decode plan
> underlay.

---

## What Cuboid Studio Is

A web-based 3D modular architectural design system built as Iddo Naim's B.Arch thesis project at Tel Aviv University (David Azrieli School of Architecture). The core claim: architecture can reconnect with cultural conversation by using internet memes as compressed cultural observations that drive spatial organization through measurable, transparent processes.

The system translates memes — and inhabited spaces — into geometry. Not metaphorically, computationally.

**Live app:** https://cuboidstudio.vercel.app
**Repo:** https://github.com/iddonaim/cuboid-studio (public)
**Stack:** React 18 + TypeScript + Vite 5 + Three.js / React Three Fiber + Vercel serverless functions

---

## The Geometric Vocabulary

**70 cube variations** derived from C(8,4): choose 4 active cutters from a fixed set of 8 master cutters (5 spheres + 3 cylinders), apply boolean subtraction to a base 42×42×42 mm cube. The 8 cutters are the complete and fixed vocabulary of the system — every variation is just a different combination of the same primitives.

Because the cutter set is finite and fixed, all relational operations (assembly, matching, mutation) are unambiguous: two cubes either share a cutter or they don't.

Variations are pre-computed GLB meshes (`public/models/v-00.glb … v-69.glb`) exported from Grasshopper; thumbnails live in `public/thumbnails/`. Cutter specifications and connection rules are computed from cutter **metadata** (`src/lib/cube/specifications.ts`), independent of the visual mesh.

---

## Information Architecture

The app has **four** primary nav modes, all mounted and live: **Map**, **Encode**, **Evolution**, **Decode**.

`AppMode = 'map' | 'encoding' | 'evolution' | 'decode'` (`src/store/useAppStore.ts`). All four `NAV_SLOTS` are `mounted: true`; `VISIBLE_NAV_SLOTS` (which TopBar and the mobile nav render) currently equals all four. There are no hidden placeholder slots anymore.

**Workflow spine:** Map → Encode → Evolution → Decode

| Tab | Status | What it does |
|------|--------|--------------|
| **Map** | Live | Site picker. Leaflet map + an embedded iframe to a separate "map-context" app (`VITE_MAP_CONTEXT_URL`, Railway-hosted). Geocode via Nominatim proxy, radius selector, Overpass POI enrichment. Writes active site context to `localStorage`, feeds Encode + Pataphysical. |
| **Encode** | Live | Upload/capture 1–7 photos of an inhabited space. Claude's vision model emits a five-axis spatial reading and proposes a cuboid assembly. The assembly editor is reachable inline here (Merge mode). |
| **Evolution** | Live | Two sub-modes toggled in-panel: **Evolve** (compressibility-driven candidate generation) and **Pataphysical** (meme → operator translation). |
| **Decode** | Live | 2D notation sheet (Konva) as the full-bleed stage, on an unbounded lattice. Drag/place/rotate tile glyphs of variations, snap-to-grid, export as vector SVG, transparent PNG or DXF. The assembly sits alongside as a live 3D corner preview; clicking it opens the full 3D view. |

**Desktop layout (since the 2026-07 design overhaul):** a **docked left sidebar** (`src/components/layout/Sidebar.tsx`) holds each mode's controls — width-resizable via its right edge (persisted), hidden/shown with the TopBar panel button or **Cmd/Ctrl+B**. Panel contents are organized into **collapsible sections** (`src/components/ui/section.tsx`) whose open/closed state persists per user in `localStorage`; secondary tools (Export & Grasshopper, Saved States, vocabulary editors, Evolve settings) are collapsed by default. Model outputs (encoding result, operator result, selected cube) dock as cards in a right-edge **Inspector rail** (`src/components/layout/Inspector.tsx`) instead of floating loose. The old draggable `FloatingPanel` is gone. Visual language: light "drafting instrument" theme — paper surfaces, warm-gray `ink` Tailwind ramp, single vermilion accent (`--primary`), Geist/Geist Mono, tokens in `src/index.css`.

**The assembly editor is not a top-level tab.** (It was called "the Builder" until 2026-07-28; the name is retired, though the code identifiers still carry it — see Key files below.) It surfaces inline:
- Inside **Encode** when Merge mode opens the seed editor (`seedEditOpen` → `BuilderSidebar` replaces the EncodingPanel).
- The built assembly is the substrate that **Pataphysical** re-cuts (you select a target cube from it).

**Pataphysical is a sub-mode of Evolution**, not a top-level tab. `EvolutionSubMode = 'evolve' | 'pataphysical'`, toggled by the sub-mode switch in the Evolution panel.

---

## Map Mode

- **Embedded "map-context" app** (`src/components/map/MapContextCanvas.tsx`): an iframe to an external service at `VITE_MAP_CONTEXT_URL` (defaults to the Railway deployment). When Map is active, this canvas replaces the 3D viewport. On analysis-complete it writes the site context and sets `siteAnalysisReady`, which surfaces a "Go to Encode" handoff in Cuboid's own chrome.
- **Map chrome, never over the map** (`MapChromeBar.tsx`, `EncodeHandoff.tsx`): the iframe is a third-party app, so Cuboid's Map-tab controls (view switch + Encode handoff) are kept out of the map area — anything floating there covers that app's own toolbar. Desktop puts both in the TopBar; mobile puts them in a strip between the TopBar and the map, which takes its own row rather than overlaying.
- **"My sites" layer** (`src/components/map/SitesMapView.tsx` + `MapViewToggle.tsx`, signed-in only): the Analysis / My sites switch swaps the iframe for a full-bleed Leaflet map plotting every saved Site across all Projects at the coordinates in its stored site context (`src/lib/projects/sitePins.ts`). Marker click → card with the site's compositions (loadable, inline confirm — loading replaces current work) + "Set as active site context". Sites without coordinates surface in a "sites without location" panel from which a location can be assigned (map click or address search; written via `updateSite`, merged over the site's own stored context via `buildSiteContextAt`).
- **`src/components/map/MapPanel.tsx`** (Leaflet site picker: click-to-pin, address search, radius slider, POI fetch) is currently **not mounted anywhere** — orphaned since the map-context iframe took over the Map canvas. Kept in-tree; its `buildSiteContextFromMap` path is still the model for manual pinning.
- **Geocoding:** `api/geocode.ts` — Nominatim proxy (browser can't hit Nominatim directly due to CORS / User-Agent).
- **POIs:** `api/fetch-context-pois.ts` — Overpass query, categorizes ~22 element types (transit, education, healthcare, civic, green space, markets, major roads).
- **Persistence:** `src/lib/storage/siteContext.ts` (`getActiveSiteContext()` / `setActiveSiteContext()`), built via `src/lib/siteContext/mapSiteContext.ts`. The site context (location + quantitative + programmatic) is injected into Pataphysical requests as full JSON, and into Encode as a flattened one-line prefix built from `quantitative` + `nearby_pois` only. The **architect's reading was retired 2026-07-28** — the tab is gone from the curator and `architects_reading` is off the type.

---

## Encode Mode

Reads a photographed space and proposes a cuboid assembly that mirrors its spatial logic.

- **Multi-image:** 1–7 images (1 primary + up to 6 supplementary). Primary anchors the assembly character. Images are resized client-side before upload (`src/lib/encoding/resizeImageToBase64.ts`) to stay under Vercel's request-body limit.
- **Five-axis reading (L1):** the model emits a structured reading **before** committing geometry — three continuous axes (atmosphere, light, emotion) and two categorical axes (rhythm, placement). Rendered in `EncodingReadingPanel.tsx` (with a floating reasoning card in the sidebar/floating split).
- **Editable reading + provenance (L2):** the architect can lightly revise the reading after the model produces it. The model's original is always preserved (`encodingReadingOriginal`, never mutated) alongside the working copy, and a `readingEdited` flag records whether it was touched. The reading's pole labels are sourced from the active lexicon, so editing vocabulary re-labels the reading axes. Provenance (original reading, edited flag, lexicon snapshot) is persisted on save and restored on load; pre-L1/L2 compositions degrade gracefully.
- **Prompt is composed at runtime** from a grammar template + a lexicon, not a single static file:
  - `src/prompts/spatial-encoding-grammar.md` — template with `{{slot}}` vocabulary injections.
  - `src/prompts/lexicon.default.ts` — `DEFAULT_LEXICON`, the built-in baseline `SpatialLexicon` (atmosphere/light/emotion poles, rhythm/placement options).
  - `src/prompts/spatial-encoding.md` — the older standalone curatorial artifact (still present).
- **Editable lexicons (L3):** the vocabulary is no longer code-only. Signed-in architects author named lexicons in a full editor (`LexiconEditor.tsx`, surfaced at the top of the Encode panel), tag them, save them to a Firestore-backed library, and pick which one is active. The active lexicon drives every encode; `activeLexiconId === null` means "use `DEFAULT_LEXICON`". The active id is persisted in `localStorage` and **validated against the loaded list on init** — a deleted/stale id silently falls back to the default rather than pointing at a ghost (guards against silently encoding on the wrong vocabulary). Each axis carries consequence-framed hint text (`DEFAULT_DESCRIPTIONS`) explaining in plain language what editing it does.
  - **Stores/lib:** `src/store/useLexiconStore.ts` (list + active selection + Firestore CRUD, callable from plain functions via `getState()`), `src/lib/projects/lexiconFirestore.ts` (top-level `lexicons` collection, scoped by `ownerId`), `src/lib/storage/activeLexicon.ts` (localStorage wrapper for the active id).
- **Three modes, all reading the same thing:** `standalone` (image only, ignores the assembly), `merge` (image + the builder assembly, composes *alongside* it), `remix` (image + the builder assembly, *rewrites* it). Merge and remix both seed from whatever is on screen — to remix a saved assembly you Load it first, which restores its cuts. They differ in what they do to it, not in what they read, and each mode button carries a one-line hint saying which. In **merge** mode the request carries a compact summary of the seed assembly (variation, position, rotation, operator count + per-cut operator/cutter/rotation/magnitude summaries) which the server injects into the grammar's "EXISTING ASSEMBLY (merge)" section — the model composes *with* what's already placed instead of proposing cubes blind. In **remix** mode the same summary fills the grammar's "SEED ASSEMBLY (remix)" slot instead, and the model returns the *complete reinterpreted assembly* (keep / transform / transplant / discard / add per seed cube; `inheritOperators: true` transplants a replaced cube's operator history onto its successor). The server echoes `remixApplied` only when the grammar file actually contains the remix section — otherwise the client falls back to the legacy overlay (snap + drop seed collisions), so an older grammar can never cause a seed to be replaced. Standalone sends nothing.
- **Remix decisions are surfaced, not just counted** (`src/lib/encoding/remixDecisions.ts`): the result is matched back against the seed to recover what the model decided — *carried* (kept its seed identity and cut history), *transplanted* (new body, inherited cuts), *added* (new or transformed past recognition), *discarded* (nothing carried it forward). Discards are the ones that matter: a discarded cube takes its accumulated cuts with it and they cannot be regenerated, so the panel names the count in amber, says how many cuts go with them, and offers to ghost those cubes in the viewport. "Transform" isn't separable from "added" once a cube no longer matches its seed cell, so it isn't guessed at.
- **Applying a remix replaces the assembly** — same treatment standalone gets: the panel says so and offers a one-click save first. Merge is the only additive mode. On apply, the meme store is rebuilt from the surviving set rather than merged over the old one, so discarded cubes' operator records don't linger keyed to ids that are no longer placed.
- **Proposal vs. assembly (canvas layering):** an encode result is a *proposal* that owns the solid layer only until it's applied; the builder assembly ghosts behind it. Once applied — or once the assembly moves on (a saved state is loaded, cubes are edited away) — the assembly takes the solid layer and the encoding drops to a ghost over it, still there to compare against. `resultApplied` alone doesn't decide this: the panel and the viewport both check whether the result's cube ids are *still in* `placedCubes`, and offer "Apply encoding again" when they aren't. Exactly one layer is solid at a time and the ghost yields any cell they share, so layers never z-fight. Blue ("added" provenance) means *the result currently in the panel* and nothing else — a previously-applied encode goes neutral the moment a new one arrives. Ghosts use `CubeWithCuts`' `ghost` prop, not bare `opacity`: a white fill at low alpha over the paper background still reads as a solid card and depth-writes over the solid layer, so `ghost` drops the fill to a fraction of the edge alpha and turns off `depthWrite`.
- **Re-encoding is destructive and says so:** a re-read replaces the reading (including the architect's revisions), the reasoning and the proposed cubes. It confirms first, spelling out what goes and what doesn't (the assembly is untouched until the new result is applied), and offers a one-click save of the assembly to Saved States. The outgoing result is snapshotted into `previousResult`, which drives a compare-the-two-readings view, a ghosted before/after of the old proposal in the viewport (`showPreviousProposal`), and `restorePreviousResult()`.
- **Loading a saved state is a full replacement**, confirmed inline when the canvas isn't empty: it restores the save's cubes *and* its per-cube meme cuts (`savedStateToOperators` + `rebuildAssemblyGeometry`), replacing the meme store's operator/geometry state rather than leaving the previous assembly's records orphaned behind it.
- **Provenance:** encode results carry the model id and the grammar file's `# version` header (`promptVersion`); both persist with saved compositions. The full encode is unreproducible by design (thumbnail-only photos, nondeterministic LLM) — the *conditions* are what's archived.

**Key files:** `api/encode-space.ts`, `src/lib/api/encodeSpace.ts`, `src/components/encoding/EncodingPanel.tsx`, `src/components/encoding/EncodingReadingPanel.tsx`, `src/components/encoding/LexiconEditor.tsx`, `src/store/useEncodingStore.ts`, `src/store/useLexiconStore.ts`.

---

## Evolution Mode — Evolve sub-mode

The fitness/compressibility engine is **implemented** (`src/lib/evolution/compressibility.ts`, `src/store/useEvolutionStore.ts`, `src/components/evolution/EvolutionPanel.tsx`).

**Actual fitness function = four sub-scores** (weighted sum, each normalised [0,1]):

1. **Geometric clustering** — 0.3 — cosine similarity of 13-D per-cube cutter feature vectors.
2. **Spatial regularity** — 0.3 — row/column consistency (60%) + mirror symmetry (40%) along X/Y/Z.
3. **Operator sequence** — 0.2 — n-gram repetition ratio across operator classes.
4. **Meme coherence** — 0.2 — within-meme-group parameter variance, scored via `exp(-variance)`.

Compression progress (interestingness) = score_after − score_before. A sparkline (`CompressibilitySparkline.tsx`) tracks the trend.

> **Spec vs build:** earlier docs described a *six*-axis vector that also included CSG-tree-edit-distance and topological-genus (voxelized) axes. Those two are **not implemented** — they remain aspirational. The shipping engine is the four sub-scores above.

**Loop:** pre-fetch a meme pool from archthesis (`/api/fetch-memes`) → generate N candidates in parallel (`translateMemeTwoPass()`), each scored by compression progress → rank → preview a candidate (target cube highlighted amber in the viewport) → Apply or Undo.

---

## Evolution Mode — Pataphysical sub-mode (meme translation)

Translates a meme into a spatial operator that re-cuts a target cube. **Both v1 (single-pass) and v2 (two-pass) are implemented and wired to the UI.**

**Pass mode:** per-request, set by the client. `passMode` defaults to **`'two_pass'`** (`useMemeStore.ts:204`); the user can toggle to `'single'` in `MemeInputPanel`. `translateMemeTwoPass()` always sends `two_pass` and auto-injects active site context (`translateMeme.ts:73–75`, unless `skipSiteContext`). `translateMeme()` still exists and always sends `single`, but **nothing in the shipping UI calls it** — Evolution imports `translateMemeTwoPass` only (`useEvolutionStore.ts:6,259`). The `TRANSLATION_PASS_MODE` env var is **dead** — nothing reads it. *(Verified at origin/main 2026-07-28.)*

**Two-pass structure (v2):**
- Pass 1 — cultural extraction: rhetorical moves, cultural tensions, functional affects, site resonance, meme summary.
- Pass 2 — geometric translation: operator + targets + magnitude/decay + cutter (with `geometry_reasoning`) + a **4-axis confidence vector** (`rhetorical_clarity`, `site_resonance`, `affective_coherence`, `operational_specificity`) and a confidence note.

**Operators** (`src/lib/operators/types.ts`, applied in `applyOperator.ts`):
- v1 set (also used by Evolve): inversion, amplification, drift, reassignment, preservation, shuffle.
- v2 additions: consolidation, erosion, reinforcement.

**LLM gateway:** `api/translate-meme.ts` uses **OpenRouter** when `OPENROUTER_API_KEY` is set (default model `anthropic/claude-sonnet-4.6`), otherwise falls back to the Anthropic Messages API. The prompt is the artifact, not the model.

**Prompts:** `src/prompts/pataphysical-translation-v2.md` (two-pass), `src/prompts/pataphysical-translation.md` (v1). **Editing the prompt is how you change behavior; code rarely needs to change.**

**UI:** `MemeInputPanel`, `OperatorResultPanel`, `CutterTweakPanel` (tweak parameters before apply), `OperatorHistoryList`, `ArchthesisBrowser` (browse memes from archthesis), `SiteContextCurator` (set/clear active site context).

---

## Decode Mode

A 2D notational view of the assembly — **implemented**, not a placeholder.

- **The sheet is the stage.** Decode used to draw into a ~320px box inside the sidebar while the read-only 3D took the whole screen — the only mode whose working surface wasn't on the stage. `DecodeCanvas` now mounts full-bleed where `Viewport3D` sits in other modes, and the 3D steps back behind a **Sheet / 3D** pill (`DecodeStageToggle`, `stageView` in the decode store). The sidebar keeps the controls only; the old expand-to-modal escape hatch is gone with the box it escaped. Viewport3D stays mounted *underneath* the sheet rather than hidden — `display:none` collapses the WebGL canvas and it returns with a stale aspect and a badly framed camera. Decode rendered the 3D full-screen before the sheet existed, so covering it costs nothing new.
- **Canvas:** Konva / react-konva (`src/components/decode/DecodeCanvas.tsx`). Drag-place tiles (desktop) or tap-to-place (mobile), rotate in 90° steps, snap-to-grid. Self-contained — it owns its drop target, placement and view controls and talks to the store directly, so nothing has to thread a Konva stage ref through the sidebar.
- **Unbounded sheet.** The lattice is drawn from the current view (one Konva `Shape` whose `sceneFunc` reads the live stage transform and strokes only what's visible, in minor/major tiers that drop out when they'd be denser than a few pixels) rather than as a finite patch of lines sized at mount — panning used to sail off its edge into blank white. The world origin is parked mid-viewport rather than top-left, since snapped tiles routinely take negative coordinates, and **Fit** reframes the drawing; auto-compose requests a fit so what it just built is on screen.
- **Tile glyphs:** per-variation 2D paths (`src/lib/decode/variation2dPath.ts`), snap points (`snapPoints.ts` / `snapUtils.ts`).
- **Palette:** all 70 variations (freestyle) or only those present in the current assembly.
- **Export (`decodeSheetExport.ts`):** three formats, because DXF carries geometry and nothing else — no layers, no groups, no names.
  - **SVG** — the sheet as editable vectors. Each variation is inlined once as a `<symbol>` and each tile a `<use>` inside a named `<g id="tile-N-v-XX">`, so a drawing arrives as a selectable list rather than one welded blob. Every variation file defines its own `.cls-1`, `.cls-2`… so class names are rewritten per variation before combining — without that, the last definition silently repaints every earlier tile.
  - **PNG** — transparent cut-out off the live Konva stage at 3×, with the drafting chrome (grid, underlay, selection, interactive snap dots) hidden via a `sheet-chrome` node name; the stage is momentarily reset to 1:1 at the drawing's corner so the crop is predictable, then restored. Registered/called through the same registry shape the 3D viewport's capture uses.
  - **DXF** (`decodeDxfExport.ts`, via `dxf-writer`) — geometry only.
  - `decodeSvgExport.ts` is a *different, unwired* artifact: a 4-column labelled contact sheet of the assembly's cubes, not the notation drawing.
- History up to 5 undo states.
- **Corner preview (`DecodeAssemblyPreview.tsx`):** the assembly as a small live 3D thumbnail on the sheet, bottom-right (the stage's left is under the docked sidebar). Its own `<Canvas>` — resizing the real `Viewport3D` into a thumbnail drags its camera state, orbit controls and capture registration along and returns it framed for a 240px box. Clicking it opens the full 3D, which is why the stage toggle only mounts over the 3D (as "Sheet") and not over the sheet.
  - **It has no camera controls, by design: it mirrors the real viewport.** `ViewportControls` records `lastViewpoint` (direction + orbit target) into `useAppStore` whenever an orbit, pan, zoom or view-cube snap settles; the preview adopts that angle, the `orthographic` projection, and the section cut (`localClippingEnabled`, poché and all). Set the view up once in the viewport built for it, then draw against it. Distance is always the preview's own — a framing chosen on a full-bleed canvas puts the assembly outside a thumbnail's frustum. The ortho frustum is fitted locally rather than through `fitOrthoFrustum`, whose empty-scene floor would shrink a real assembly to a speck at this size.
  - `SectionCutControls` is mounted in the Decode sidebar too, so the sectioned view you draw against can be set up without leaving the mode.
- **Plan underlay:** a raster plan image can be imported as a locked, non-interactive underlay beneath the tiles, with an editable registration (offset / rotation / scale). Saved compositions persist thumbnail + fingerprint + registration only (same no-full-res policy as encode photos); after restore it renders from the thumbnail until re-imported.
- Tags assigned while editing the assembly show as an overlay on the canvas.

---

## Assembly editor (inline)

Full-featured cube editor, surfaced inline (Encode Merge seed editor; assembly substrate for Pataphysical).

- Variation picker (all 70), hover preview, click-to-place on a 3D grid.
- **Connection rules** (`rulesEnabled`) + **strict alignment** (`strictRulesEnabled`) — `src/lib/cube/connectionRules.ts`.
  - **Face cuts come from `src/lib/cube/faceCuts.ts`** (rewritten 2026-07-28).
    Each cutter's solid is tested against all six faces, so a sphere that opens
    three faces records three; and a face carries a **set** of cut types, since
    38.6% of variation faces carry both a sphere and a cylinder cut.
    `canConnect` is a set intersection — two faces join when they share a cut
    type; a shell is the empty set. This replaced a derivation that recorded one
    face per sphere and two per cylinder and so disagreed with the geometry on
    69 of 70 variations; the correction opened 37.3% of previously-refused
    adjacencies and closed none. History: `docs/GAPS_AND_HOLES.md` P0-6.
- Rotate (Space = Y / preview cycles valid rotations, R = X), delete, undo/redo (Ctrl/Cmd+Z, +Shift to redo), auto-fill, section cuts.
- **Section cut** (`useSectionCutStore`, `SectionCutControls.tsx`, shared by the assembly editor and Evolution): axis + position + a **Flip** that swaps which half of the assembly the plane keeps. `buildClippingPlanes()` (`src/hooks/useClippingPlanes.ts`) is the pure sign convention — Three discards `normal·p + constant < 0`, so flipping negates both and leaves the plane in place. Cut surfaces are painted in the accent (poché) via a back-face mesh, mounted only on cubes the plane genuinely slices. `flipped` is stamped into captured PNGs' provenance, since axis + position alone describe two different drawings.
- Tagging (`TaggingPanel.tsx`): word + intensity per cube.

**Key files:** `src/components/builder/*`, `src/store/useBuilderStore.ts`, `src/lib/cube/*` (constants `CUBE_SIZE = 42`, `GRID_STRIDE = 42.6`).

---

## Projects, Auth & Cloud Persistence (Firebase)

**This is a real, shipping feature** — opt-in via env vars, invisible when unconfigured.

- **Auth:** Firebase email/password (`src/contexts/AuthContext.tsx`, `src/hooks/useAuth.ts`, `src/components/auth/AuthControls.tsx` in the TopBar).
- **Data model:** Projects → Sites → Compositions (`src/lib/projects/types.ts`, CRUD in `src/lib/projects/firestore.ts`, UI in `src/components/projects/ProjectsPanel.tsx`).
- **Capture/restore:** `captureComposition()` serialises the full assembly + meme state, plus the Encode **reading + lexicon provenance** (model-original reading, edited flag, and a by-value lexicon snapshot so the record is self-describing even if the lexicon later changes); `restoreComposition()` loads it back (`src/lib/projects/composition.ts`). "Save to project" button is `SaveCompositionButton.tsx`.
- **Lexicons:** a separate top-level `lexicons` collection (L3, `lexiconFirestore.ts`), scoped per `ownerId` — the editable Encode vocabularies (see Encode Mode). The built-in `DEFAULT_LEXICON` is never stored.
- **Config:** `VITE_FIREBASE_*` env vars, pointing at the **same Firebase project as archthesis** (`adaptivememeticarchitect-2776f`). Firestore access rules in `firestore.rules` (covers `projects/**` and `lexicons/**`) — **reference copy only**: the deployed source of truth is `archthesis/firestore.rules`, which archthesis's deploy workflow ships (replacing the live ruleset) on every merge to its main. Rule edits here must be mirrored there.
- When `isFirebaseConfigured` is false, none of the auth/projects UI mounts and the app behaves exactly as the local-only version.

There is also a **local-only** save layer independent of Firebase: `src/lib/savedStates.ts` + `SavedStatesPanel.tsx` (up to 20 named slots in `localStorage`), a lightweight local alternative to Project compositions. (Remix no longer reads it directly — it seeds from the builder assembly, so you Load a save first.)

---

## Export / AR / Live-Link

- **JSON:** `src/lib/export/assemblyExport.ts` — positions, variation/cutter indices, rotations, per-cube operator history, grid metadata.
- **GLB:** `src/lib/export/glbExport.ts` — merged mesh of the assembly (used by the AR viewer and downloadable).
- **AR:** `src/components/ar/ARViewer.tsx` — Google `<model-viewer>` web component. Android → Scene Viewer (ARCore), iOS 15+ → Quick Look (ARKit), desktop → 3D orbit. Scale slider for real-world sizing.
- **Live-link:** `src/lib/export/liveLinkClient.ts` — HTTP client (default port 9876) that POSTs assembly state to the local Python bridge in `grasshopper/` (stdlib-only, no pip installs) for round-tripping into a running Grasshopper definition. Covered end-to-end by `e2e/grasshopper-livelink.spec.ts` (spawns the real bridge; skips if `python3` is unavailable).
- **Screenshot:** `src/components/tools/CaptureButton.tsx` (uses `preserveDrawingBuffer` on the canvas; shares via Web Share API on mobile, downloads on desktop). Every capture embeds a `cuboid-provenance` PNG metadata chunk — camera position/target, projection + zoom, section-plane params, timestamp, active composition path — and stamps the composition id into the filename.
- **Decode** has its own SVG/DXF export (above).

---

## Tech Stack (actual, from `package.json`)

- **Frontend:** React 18.3 + TypeScript 5.6, Vite 5.4, Tailwind 3.4 + shadcn / Radix UI primitives, **Zustand 5** for state (one store per mode).
- **3D:** Three.js 0.169 + React Three Fiber 8 + drei, `three-bvh-csg` for boolean geometry.
- **2D notation:** Konva 10 + react-konva, `dxf-writer` for DXF.
- **Map:** Leaflet 1.9 (+ external map-context iframe).
- **Auth/DB:** Firebase 12 (Auth + Firestore).
- **Misc:** jszip (bundled exports), model-viewer (AR, via CDN), PWA via `vite-plugin-pwa`.
- **API:** Vercel serverless functions in `api/`.
- **LLM gateway:** OpenRouter by default, Anthropic-native fallback.

---

## Repository Layout (high level)

```
api/                  Vercel serverless: encode-space, translate-meme,
                      fetch-memes, fetch-meme-by-id, geocode, fetch-context-pois
src/
  App.tsx             Shell + mode→panel router (desktop & mobile layouts)
  store/              Zustand stores (app, builder, encoding, lexicon, evolution,
                      meme, decode, projects, sectionCut, tag, toast)
  components/         map, encoding, evolution, meme, decode, builder, projects,
                      auth, export, ar, tools, viewport, layout, ui
  lib/                cube (CSG/rules/specs), evolution, operators, decode,
                      export, projects, siteContext, storage, encoding, capture
  prompts/            LLM artifacts (grammar + lexicon + v1/v2 translators)
  contexts/, hooks/, types/
grasshopper/          Python live-link bridge to Rhino/Grasshopper
public/models/        Pre-computed GLBs v-00..v-69
public/thumbnails/    Pre-rendered variation thumbnails
```

**Key specs / docs:** `PATAPHYSICAL_V2_SPEC.md` (translation pipeline + theory — read first), `EVOLUTION_SPEC.md`, `SERIALIZATION_GUIDE.md`, `docs/internal/HANDOFF.md` (build history).

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | Primary LLM gateway (default model `anthropic/claude-sonnet-4.6`). |
| `ANTHROPIC_API_KEY` | Legacy fallback, used only when OpenRouter key is absent. |
| `VITE_MAP_CONTEXT_URL` | URL of the embedded map-context iframe (defaults to the Railway deployment). |
| `VITE_FIREBASE_*` | Firebase Auth + Firestore config (Projects/Compositions). Blank → feature hidden. |
| `TRANSLATION_PASS_MODE` | Server-side default pass mode (`single` / `two_pass`); clients override per request. |

LLM keys are read only by the serverless functions, never exposed to the browser. See `.env.example` for the full list.

---

## Theoretical Framework

- **Schmidhuber (compression progress):** scaffolding for the fitness function — interestingness as the first derivative of compressibility. Not used literally; the shipping engine is the four-sub-score signature, not an LLM-as-compressor.
- **Pataphysics (Alfred Jarry):** the translation logic layer — science of imaginary solutions; grounds the meme→geometry pipeline.
- **Deleuze (virtual/real):** the meme layer captures the cultural-virtual dimension that physical site analysis misses — additive, not a replacement.
- **Krier (urban typologies):** referenced in the notation/operator framework for spatial grammar.

---

## Related Repositories

### archthesis (`github.com/iddonaim/archthesis`)
The participatory meme database and platform (hosts `memes.iddonaim.com`), Firebase-backed. Source of all memes flowing into Pataphysical mode, and **the same Firebase project** that Cuboid Studio's Projects/Auth layer now uses. Integration is the direction of travel.

### map-context (Railway-hosted)
The site-analysis app embedded as the Map tab iframe (`VITE_MAP_CONTEXT_URL`). Treat it as a peer project moving toward tighter merger.

### step2views (shelved)
A 2D notation system for cube assembly. **Shelved** — much of its intent now lives in the built-in Decode mode. Do not prioritize unless Iddo explicitly revives it.

---

## Developer Context

- **Iddo** is sole architect and developer. Not a coder — trusts the model on implementation decisions (see `CLAUDE.md` for collaboration style).
- Uses **Claude Code** for implementation. Write handoffs as plain-language instruction sets, investigate-first (report current state before changing anything).
- Always continue from the existing working version — never rewrite from scratch without asking.
- Verify implementation state against the repo before speccing changes; prior sessions may have partially implemented things.

---

## What's Actually Deferred / Not Yet Built

- **Evolution fitness axes 5 & 6** (CSG tree edit distance, topological genus) — specced, not implemented. Four sub-scores ship.
- **Pataphysical/Encode multi-model "Model lab"** — built (cross-model comparison UI, `model` param end-to-end), then **archived 2026-07-14** once the system standardized on Sonnet 4.6. Hidden behind the `MODEL_LAB_ENABLED` flag / `?modellab=1` URL override (`src/lib/modelLab.ts`); code kept in-tree, revivable when a new model warrants a comparison.
- **Pataphysical translation history per site** — comparing confidence vectors across memes on one site is still a spec item.
- **Map ↔ map-context full convergence** — currently an iframe + shared site-context handoff, not a single codebase.
- **step2views revival** — shelved.

---

## Audit corrections (2026-07-12)

A three-way audit (code inventory, spec reconciliation, map-context audit)
verified this file against the live code. The body above is accurate on all
load-bearing claims **except** the following, which this section overrides:

1. **Pataphysical `passMode` defaults to `'two_pass'`** (`useMemeStore.ts`).
   The body above has been corrected; this item is now redundant.
   ⚠ **This item's second sentence used to read "Evolve still always sends
   single-pass." That was false when it was written** — Evolution has called
   `translateMemeTwoPass` since PR #59 (2026-06-08), six weeks before the
   2026-07-12 audit that stamped it verified. Corrected 2026-07-28. The
   lesson is recorded in the SoT: a code-verified label carries its date and
   no more, and every outgoing use of a mechanism claim re-verifies against
   `origin/main` at answer time.
2. **`TRANSLATION_PASS_MODE` env var is dead** — nothing reads it
   (`resolvePassMode` in `api/translate-meme.ts` only honors the request's
   `pass_mode`). Remove from env tables when next edited.
3. **The Evolve feature vector is 14-D**, not 13-D (`FEATURE_DIM = 14`:
   5 one-hot cutter types incl. legacy `plane` + 3 proportions + 3 position +
   3 rotation).
4. **Encode uses the Anthropic-native API with `claude-sonnet-4-6` hardcoded** —
   only `translate-meme` goes through OpenRouter.
5. **Undocumented shipped features** (post-2026-07-03): the editable
   **translation lexicon** system ("Level A": `useTranslationLexiconStore`,
   Firestore `translationLexicons` collection — also covered by
   `firestore.rules` —, `TranslationLexiconEditor` shown in two-pass mode,
   localStorage `cuboid:activeTranslationLexiconId`); the **record-viewer
   drawer** (click any changed cube → `TranslationRecord`/`CubeChangeCard`
   with full pass-1/pass-2/confidence provenance); **onboarding modal + guided
   tour**; the **API activity indicator**.
6. **The Map → Encode automatic handoff was broken upstream — fixed
   2026-07-12**: the map-context launcher rendered its dashboard in a nested
   srcdoc iframe and never relayed the dashboard's `analysis-complete`
   postMessage to Cuboid Studio (only the manual SiteContextCurator/My-sites
   path worked). The launcher page now relays the message upward (fix in
   map-context `launcher.js`, verified with a nested-iframe Playwright test).
7. Known-stale internals, harmless but confusing: comments at the top of
   `useAppStore.ts` still describe Map/Decode as unmounted placeholders;
   `SERIALIZATION_GUIDE.md`'s connection-rules table still shows the old
   permissive shell row (shipped rules: shell blocks all connections).
8. **Tags are session-only** — `useTagStore` is not serialized by
   `captureComposition()`; only composition-level tags render on the Decode
   overlay.

---

## Review fixes (2026-07-22)

Six changes landed on `claude/external-review-findings-d7uqhh` from an
external code review; the body above has been updated where they apply.

1. **Merge-mode encode sees the seed.** The encode request now carries the
   already-placed assembly (variation/position/rotation/operator-count per
   cube); the server whitelist-revalidates it and fills the grammar's new
   "EXISTING ASSEMBLY (merge)" `{{seed_assembly_json}}` slot. All framing
   language lives in `spatial-encoding-grammar.md` (the curatorial artifact),
   never in TS. Offline-demo replay keys include a seed fingerprint so a
   standalone recording can't silently replay for a merge request.
2. **Dead Evolve fitness path removed.** `userScore`/`combinedFitness`/
   `selectionPressure` (and the "Algorithm vs. intuition" slider) were
   computed but never read anywhere — deleted. Concept retained in
   `EVOLUTION_SPEC.md` as future work (returns when selection spans
   generations). Old saved compositions still restore.
3. **Operator `targets`/`decay` documented as semantic provenance** on the
   types (never read by geometry — `applyLLMOperator` consumes only `cutter`;
   `magnitude` feeds the compressibility fingerprint). Prompt files untouched.
4. **Model + prompt-version provenance.** Both API handlers echo the model id
   and the prompt file's `# version` header; they persist on
   `EncodeData.model`/`.promptVersion` and on OperatorRecords from all three
   translation surfaces (Pataphysical, Model lab, Evolution — the last
   previously recorded no model at all). Bump the `# version` line whenever a
   prompt file is edited.
5. **Capture provenance.** Viewport PNGs embed a `cuboid-provenance` tEXt
   chunk (camera, section plane, composition path, timestamp); composition id
   in the filename.
6. **Decode plan underlay.** Raster plan as a locked underlay with persisted
   registration (offset/rotation/scale); saves keep thumbnail + fingerprint
   only, per the encode-photo size policy.
