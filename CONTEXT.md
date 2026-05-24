# Cuboid Studio — Project Context

> This file is the always-on context for the Cuboid Studio Claude Project.
> Read it in full before responding to any message in this project.
> Last updated: 2026-05-23

---

## What Cuboid Studio Is

A web-based 3D modular architectural design system built as Iddo Naim's B.Arch thesis project at Tel Aviv University (David Azrieli School of Architecture). The core claim: architecture can reconnect with cultural conversation by using internet memes as compressed cultural observations that drive spatial organization through measurable, transparent processes.

The system translates memes into geometry. Not metaphorically — computationally.

**Live app:** https://cuboidstudio.vercel.app
**Repo:** https://github.com/iddonaim/cuboid-studio (public)
**Stack:** React 18 + TypeScript + Three.js + React Three Fiber + Vite + Vercel serverless functions

---

## The Geometric Vocabulary

**70 cube variations** derived from C(8,4): choose 4 active cutters from a fixed set of 8 master cutters (5 spheres + 3 cylinders), apply boolean subtraction to a base 42×42×42 mm cube. The 8 cutters are the complete and fixed vocabulary of the system — every variation is just a different combination of the same primitives.

Because the cutter set is finite and fixed, all relational operations (assembly, matching, mutation) are unambiguous: two cubes either share a cutter or they don't.

---

## Information Architecture

The app has two primary modes in the nav: **Encode** and **Evolution**. Builder and Pataphysical are not top-level — Builder is accessible from within Encode (as a seed editor), and Pataphysical is a sub-mode toggle within Evolution.

`AppMode = 'encoding' | 'evolution'` — the only values `setActiveMode` accepts at runtime. TopBar and MobileTabBar render **Encode** and **Evolution** from `VISIBLE_NAV_SLOTS` (`NAV_SLOTS` filtered to `mounted: true`).

The nav has four named slots, two currently hidden:
`['map' (hidden), 'encoding', 'evolution', 'decode' (hidden)]`

Map and Decode are structural placeholders — not rendered yet, but the nav accepts them without restructuring.

**Workflow spine:** Map → Encode → Evolution → Decode

| Slot | Status | What it does |
|------|--------|--------------|
| **Map** | Mounted — functional wireframe with OSM map, address search, radius selector, Overpass POI enrichment. Feeds into existing siteContext system. | Site picker: geocode, pin, radius, POI fetch → `localStorage` active site context. |
| **Encode** | Complete | Upload or capture photos of an inhabited space. Claude's vision model proposes a cuboid assembly mirroring the spatial logic. Supports multi-image (see below). |
| **Evolution** | Stubbed | Genetic algorithm layer. Sub-modes: Evolve (default) and Pataphysical. |
| **Decode** | Hidden — not yet built | 2D notational view driven by Evolution output. |

**Builder** is reachable inline from Encode via "build / edit seed". On Done it returns to Encode and re-snapshots the seed.

**Sandbox tab** (off-spine): Not yet implemented — pending isolated store instances for Builder and Pataphysical. No Sandbox tab, route, or separate store instances exist in the repo today.

---

## Encode Mode — Multi-image

Encode supports 1–7 images per encoding (1 primary + up to 6 supplementary).

**How it works:**
- Multi-photo checkbox above the Standalone / Merge / Remix state selector. Off by default.
- When on: multi-file upload with thumbnail strip, radio to designate primary (defaults to first; adding images does not change primary automatically).
- All images are resized client-side to max 1600px on the long edge before sending (JPEG at 0.88 quality, PNG stays PNG, no upscaling for smaller images). Keeps payloads well under Vercel's 4.5MB request body limit.
- Request shape: `{ images: [{ base64, mediaType, isPrimary }] }`. Legacy single-image shape `{ imageBase64, imageMediaType }` still accepted for backwards compatibility.
- The API passes all images to the vision model with the primary labeled explicitly in the prompt context.
- Synthesis logic is in `src/prompts/spatial-encoding.md` under MULTI-IMAGE SYNTHESIS.

**Key files:**
- `api/encode-space.ts` — serverless handler
- `src/prompts/spatial-encoding.md` — architect's curatorial artifact (edit this to change encoding behavior, no code changes needed)
- `src/lib/encoding/resizeImageToBase64.ts` — client-side resize utility
- `EncodingPanel.tsx` — upload UI

---

## Pataphysical Mode — v2 Architecture

The translation pipeline was substantially redesigned. Key decisions:

**Two-pass structure:**
- Pass 1 extracts cultural operators from the meme: rhetorical moves, tensions, functional affects, site resonance.
- Pass 2 translates those operators into geometry given the active site context.
- The separation ensures the cultural reading happens before geometry is committed.

**4D confidence vector** (replaces scalar score):
`rhetorical_clarity`, `site_resonance`, `affective_coherence`, `operational_specificity`

**New operator types:** consolidation, erosion, reinforcement (added to existing vocabulary)

**OpenRouter migration:** The API route was migrated from direct Anthropic SDK to OpenRouter (`https://openrouter.ai/api/v1/chat/completions`). Default model: `anthropic/claude-sonnet-4` via OpenRouter. This makes the prompt the artifact, not the model — you can swap models for multi-model comparison without touching the prompt.

**Pass mode:** Controlled per-request via the `pass_mode` field (`single` | `two_pass`). The env var `TRANSLATION_PASS_MODE` is documented in `.env.example` for reference but is not read by the API handler — pass mode is always set by the caller, not the environment.

**Backwards compatibility:** `translateMeme()` (used by Evolution mode) is preserved exactly — always calls `single` pass, returns flat `LLMOperatorResult`. New `translateMemeTwoPass()` is for Pataphysical v2 consumers only. Evolution mode never sees the two-pass shape.

**Site Context Curator:** Embedded modal in Pataphysical mode. Persists active site context in `localStorage` via `src/lib/storage/siteContext.ts` (`getActiveSiteContext()` / `setActiveSiteContext()`). Has tabs: Quantitative, Programmatic, Architect's Reading, Export. `translateMemeTwoPass()` auto-injects the active site context into requests.

**Geocoding:** Nominatim proxy via Vercel serverless `api/geocode.ts` (browser can't hit Nominatim directly due to CORS).

**Implementation status:** Backend route implemented: OpenRouter when `OPENROUTER_API_KEY` is set, otherwise Anthropic Messages API fallback; per-request `pass_mode` (`single` | `two_pass`), optional `model`, `site_context` injection into the v2 prompt (two_pass only), and two-pass response validation (JSON array with `pass: 1` / `pass: 2` or `{ pass1, pass2 }` object). Client helpers: `translateMeme()` always sends `pass_mode: 'single'`; `translateMemeTwoPass()` sends `pass_mode: 'two_pass'` plus site context. Frontend: complete — Pass 1 panel, confidence vector, reasoning text visible in Pataphysical tab (`OperatorResultPanel`, floating overlay while cutter shows on canvas). Multi-model selector UI still deferred.

---

## Evolution Mode — Fitness Function

Six-axis vector, equal weighting (pluralist rationale: more independent lenses, richer signature):

1. Geometric clustering
2. Spatial regularity
3. Operator sequence coherence
4. Meme coherence
5. CSG tree structural similarity (mean pairwise tree edit distance across assembly)
6. Topological complexity (voxelized genus counting)

Symmetry group order was explicitly rejected — the cubes are structurally asymmetric by construction. Spectral decomposition deferred as future work.

The vector is reported axis-by-axis in thesis outputs, never collapsed to a scalar. Schmidhuber's compression progress framework is the theoretical scaffolding, not the literal implementation; the mathematical signature matrix replaces the LLM-as-compressor assumption.

---

## Related Repositories

### archthesis (`github.com/iddonaim/archthesis`)
The meme database and platform. Hosts `memes.iddonaim.com`. Backend: Firestore. This is the source of all memes flowing into Cuboid Studio's Pataphysical mode. The two repos are not yet converged but integration is the direction of travel.

### step2views (shelved)
A 2D notation system for cube assembly. **Currently shelved** — do not prioritize or suggest work here unless Iddo explicitly brings it back.

Key concepts for reference:
- Assembly rule: connect blocks by matching identical cutters via external tangency (circle-circle or circle-rect perimeter contact, corners included). Rotation in configurable increments (default 90°).
- `cuboid_gen.py`: parametric catalog generator. Builds all 70 variations in OpenCascade, runs HLR from 6 orthographic directions, outputs `catalog.html`. Ghost representation mode: single HLR pass on cube + cutters union (not boolean diff), showing "transparent cube with cutters through it."
- `assembly.html`: drag-and-drop composer with snap-to-matching-cutter logic, SVG export.

### ContextMapper (new, active)
Being developed as a separate project. Will eventually integrate into Cuboid Studio as the **Map tab**. Treat it as a peer project moving toward merger, not a standalone tool.

---

## Theoretical Framework

- **Schmidhuber (compression progress):** Theoretical scaffolding for the fitness function. Interestingness as first derivative of compressibility. Not used literally — the LLM-as-compressor assumption was rejected in favor of a mathematical signature matrix.
- **Pataphysics (Alfred Jarry):** The translation logic layer. Science of imaginary solutions. Grounds the meme→geometry pipeline philosophically.
- **Deleuze (virtual/real):** Meme layer captures the cultural-virtual dimension that physical site analysis misses. The meme enrichment is additive, not a replacement for traditional analysis.
- **Krier (urban typologies):** Referenced in the notation/operator framework for spatial grammar.

---

## Developer Context

- **Iddo** is sole architect and developer. Not a coder — trusts the model on implementation decisions.
- Works in **Cursor** with Claude Sonnet as default, escalating to Opus when tasks stall.
- Uses **Claude Code** for implementation sessions. Always write handoffs as direct plain-language instruction sets — no code snippets in the handoff itself. Iddo cannot evaluate code independently.
- When handing off to Claude Code, always use investigate-first format: agent reports current state before changing anything.
- Always continue from the existing working version — never rewrite from scratch without asking.
- Verify current implementation state against the repo before speccing changes; prior Claude Code sessions may have partially implemented things.

---

## What's Deferred / Not Yet Built

- Evolution mode implementation (stubbed)
- Pataphysical v2 multi-model selector UI
- Map tab (pending ContextMapper integration)
- Decode tab (not yet built)
- step2views revival (shelved)
