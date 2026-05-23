# Cuboid Studio

A browser-based 3D modular logic builder that translates internet memes and inhabited spaces into cuboid assemblies through boolean cuts.

Cuboid Studio is the application layer of **Topological Translation**, a B.Arch thesis by Iddo Naim at the David Azrieli School of Architecture, Tel Aviv University. It is paired with [archmeme](https://github.com/iddonaim/archthesis), a participatory meme database that feeds the translation pipeline.

**Live:** https://cuboidstudio.vercel.app

---

## What it does

The studio is built around a single primitive — a 42 mm cube cut by combinations of four boolean cutters drawn from a fixed set of eight. This yields **70 cube variations** (C(8,4)) that snap together in a 3D grid. The four modes operate on this substrate in different ways:

| Mode | Status | What it does |
|------|--------|--------------|
| **Builder** | Complete | Place, rotate, and delete cubes on a 3D grid. Connection rules enforce face-to-face compatibility between cutters. Auto-fill, section cuts, undo/redo. |
| **Encode** | Complete | Upload or capture a photo of an inhabited space. Claude's vision model reads the space and proposes a cuboid assembly that mirrors its spatial logic. |
| **Pataphysical** | Complete | Browse memes from the archmeme database, optionally injected with site context. An LLM translates each meme into a spatial operator (inversion, drift, erosion, etc.) that re-cuts cubes in the assembly. |
| **Evolution** | Stubbed | Genetic algorithm driven by Schmidhuber-style compression progress. See [`EVOLUTION_SPEC.md`](EVOLUTION_SPEC.md). |

The output of any mode can be exported as JSON for round-tripping into Grasshopper for parametric reconstruction. A small Python bridge in [`grasshopper/`](grasshopper/) supports live linking from the browser to a running Grasshopper definition.

---

## Thesis context

The translation pipeline treats memes as a participatory data layer that traditional site analysis misses, and the cube assembly as a **spatial heuristic** — not a building, but a configuration the architect reads, interprets, and translates into propositions through professional judgment.

The system prompts that mediate this translation are committed to the repo as first-class artifacts:

- [`src/prompts/pataphysical-translation-v2.md`](src/prompts/pataphysical-translation-v2.md) — two-pass meme → operator translator
- [`src/prompts/pataphysical-translation.md`](src/prompts/pataphysical-translation.md) — v1 single-pass translator (still used by Evolution mode)
- [`src/prompts/spatial-encoding.md`](src/prompts/spatial-encoding.md) — vision prompt for the Encode mode
- [`PATAPHYSICAL_V2_SPEC.md`](PATAPHYSICAL_V2_SPEC.md) — full system spec and theoretical framing

These files are the thesis. The code around them is plumbing.

---

## Tech stack

- **Frontend:** React 18 + TypeScript, Vite 5, Tailwind + shadcn/ui, Zustand for state
- **3D:** Three.js + React Three Fiber + drei, [`three-bvh-csg`](https://github.com/gkjohnson/three-bvh-csg) for boolean geometry
- **API:** Vercel serverless functions in [`api/`](api/)
- **LLM gateway:** [OpenRouter](https://openrouter.ai) by default, with an Anthropic-native fallback
- **Meme database:** [archmeme](https://github.com/iddonaim/archthesis) on Firebase
- **Geocoding:** Nominatim, proxied server-side
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

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | Primary LLM gateway. Get one at [openrouter.ai/keys](https://openrouter.ai/keys). |
| `ANTHROPIC_API_KEY` | Legacy fallback. Used only when `OPENROUTER_API_KEY` is not set. |

Neither key needs to be present in the browser — they are only read by the serverless functions in `api/`. See [`.env.example`](.env.example) for the full list including feature flags.

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
  geocode.ts                 GET  — Nominatim proxy for the site context curator

src/
  App.tsx                  Top-level shell and mode router
  components/              Builder, encoding, evolution, meme, layout, viewport
  store/                   Zustand stores per mode
  lib/                     CSG, connection rules, cutter specs, export helpers
  prompts/                 LLM system prompts (the thesis artifacts)
  types/                   Shared TypeScript types

grasshopper/               Optional live-link bridge to Rhino/Grasshopper
public/models/             Pre-computed GLB files for the 70 cube variations
public/thumbnails/         Pre-rendered thumbnails for the variation catalog

EVOLUTION_SPEC.md          Evolution mode design spec (unimplemented)
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
