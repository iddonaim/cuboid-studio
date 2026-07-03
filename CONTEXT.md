# Cuboid Studio — Project Context

> This file is the always-on context for the Cuboid Studio Claude Project.
> Read it in full before responding to any message in this project.
> Last updated: 2026-07-03
>
> This is a factual map of what is **actually in the repo and usable today**,
> reconciled against the live code (not aspirational spec). Where a feature is
> only specced and not built, it says so explicitly.

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
| **Encode** | Live | Upload/capture 1–7 photos of an inhabited space. Claude's vision model emits a five-axis spatial reading and proposes a cuboid assembly. Builder is reachable inline here (Merge mode). |
| **Evolution** | Live | Two sub-modes toggled in-panel: **Evolve** (compressibility-driven candidate generation) and **Pataphysical** (meme → operator translation). |
| **Decode** | Live | 2D notation canvas (Konva). Drag/place/rotate tile glyphs of variations, snap-to-grid, export as SVG or DXF. |

**Builder is not a top-level tab.** It surfaces inline:
- Inside **Encode** when Merge mode opens the seed editor (`seedEditOpen` → BuilderSidebar replaces the EncodingPanel).
- The built assembly is the substrate that **Pataphysical** re-cuts (you select a target cube from it).

**Pataphysical is a sub-mode of Evolution**, not a top-level tab. `EvolutionSubMode = 'evolve' | 'pataphysical'`, toggled by the sub-mode switch in the Evolution panel.

---

## Map Mode

- **Embedded "map-context" app** (`src/components/map/MapContextCanvas.tsx`): an iframe to an external service at `VITE_MAP_CONTEXT_URL` (defaults to the Railway deployment). When Map is active, this canvas replaces the 3D viewport. On analysis-complete it writes the site context and surfaces a toast offering to jump to Encode.
- **"My sites" layer** (`src/components/map/SitesMapView.tsx` + `MapViewToggle.tsx`, signed-in only): an Analysis / My sites toggle (top-right) swaps the iframe for a full-bleed Leaflet map plotting every saved Site across all Projects at the coordinates in its stored site context (`src/lib/projects/sitePins.ts`). Marker click → card with the site's compositions (loadable, inline confirm — loading replaces current work) + "Set as active site context". Sites without coordinates surface in a "sites without location" panel from which a location can be assigned (map click or address search; written via `updateSite`, merged over the site's own stored context via `buildSiteContextAt`).
- **`src/components/map/MapPanel.tsx`** (Leaflet site picker: click-to-pin, address search, radius slider, POI fetch) is currently **not mounted anywhere** — orphaned since the map-context iframe took over the Map canvas. Kept in-tree; its `buildSiteContextFromMap` path is still the model for manual pinning.
- **Geocoding:** `api/geocode.ts` — Nominatim proxy (browser can't hit Nominatim directly due to CORS / User-Agent).
- **POIs:** `api/fetch-context-pois.ts` — Overpass query, categorizes ~22 element types (transit, education, healthcare, civic, green space, markets, major roads).
- **Persistence:** `src/lib/storage/siteContext.ts` (`getActiveSiteContext()` / `setActiveSiteContext()`), built via `src/lib/siteContext/mapSiteContext.ts`. The site context (location + quantitative + programmatic + architect's reading) is injected into both Encode and Pataphysical requests.

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
- **Three modes:** `standalone` (image only), `merge` (image + seed cubes from Builder — opens the inline seed editor), `remix` (image + a saved state).

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

**Pass mode:** per-request, set by the client. `passMode` defaults to `'single'` (`useMemeStore`); the user can toggle to `'two_pass'` in `MemeInputPanel`. `translateMeme()` always sends `single` (used by Evolve); `translateMemeTwoPass()` always sends `two_pass` and auto-injects active site context. The `TRANSLATION_PASS_MODE` env var is only the server-side default / rollback switch.

**Two-pass structure (v2):**
- Pass 1 — cultural extraction: rhetorical moves, cultural tensions, functional affects, site resonance, meme summary.
- Pass 2 — geometric translation: operator + targets + magnitude/decay + cutter (with `geometry_reasoning`) + a **4-axis confidence vector** (`rhetorical_clarity`, `site_resonance`, `affective_coherence`, `operational_specificity`) and a confidence note.

**Operators** (`src/lib/operators/types.ts`, applied in `applyOperator.ts`):
- v1 set (also used by Evolve): inversion, amplification, drift, reassignment, preservation, shuffle.
- v2 additions: consolidation, erosion, reinforcement.

**LLM gateway:** `api/translate-meme.ts` uses **OpenRouter** when `OPENROUTER_API_KEY` is set (default model `anthropic/claude-sonnet-4`), otherwise falls back to the Anthropic Messages API. The prompt is the artifact, not the model.

**Prompts:** `src/prompts/pataphysical-translation-v2.md` (two-pass), `src/prompts/pataphysical-translation.md` (v1). **Editing the prompt is how you change behavior; code rarely needs to change.**

**UI:** `MemeInputPanel`, `OperatorResultPanel`, `CutterTweakPanel` (tweak parameters before apply), `OperatorHistoryList`, `ArchthesisBrowser` (browse memes from archthesis), `SiteContextCurator` (set/clear active site context).

---

## Decode Mode

A 2D notational view of the assembly — **implemented**, not a placeholder.

- **Canvas:** Konva / react-konva (`src/components/decode/DecodeCanvas.tsx`). Drag-place tiles (desktop) or tap-to-place (mobile), rotate in 90° steps, snap-to-grid.
- **Tile glyphs:** per-variation 2D paths (`src/lib/decode/variation2dPath.ts`), snap points (`snapPoints.ts` / `snapUtils.ts`).
- **Palette:** all 70 variations (freestyle) or only those present in the current assembly.
- **Export:** SVG (`decodeSvgExport.ts`) and DXF (`decodeDxfExport.ts`, via `dxf-writer`). History up to 5 undo states.
- Tags assigned in the Builder show as an overlay on the canvas.

---

## Builder (inline)

Full-featured cube editor, surfaced inline (Encode Merge seed editor; assembly substrate for Pataphysical).

- Variation picker (all 70), hover preview, click-to-place on a 3D grid.
- **Connection rules** (`rulesEnabled`) + **strict alignment** (`strictRulesEnabled`) — `src/lib/cube/connectionRules.ts`.
- Rotate (Space = Y / preview cycles valid rotations, R = X), delete, undo/redo (Ctrl/Cmd+Z, +Shift to redo), auto-fill, section cuts.
- Tagging (`TaggingPanel.tsx`): word + intensity per cube.

**Key files:** `src/components/builder/*`, `src/store/useBuilderStore.ts`, `src/lib/cube/*` (constants `CUBE_SIZE = 42`, `GRID_STRIDE = 42.6`).

---

## Projects, Auth & Cloud Persistence (Firebase)

**This is a real, shipping feature** — opt-in via env vars, invisible when unconfigured.

- **Auth:** Firebase email/password (`src/contexts/AuthContext.tsx`, `src/hooks/useAuth.ts`, `src/components/auth/AuthControls.tsx` in the TopBar).
- **Data model:** Projects → Sites → Compositions (`src/lib/projects/types.ts`, CRUD in `src/lib/projects/firestore.ts`, UI in `src/components/projects/ProjectsPanel.tsx`).
- **Capture/restore:** `captureComposition()` serialises the full Builder + meme state, plus the Encode **reading + lexicon provenance** (model-original reading, edited flag, and a by-value lexicon snapshot so the record is self-describing even if the lexicon later changes); `restoreComposition()` loads it back (`src/lib/projects/composition.ts`). "Save to project" button is `SaveCompositionButton.tsx`.
- **Lexicons:** a separate top-level `lexicons` collection (L3, `lexiconFirestore.ts`), scoped per `ownerId` — the editable Encode vocabularies (see Encode Mode). The built-in `DEFAULT_LEXICON` is never stored.
- **Config:** `VITE_FIREBASE_*` env vars, pointing at the **same Firebase project as archthesis** (`adaptivememeticarchitect-2776f`). Firestore access rules in `firestore.rules` (covers `projects/**` and `lexicons/**`, deployed additively alongside archthesis's own rules).
- When `isFirebaseConfigured` is false, none of the auth/projects UI mounts and the app behaves exactly as the local-only version.

There is also a **local-only** save layer independent of Firebase: `src/lib/savedStates.ts` + `SavedStatesPanel.tsx` (up to 20 named slots in `localStorage`), used for the Encode "remix" seed.

---

## Export / AR / Live-Link

- **JSON:** `src/lib/export/assemblyExport.ts` — positions, variation/cutter indices, rotations, per-cube operator history, grid metadata.
- **GLB:** `src/lib/export/glbExport.ts` — merged mesh of the assembly (used by the AR viewer and downloadable).
- **AR:** `src/components/ar/ARViewer.tsx` — Google `<model-viewer>` web component. Android → Scene Viewer (ARCore), iOS 15+ → Quick Look (ARKit), desktop → 3D orbit. Scale slider for real-world sizing.
- **Live-link:** `src/lib/export/liveLinkClient.ts` — WebSocket client (default port 9876) to a local Python bridge in `grasshopper/` for round-tripping into a running Grasshopper definition.
- **Screenshot:** `src/components/tools/CaptureButton.tsx` (uses `preserveDrawingBuffer` on the canvas; shares via Web Share API on mobile, downloads on desktop).
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
| `OPENROUTER_API_KEY` | Primary LLM gateway (default model `anthropic/claude-sonnet-4`). |
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
- **Pataphysical v2 multi-model selector UI** — `model` param exists server-side; no UI to pick models for cross-model comparison.
- **Pataphysical translation history per site** — comparing confidence vectors across memes on one site is still a spec item.
- **Map ↔ map-context full convergence** — currently an iframe + shared site-context handoff, not a single codebase.
- **step2views revival** — shelved.
