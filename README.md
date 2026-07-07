# Cuboid Studio

A browser-based 3D modular logic builder that translates internet memes and inhabited spaces into cuboid assemblies through boolean cuts.

Cuboid Studio is the application layer of **Topological Translation**, a B.Arch thesis by Iddo Naim at the David Azrieli School of Architecture, Tel Aviv University. It is paired with [archmeme](https://github.com/iddonaim/archthesis), a participatory meme database that feeds the translation pipeline.

**Live:** https://cuboidstudio.vercel.app

---

## What it does

The studio is built around a single primitive — a 42 mm cube cut by combinations of four boolean cutters drawn from a fixed set of eight. This yields **70 cube variations** (C(8,4)) that snap together in a 3D grid. There are four primary modes — **Map → Encode → Evolution → Decode** — operating on this substrate in different ways:

| Mode | Status | What it does |
|------|--------|--------------|
| **Map** | Live | Site picker. Leaflet map plus an embedded site-analysis app; geocode an address, set a radius, fetch nearby POIs, and store the resulting site context for the other modes. |
| **Encode** | Live | Upload or capture 1–7 photos of an inhabited space. Claude's vision model emits a five-axis spatial reading (which the architect can lightly edit, with the model's original preserved) and proposes a cuboid assembly that mirrors its logic. The reading vocabulary is driven by an **editable lexicon** — author named lexicons, save them to a cloud library, and pick which one is active. The cube Builder is reachable inline here. |
| **Evolution** | Live | Two sub-modes: **Evolve** (compressibility-driven candidate generation) and **Pataphysical** (browse memes from the archmeme database; an LLM translates each meme into a spatial operator — inversion, drift, erosion, etc. — that re-cuts cubes). |
| **Decode** | Live | A 2D notation canvas. Place and rotate glyph tiles of the variations on a snap grid and export the composition as SVG or DXF. |

The **Builder** (place/rotate/delete cubes on a 3D grid, connection rules, strict alignment, auto-fill, section cuts, undo/redo) is not a separate tab — it surfaces inline inside Encode (seed editing) and underpins Evolution.

Assemblies can be exported as JSON, GLB, SVG, or DXF, viewed in AR, saved to a Firebase-backed project (optional), or round-tripped into Grasshopper. A small Python bridge in [`grasshopper/`](grasshopper/) supports live linking from the browser to a running Grasshopper definition.

---

## Thesis context

The translation pipeline treats memes as a participatory data layer that traditional site analysis misses, and the cube assembly as a **spatial heuristic** — not a building, but a configuration the architect reads, interprets, and translates into propositions through professional judgment.

The system prompts that mediate this translation are committed to the repo as first-class artifacts:

- [`src/prompts/pataphysical-translation-v2.md`](src/prompts/pataphysical-translation-v2.md) — two-pass meme → operator translator
- [`src/prompts/pataphysical-translation.md`](src/prompts/pataphysical-translation.md) — v1 single-pass translator (still used by Evolve)
- [`src/prompts/spatial-encoding-grammar.md`](src/prompts/spatial-encoding-grammar.md) — Encode vision prompt template, composed at runtime with the lexicon
- [`src/prompts/lexicon.default.ts`](src/prompts/lexicon.default.ts) — the built-in baseline spatial vocabulary injected into the Encode grammar (signed-in users can author and save their own editable lexicons on top of this default)
- [`src/prompts/spatial-encoding.md`](src/prompts/spatial-encoding.md) — earlier standalone Encode vision prompt
- [`PATAPHYSICAL_V2_SPEC.md`](PATAPHYSICAL_V2_SPEC.md) — full system spec and theoretical framing

These files are the thesis. The code around them is plumbing.

---

## Tech stack

- **Frontend:** React 18 + TypeScript, Vite 5, Tailwind + shadcn/ui + Radix primitives, Zustand for state
- **3D:** Three.js + React Three Fiber + drei, [`three-bvh-csg`](https://github.com/gkjohnson/three-bvh-csg) for boolean geometry
- **2D notation:** Konva + react-konva, `dxf-writer` for DXF export
- **Map:** Leaflet, plus an embedded external site-analysis app (`VITE_MAP_CONTEXT_URL`)
- **Auth & cloud projects (optional):** Firebase Auth + Firestore — invisible unless `VITE_FIREBASE_*` is configured
- **AR:** Google `<model-viewer>` (Scene Viewer / Quick Look)
- **API:** Vercel serverless functions in [`api/`](api/)
- **LLM gateway:** [OpenRouter](https://openrouter.ai) by default, with an Anthropic-native fallback
- **Meme database:** [archmeme](https://github.com/iddonaim/archthesis) on Firebase
- **Geocoding & POIs:** Nominatim + Overpass, proxied server-side
- **Hosting:** Vercel, installable as a PWA

---

## Run locally

**Prerequisites:** Node.js 18+.

```bash
git clone https://github.com/iddonaim/cuboid-studio.git
cd cuboid-studio
npm install
cp .env.example .env.local
# edit .env.local — set OPENROUTER_API_KEY (preferred) or ANTHROPIC_API_KEY
npm run dev
```

The app runs at http://localhost:3000.

### Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | Yes* | Primary LLM gateway. Get one at [openrouter.ai/keys](https://openrouter.ai/keys). |
| `ANTHROPIC_API_KEY` | Yes* | Legacy fallback. Used only when `OPENROUTER_API_KEY` is not set. |
| `VITE_MAP_CONTEXT_URL` | No | URL of the embedded Map-tab site-analysis app. Defaults to the hosted deployment. |
| `VITE_FIREBASE_*` | No | Firebase Auth + Firestore config for cloud-saved projects. Leave blank to hide the feature entirely. |

\* Set at least one LLM key. The LLM keys are never exposed to the browser — they are read only by the serverless functions in `api/`. See [`.env.example`](.env.example) for the full list including Firebase config and feature flags.

### Useful scripts

```bash
npm run dev        # vite dev server on :3000
npm run build      # type-check, then production build to ./dist
npm run typecheck  # tsc --noEmit only
npm run preview    # serve the built bundle locally
```

---

## Repository layout

```
api/                       Vercel serverless functions
  encode-space.ts            POST — photo → cuboid assembly (vision)
  translate-meme.ts          POST — meme → spatial operator (text/vision)
  fetch-memes.ts             GET  — list memes from archmeme via Firestore REST
  fetch-meme-by-id.ts        GET  — fetch one meme with cuboid-ready input
  geocode.ts                 GET  — Nominatim proxy for the Map site picker
  fetch-context-pois.ts      GET  — Overpass POI proxy for the Map site picker

src/
  App.tsx                  Top-level shell and mode→panel router
  components/              map, encoding, evolution, meme, decode, builder,
                           projects, auth, export, ar, tools, viewport, layout, ui
  store/                   Zustand stores per mode
  lib/                     CSG, connection rules, cutter specs, evolution,
                           operators, decode, export, projects, siteContext
  prompts/                 LLM system prompts (the thesis artifacts)
  contexts/, hooks/, types/

grasshopper/               Optional live-link bridge to Rhino/Grasshopper
public/models/             Pre-computed GLB files for the 70 cube variations
public/thumbnails/         Pre-rendered thumbnails for the variation catalog

EVOLUTION_SPEC.md          Evolution mode design spec (core engine shipped; see note inside)
PATAPHYSICAL_V2_SPEC.md    Translation pipeline spec — read this first
SERIALIZATION_GUIDE.md     Assembly JSON format
docs/internal/HANDOFF.md   Working notes from the build process
```

---

## Status and scope

This is an active thesis project, not a maintained product. Issues and pull requests are welcome but may sit for a while. If you fork it for your own work, please cite the thesis context in any public derivative.

The Grasshopper live-link is experimental and assumes a local Rhino + Grasshopper install. See [`grasshopper/README.md`](grasshopper/README.md) for setup.

---

## Related work

- [archmeme](https://github.com/iddonaim/archthesis) — the participatory meme database that supplies inputs to the Pataphysical mode

---

## License

Apache License 2.0. See [`LICENSE`](LICENSE) for the full text.
