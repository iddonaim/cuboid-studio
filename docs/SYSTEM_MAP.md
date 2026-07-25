# Cuboid Studio — Full System Map

> Produced 2026-07-12 from a three-way audit: (1) low-level code inventory of this
> repo, (2) reconciliation of every spec document against the build, (3) audit of
> the map-context repo. Companion documents: `GAPS_AND_HOLES.md` (what's broken,
> missing, or drifted — ranked) and `BOOK_AND_PRESENTATION_GUIDE.md` (how to
> present all of this). CONTEXT.md remains the quick orientation; this file is the
> deep reference. Where the two disagree, this file is newer.

---

## Layer 0 — The fixed vocabulary (pure system-level)

Everything in the app is built from a closed set that never changes at runtime:

- **8 master cutters** — 5 spheres + 3 cylinders (`src/lib/cube/specifications.ts`).
  Sphere radii are deliberate: 16.18034 (10×φ), 9.864601, 13 (prime), 17.085938
  (shared by two cutters). Choose any 4 → boolean-subtract from a 42 mm cube.
- **70 variations** = C(8,4), generated in lexicographic order, shipped as
  pre-computed GLB meshes (`public/models/v-00.glb … v-69.glb`) with pre-rendered
  thumbnails. Runtime CSG exists as fallback; shell geometry is NOT implemented at
  runtime (`csgUtils.ts` warns and falls back to solid — real shells only via
  Grasshopper export).
- **Grid**: `CUBE_SIZE = 42`, `CUBE_GAP = 0.6`, `GRID_STRIDE = 42.6`,
  `SHELL_THICKNESS = 1.6` (`src/lib/cube/constants.ts`). All hardcoded.
- **Connection rules** (`src/lib/cube/connectionRules.ts`): door faces (z=0) map
  to spheres, window faces to cylinders; sphere↔sphere and cylinder↔cylinder
  connect, mixed types don't, shell blocks everything. Strict alignment tolerance
  = 10% of cutter radius. 16 possible rotations per cube (4 Y × 4 X).
- **Fitness weights** (`src/lib/evolution/compressibility.ts`): geometric
  clustering 0.3, spatial regularity 0.3, operator sequence 0.2, meme coherence
  0.2. Feature vector is **14-D** (5 one-hot cutter type + 3 proportions +
  3 position + 3 rotation). Hardcoded.
- **Operator/edge token sets**: 9 operator ids, 6 edge-type ids — fixed because
  the API validator and downstream consumers depend on them. The *wording* around
  them is editable (see translation lexicon below); the tokens are not.

**Prompt artifacts** (`src/prompts/`) are system-level but file-editable — and
editing them is the intended way to change behavior:

| File | Role |
|---|---|
| `spatial-encoding-grammar.md` | Encode template with `{{slots}}` — the IF/THEN grammar (atmosphere→variation band, rhythm→assembly shape, light→mixing, emotion→density with melancholic override), multi-image synthesis rules ("do not average"), reading-before-geometry contract |
| `lexicon.default.ts` | `DEFAULT_LEXICON` — the words injected into the grammar slots |
| `spatial-encoding.md` | Pre-L1 standalone artifact, superseded, kept as history |
| `pataphysical-translation.md` | v1 single-pass: meme's *visual form* → geometry. Still the engine behind Evolve candidates |
| `pataphysical-translation-v2.md` | v2 two-pass skeleton with `{{slots}}`: Pass 1 cultural extraction, Pass 2 geometric translation. Explicitly repudiates v1's form-to-form rule (geometry from content+affect+site, not the image's composition) |
| `translationLexicon.default.ts` | `DEFAULT_TRANSLATION_LEXICON` — 10 rhetorical moves→operator mappings, 6 edge defs, 6 affect→geometry rules, decay rules, 4 confidence-axis definitions |

---

## The four modes

`AppMode = 'map' | 'encoding' | 'evolution' | 'decode'` — all mounted. Default
landing mode is **Encode** (`useAppStore.ts`), not Map. Workflow spine:
Map → Encode → Evolution → Decode.

### ① Map

| | |
|---|---|
| **Input** | Address (user), radius (user, inside the embedded app) |
| **Output** | map-context dashboard (2D layers + 3D atlas) rendered in an iframe; **active site context** written to `localStorage` — the payload that feeds Encode and Pataphysical |
| **Interaction** | Explore 2D/3D; "My sites" toggle (signed-in): Leaflet map of all saved sites, load compositions, set active site, assign locations to unlocated sites |

- The canvas is an iframe to the external map-context app
  (`VITE_MAP_CONTEXT_URL`, Railway). `MapContextCanvas.tsx` listens for a
  `{type:'analysis-complete', data}` postMessage **with origin enforcement**, and
  adapts the payload via `buildSiteContextAt`.
- ⚠️ **The automatic handoff is broken end-to-end** in the deployed nesting:
  map-context's dashboard posts to *its own* parent (the launcher picker page),
  which has no listener and no relay — the message never reaches Cuboid Studio.
  See GAPS_AND_HOLES §P0-1. The manual path (SiteContextCurator) works.
- `MapPanel.tsx` (the old built-in Leaflet picker) is orphaned — imported nowhere.
- Serverless support: `api/geocode.ts` (Nominatim proxy), `api/fetch-context-pois.ts`
  (Overpass, 7 categories from ~22 element types, 503 on upstream failure).

### ② Encode

| | |
|---|---|
| **Input** | 1–7 photos (1 primary anchors character, up to 6 supplementary) — user; mode standalone/merge/remix — user; active site context — auto (flattened to a one-line prompt prefix, not the full JSON); active lexicon — user |
| **Output** | Five-axis reading (atmosphere/light/emotion continuous + rhythm/placement categorical) → reasoning → proposed cuboid assembly |
| **Interaction** | Edit the reading (L2 — model original preserved + `readingEdited` flag); author/select lexicons (L3, Firestore, signed-in); merge mode opens the inline Builder seed editor; re-encode; save |

- API: `api/encode-space.ts` — **Anthropic-native only** (`claude-sonnet-4-6`
  hardcoded; does NOT go through OpenRouter). Reading is sanitised but never
  fatal; `cubes` is the only hard requirement. One JSON-reparse retry.
- **Merge mode sends the seed assembly** (2026-07-22): a compact summary of the
  already-placed cubes ({variationId, position, rotation, operatorCount}) rides
  on the request; the server re-serialises it from whitelisted fields into the
  grammar's `{{seed_assembly_json}}` slot ("EXISTING ASSEMBLY (merge)" section),
  so the model composes against what exists instead of proposing cubes blind.
  Standalone/remix send nothing (slot fills `[]`). Client-side collision-drop
  remains as a safety net.
- The reading's pole labels come from the lexicon captured at encode time, so
  editing vocabulary re-labels the axes.
- **Provenance** (2026-07-22): the server echoes `model` + `promptVersion` (the
  grammar file's `# version` header) and both persist on saved compositions
  (`EncodeData.model` / `.promptVersion`).
- Images are client-resized before upload; on restore only thumbnails come back
  (`imagesRestoredOnly` blocks re-encoding from a restored record).

### ③ Evolution — sub-mode A: Evolve

| | |
|---|---|
| **Input** | Current assembly — auto; meme pool from archthesis (limit 50, hardcoded) |
| **Output** | N candidates, each = one meme translated onto one target cube, ranked by compression progress (Δ of the 4-sub-score fitness before→after) |
| **Interaction** | Settings (collapsed section): population size 2–12 (default 6), target strategy least-compressed/adaptive/random, meme tag filter — all user; preview (amber highlight) → apply / undo; sparkline of the compressibility log. (The former "selection pressure" slider and blended `userScore`/`combinedFitness` were removed 2026-07-22 — they were computed but never read; see EVOLUTION_SPEC.md future work.) |

- Candidates are generated by parallel client-side calls to
  `translateMemeTwoPass()` (avoids the serverless timeout). "Adaptive" targeting
  is a 50/50 hybrid, not a learning strategy.

### ③ Evolution — sub-mode B: Pataphysical

| | |
|---|---|
| **Input** | Meme — archthesis browser OR free text (user); target cube from assembly (user); engagement 0–100 (user); pass mode single/two-pass — user, **defaults to two-pass**; site context — auto-injected in two-pass (full JSON); translation lexicon — user |
| **Output** | Pass 1: rhetorical moves, cultural tensions (internal/external), functional affects, site resonance, meme summary. Pass 2: operator (9 classes) + targets (6 edge types) + magnitude/decay + cutter with geometry reasoning + 4-axis confidence vector + note |
| **Interaction** | Tweak cutter parameters before apply (`CutterTweakPanel`); operator history per cube; click any changed cube → record drawer with full reasoning (`TranslationRecord`, `CubeChangeCard`); re-run; edit the translation lexicon (`TranslationLexiconEditor`, shown in two-pass mode) |

- API: `api/translate-meme.ts` — OpenRouter when key present (default
  `anthropic/claude-sonnet-4`), Anthropic-native fallback. Strong validation:
  input size caps, SSRF guard on meme image URLs, JSON-reparse retry **plus** a
  semantic retry that quotes the exact validation error back to the model.
- ⚠️ What apply actually does: **one boolean subtraction of the cutter from the
  target cube's mesh.** `applyOperator.ts` reads only `result.cutter` — targets
  and decay are semantic provenance (stored, displayed, exported, never
  behavioral); the operator class and magnitude additionally feed Evolve's
  compressibility fingerprint. None of them alter geometry. There is no
  relational graph. This is now documented on the types themselves
  (`src/lib/operators/types.ts`, 2026-07-22). See GAPS_AND_HOLES §P2-1 — still
  the biggest spec↔build divergence.
- **Provenance** (2026-07-22): two-pass responses echo `promptVersion` (the v2
  prompt file's `# version` header) alongside `model`; both land on
  OperatorRecords from the Pataphysical panel, the Model lab, AND
  Evolution-applied candidates (which previously recorded no model at all).

### ④ Decode

| | |
|---|---|
| **Input** | Current assembly — auto; composition tags from the Builder — auto (overlay); optional raster plan image as a locked underlay — user |
| **Output** | 2D notation composition (Konva canvas, per-variation tile glyphs, snap grid); SVG + DXF export |
| **Interaction** | Drag/tap-place, rotate 90°, snap; palette freestyle (all 70) vs assembly-only (default) — user; undo (5 steps); expand canvas; import/register/remove the plan underlay (offset, rotation, scale — numeric fields; underlay itself is non-interactive) |

- Only *composition-level* tags render on the overlay; per-cube tags don't.
  Neither kind is saved with compositions (GAPS §P0-4).
- **Plan underlay** (2026-07-22): saved compositions persist thumbnail (~240px)
  + FNV-1a fingerprint + registration transform in `DecodeData.underlay` —
  never full-res base64 (same policy as encode photos). After restore the
  underlay renders registered-but-blurry from the thumbnail until the plan
  file is re-imported.

---

## Builder (inline, not a tab)

Surfaces: Encode merge seed editor (`seedEditOpen` swaps the panel), and as the
substrate Pataphysical re-cuts. Full editor: variation picker (70), hover
preview, click-to-place, rotate (Space=Y, R=X), delete, undo/redo, auto-fill,
section cuts (`useSectionCutStore`), tagging (word + intensity, composition-level
and per-cube).

User parameters: `rulesEnabled` (default on), `strictRulesEnabled` (default
off), selected variation, preview rotation.

---

## Cross-mode data flows (the arrows)

1. **Active site context** — single owner `src/lib/storage/siteContext.ts`
   (localStorage `cuboid:activeSiteContext` + same-tab `cuboid:siteContextChanged`
   event). Written by: Map analysis-complete (currently broken upstream),
   SiteContextCurator (manual), My-sites "set as active". Read by: Encode
   (flattened summary), two-pass translate (full JSON). v1/Evolve single-pass does
   NOT send site context.
2. **Assembly** — single source of truth `useBuilderStore.placedCubes`. Encode
   writes into it (`loadIntoBuilder`: standalone replaces, merge/remix append,
   with grid-snap + collision drop). Pataphysical/Evolve store per-cube results in
   `useMemeStore` maps keyed by cube id (`cubeGeometryOverrides`,
   `cubeGeometryStacks`, `cubeOperators`, `cubeTranslations`).
3. **Lexicon** — active encode lexicon → grammar slots server-side → also
   captured by-value into the encode result, so reading labels stay faithful to
   the vocabulary that produced them.
4. **Tags** — Builder `useTagStore` → Decode overlay (composition tags only).
   Ephemeral: not serialized.
5. **Memes** — archthesis Firestore → `api/fetch-memes` / `fetch-meme-by-id`
   (log-scaled likes→engagement) → Evolve pool and Pataphysical browser.
6. **Save/restore** — `captureComposition()` serializes builder assembly, encode
   state + reading/lexicon/model/prompt-version provenance, full pataphysical
   record set, evolution log/config, decode tiles + plan-underlay reference,
   and a site-context snapshot. Geometry is NOT stored: restore replays each
   cube's operator stack against base variation geometry. Candidates are
   captured but reset on restore. Not captured: tags, section cuts,
   translation-lexicon provenance, `cutterVisible`.
7. **Viewport captures** (2026-07-22) — every CaptureButton PNG embeds a
   `cuboid-provenance` tEXt metadata chunk: camera position/target,
   projection + zoom, section-plane params, timestamp, and the active
   composition's Firestore path (composition id also lands in the filename).

---

## API surface (Vercel serverless, `api/`)

| Endpoint | Model / upstream | Notes |
|---|---|---|
| `POST /api/encode-space` | Anthropic-native `claude-sonnet-4-6` | 1–7 images; optional `seedAssembly` (merge mode, whitelist-revalidated, ≤300 cubes); reading soft-fails, cubes hard-fail; 1 reparse retry; echoes `model` + `promptVersion` |
| `POST /api/translate-meme` | OpenRouter `anthropic/claude-sonnet-4`, Anthropic fallback | single + two-pass; size caps, SSRF guard, semantic retry; echoes `promptVersion` on two-pass; `TRANSLATION_PASS_MODE` env is documented but **never read** (dead) |
| `GET /api/fetch-memes` | archthesis Firestore REST | public web API key hardcoded in source (public-read rules) |
| `GET /api/fetch-meme-by-id` | archthesis Firestore REST | likes→engagement log scaling |
| `GET /api/geocode` | Nominatim | UA set server-side |
| `GET /api/fetch-context-pois` | Overpass (kumi.systems) | 7 categories, ≤10 each, 503 on upstream failure |

Lexicons, projects and compositions go through the client Firebase SDK, not
serverless. Grasshopper live-link is direct HTTP from the browser to the local
Python bridge on port 9876 (plain HTTP since 2026-07-05; e2e-tested with the
real bridge).

---

## Persistence layers

1. **Firestore (signed-in)** — `projects/{id}/sites/{id}/compositions/{id}`, plus
   top-level `lexicons` and `translationLexicons` collections (both ownerId-scoped).
   Same Firebase project as archthesis; the deployed rules live in the archthesis
   repo — edits to `firestore.rules` here must be mirrored there.
2. **Local saved states** — 20 named slots (`cuboid-saved-states`), feed remix.
3. **localStorage keys** (note the three naming conventions):
   `cs-sidebar-width`, `cs-onboarding-seen`, `cs-section:<id>` (7 section ids),
   `cuboid:activeSiteContext`, `cuboid:activeLexiconId`,
   `cuboid:activeTranslationLexiconId`, `cuboid-saved-states`.

---

## External systems

### map-context (Railway, embedded in the Map tab)
Node/Express, no build step, no tests. Address → analysis pipeline
(`index.js runAnalysis`): geocode → GovMap/Tel-Aviv-GIS buildings+heights →
Tel Aviv trees → Overpass streets/transit/institutions → registration blocks →
elevation + CBS demographics + TABA statutory plans (parallel) → dashboard HTML
+ structured `data` payload. 3D atlas (`atlas.js`) with orbit/fly/walk cameras,
25 curated landmarks, search, tour, minimap, day/night, offline mock mode.

Integration contract today: `POST /analyze` returns clean JSON `{html, data}`
with CORS `*` (the best hook for direct integration); `POST /run` streams SSE
progress and injects the postMessage script; `/atlas?lat&lon&r&label` is
bounds-checked to Israel. Only TABA and the atlas are cached; everything else
refetches per run. Radius is hardcoded 400 m server-side (the client's chosen
lat/lon are ignored — the server re-geocodes the address string).

Known Tel-Aviv-only surfaces: trees, registration blocks, TABA cadastral
resolution, buildings fallback, CBS locality default (6900). Portable: OSM
streets/transit/institutions, elevation, atlas anywhere in Israel bounds.

### archthesis
The participatory meme database (memes.iddonaim.com) — source of the meme pool
and the shared Firebase project (auth + deployed Firestore rules).

### Grasshopper / Rhino
`grasshopper/` Python stdlib bridge; assembly state POSTs to port 9876 for
round-tripping into a live Grasshopper definition.

---

## Parameter ledger (the system-vs-user split, complete)

**User-changeable in the UI:**
photos + primary choice · encode mode · reading edits · lexicon (encode) ·
translation lexicon wording · meme text / archthesis pick · location tag ·
engagement 0–100 · pass mode (default two-pass) · target cube · cutter tweaks
before apply · population size 2–12 · selection pressure 0–1 · target strategy ·
meme tag filter · candidate user-scores · connection rules on/off · strict
alignment on/off · variation selection + rotation · tags (word + intensity) ·
decode palette mode · tile placement/rotation · AR scale · sidebar width ·
orthographic camera · section collapse states · active site context (via curator
or map) · map "My sites" view.

**System-level (code or file edit only):**
8 cutters / 70 variations / grid constants · connection-rule logic + 10%
tolerance · fitness weights + 14-D feature vector · operator + edge token sets ·
prompt templates (grammar, v1, v2 skeleton) · encode model id · translate
default model id · meme pool fetch limit (50) · undo depths (builder unbounded,
decode 5) · saved-state cap (20) · map-context analysis radius (400 m,
server-side) · atlas center/radius/landmarks (CONFIG block).

**Env vars (deploy-level):** `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`,
`VITE_MAP_CONTEXT_URL`, `VITE_FIREBASE_*`. (`TRANSLATION_PASS_MODE` is
documented but dead — nothing reads it.)

---

## Test coverage map

- **Solid (vitest, ~124 tests):** compressibility, connection rules,
  applyOperator, decode snapping, both lexicon stores, translation-lexicon
  prompt composition (snapshot-guarded), translate-meme validators.
- **Thin/absent:** encode-space API (no test file), composition capture/restore
  round-trip, builder store logic, encoding/meme/evolution store flows, exports
  (DXF/SVG/GLB), MapContextCanvas adapter, suncalc.
- **E2E (Playwright):** nav smoke, offline save/restore, real Grasshopper bridge
  round-trip. No LLM flow is e2e-tested (network-dependent by design).
- **map-context:** zero automated tests.
