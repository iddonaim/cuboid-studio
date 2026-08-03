# Pataphysical Translation System — v2 Companion Document
# 
# This document provides the context needed to understand, implement,
# and extend the pataphysical translation prompt (pataphysical-translation-v2.md).
#
# Audience: Claude Code, collaborators, thesis reviewers, future Iddo.
# Date: 2026-04-06

> **Status note (2026-07):** this spec is a snapshot from April 2026. The app has
> moved on in a few places it describes — most notably, **Evolution mode is now
> implemented** (the "Stubbed / not yet implemented" entries below are out of date),
> and assembly editing / Pataphysical are no longer top-level tabs. The translation pipeline
> itself (§3 onward) is still accurate. For the current, reconciled state of the
> app, see [`CONTEXT.md`](CONTEXT.md).
>
> **Model ids in this document are April 2026 values and are not maintained.**
> Every `anthropic/claude-sonnet-4` below (§2 tech stack, §4.1a, §4.1c) was the
> default when this spec was written. The live default moved to
> `anthropic/claude-sonnet-4.6` on 2026-07-14; the authoritative value is
> `DEFAULT_MODEL` in `api/translate-meme.ts`, overridable per deployment via
> the `TRANSLATION_MODEL` env var, and the reasoning is in
> [`docs/MODEL_STRATEGY.md`](docs/MODEL_STRATEGY.md). Read the ids below as a
> record of what was specified in April, not as current configuration.

---

## 1. WHAT THIS IS

The pataphysical translation system is the core computational pipeline of **POETIKS / פה־אתיקה**, a B.Arch thesis project by Iddo Naim at Tel Aviv University (David Azrieli School of Architecture). It translates internet memes into spatial operations on a 3D cube manifold, mediated by site-specific context.

The system is embedded in **Cuboid Studio**, a Three.js web application hosted on Vercel. The translation prompt (`pataphysical-translation-v2.md`) is loaded as a system prompt by a Vercel serverless function and sent to a frontier LLM (default: Claude Sonnet) via OpenRouter.

### The thesis claim

Architecture can be produced through a translation pipeline where:
- Physical site data provides the spatial ground truth
- Internet memes provide a cultural/participatory data layer that traditional analysis misses
- An LLM mediates the translation between cultural content and spatial geometry
- The architect curates the translation logic (via this prompt) and interprets the output

The meme does not become a building. The meme becomes a **spatial heuristic** — a cube configuration that the architect reads, interprets, and translates into architectural propositions through professional judgment.

---

## 2. CUBOID STUDIO — WHAT EXISTS

### The cube system
- ~70 cube variations generated through boolean operations (CSG cutters applied to unit cubes)
- 8 master cutters, variations are C(8,4) boolean cuts
- Cubes are assembled in a 3D grid in the assembly editor
- Cubes are manipulated by meme-driven operators in the Pataphysical mode

### The four modes
| Mode | Status | Function |
|------|--------|----------|
| Assembly editor | Complete | Place, rotate, delete cubes on 3D grid. Connection rules, auto-fill, section cuts, undo/redo |
| Pataphysical | Complete | Browse memes, translate via Claude into boolean cuts on cubes. Sliders, cutter visualization, revert |
| Encoding | Built | Upload/capture photo of a space → Claude translates to cuboid assembly |
| Evolution | Complete | Single-lineage guided search driven by compression progress, architect in the loop. **Not** a genetic algorithm — no population, crossover, mutation or inheritance |

### The relational graph
Cubes in an assembly are connected by a relational graph with the following edge types:
- **adjacency**: physical proximity between cubes
- **access**: circulation/movement paths between cubes
- **visibility**: sight lines between cubes
- **conflict**: programmatic or spatial tension between cubes
- **overlap**: shared territory or program between cubes
- **threshold**: transitional zones between cubes

The pataphysical translation operators act on this graph by modifying edge weights and targets.

### Tech stack
- Frontend: React, Three.js, TypeScript
- Hosting: Vercel
- API: Vercel serverless functions
- LLM gateway: OpenRouter (default model: `anthropic/claude-sonnet-4`)
- Geocoding: Nominatim via Vercel serverless proxy (see §4.5)
- Meme database: memes.iddonaim.com (Firebase/React)

---

## 3. THE TRANSLATION PIPELINE — v2

### Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐
│  Site Context    │     │  Meme Input      │     │  System Prompt          │
│  Curator (webapp)│     │  (from meme DB)  │     │  (pataphysical-         │
│                  │     │                  │     │   translation-v2.md)    │
│  Outputs JSON    │     │  description     │     │                         │
│  per site        │     │  image URL       │     │  Loaded fresh per       │
│                  │     │  location tag    │     │  request by API route   │
│                  │     │  engagement 0-100│     │                         │
└────────┬────────┘     └────────┬────────┘     └────────────┬────────────┘
         │                       │                            │
         └───────────┬───────────┘                            │
                     │                                        │
                     ▼                                        │
         ┌───────────────────────┐                            │
         │  API Route            │◄───────────────────────────┘
         │  api/translate-meme.ts│
         │                       │
         │  1. Load prompt file   │
         │  2. Inject {site_ctx} │
         │  3. Build user message│
         │     with meme data    │
         │  4. Call Claude API   │
         │  5. Parse JSON array  │
         │  6. Return Pass 1 + 2│
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Frontend             │
         │                       │
         │  Displays Pass 1      │
         │  (cultural operators) │
         │                       │
         │  Applies Pass 2       │
         │  (geometric params)   │
         │  to cube manifold     │
         │                       │
         │  Displays confidence  │
         │  vector [rc,sr,ac,os] │
         └───────────────────────┘
```

### What changed from v1

| Aspect | v1 | v2 |
|--------|----|----|
| Passes | Single pass | Two visible passes |
| Site context | None | Injected JSON from Site Context Curator |
| Output format | Single JSON object | JSON array of 2 objects (Pass 1, Pass 2) |
| Cutter logic | Visual form of meme → cutter shape | Cultural content + affect + site → cutter shape |
| Confidence | None | 4D vector: rhetorical_clarity, site_resonance, affective_coherence, operational_specificity |
| Operators | 6 types | 9 types (added consolidation, erosion, reinforcement) |
| Rhetorical moves | 6 types | 10 types (added satire, solidarity, mourning, celebration) |
| Reasoning | 1 field | Multiple reasoning fields (target_reasoning, geometry_reasoning, confidence_note, reasoning) |

---

## 4. IMPLEMENTATION SPEC — CHANGES NEEDED

### 4.1 API Route (`api/translate-meme.ts`)

**Current behavior:**
1. Loads `src/prompts/pataphysical-translation.md`
2. Accepts `memeDescription`, `locationTag`, `engagementLevel`, `memeImageUrl`
3. Sends single system prompt + user message to Claude via Anthropic SDK
4. Parses single JSON object response
5. Returns operator params

**Required changes:**

a) **Migrate from Anthropic SDK to OpenRouter:**

Rationale: The thesis argument positions the *prompt* as the curatorial artifact and the *model* as a swappable engine. This must be demonstrable, not just claimed. OpenRouter enables (i) provider-independence for archival and thesis defense purposes, (ii) running the same prompt through multiple models to show that the curatorial artifact produces structurally consistent translations across engines, and (iii) removing lock-in to any single API provider.

Implementation details:
- OpenRouter is OpenAI-API-compatible. Use direct `fetch` or the OpenAI SDK pointed at `https://openrouter.ai/api/v1`.
- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Auth: `Authorization: Bearer ${OPENROUTER_API_KEY}` header
- Required headers for attribution: `HTTP-Referer: https://cuboid-studio.vercel.app` (or whatever the deployment URL is) and `X-Title: Cuboid Studio`
- Store `OPENROUTER_API_KEY` in Vercel environment variables (replacing `ANTHROPIC_API_KEY`)
- Default model: `anthropic/claude-sonnet-4` — the OpenRouter model ID format. Quality baseline remains identical to the current Anthropic SDK call.
- Request body structure differs from Anthropic's — it uses OpenAI's `messages` array format with `system` as the first message (role: "system"), not a separate `system` field
- Vision support: for image inputs, use OpenAI's content array format: `{ type: "image_url", image_url: { url: memeImageUrl } }` instead of Anthropic's base64 format

b) **Accept site context:**
- New parameter: `siteContext` (JSON object or string)
- Before sending to the LLM, replace `{site_context}` in the loaded prompt with the stringified site context JSON
- Site context should be stored per-site (filesystem, database, or passed per-request from frontend)

c) **Accept model parameter (new):**
- New optional parameter: `model` (string)
- Defaults to `anthropic/claude-sonnet-4`
- When provided, passes through to OpenRouter's `model` field
- Valid alternatives to expose in UI for comparison experiments:
  - `anthropic/claude-opus-4` — higher quality, slower, more expensive
  - `anthropic/claude-sonnet-4` — default baseline
  - `anthropic/claude-haiku-4` — faster, cheaper, for iteration
  - `openai/gpt-4o` — cross-provider comparison
  - `google/gemini-2.0-flash` — cross-provider comparison
  - `meta-llama/llama-3.1-405b-instruct` — open-source comparison
- Not all models support vision. If `memeImageUrl` is provided and the selected model doesn't support vision, fall back to text-only and include a warning in the response.

d) **Update prompt file path:**
- Point to `pataphysical-translation-v2.md` (or replace v1 file)

e) **Parse two-pass output:**
- Response is now a JSON array: `[{pass: 1, ...}, {pass: 2, ...}]`
- Validate both objects
- Return both to frontend along with the model name used (for display)

f) **Update retry logic:**
- Current retry on parse failure should handle the array format
- Consider: if Pass 1 parses but Pass 2 doesn't, retry only Pass 2 with Pass 1 output provided as context
- OpenRouter error format differs from Anthropic's — handle both rate limits and provider-specific errors

**Important non-changes:**
- The system prompt (`pataphysical-translation-v2.md`) does not change. It is provider-agnostic.
- The two-pass output format does not change.
- The site context injection logic does not change.
- The prompt-as-curatorial-artifact thesis claim is strengthened by this migration, not weakened.

### 4.2 Frontend — Pataphysical Mode

**New UI elements needed:**

a) **Site context selector:**
- Dropdown or panel showing available site contexts (loaded from stored JSON files)
- Active site context visible in the UI
- Ability to switch sites without reloading

b) **Pass 1 display:**
- Show cultural operator extraction *before* showing the geometric result
- Display: rhetorical moves (as tags), cultural tensions, functional affects, site resonance text, meme summary
- This is the visible intermediate — the user should see what the model extracted before seeing geometry

c) **Pass 2 display:**
- Existing cutter visualization and slider UI
- Add: target_reasoning and geometry_reasoning as readable text
- Add: confidence vector display

d) **Confidence vector visualization:**
- Four-axis display (radar chart, bar chart, or simple four-number readout)
- Axes: RC (rhetorical clarity), SR (site resonance), AC (affective coherence), OS (operational specificity)
- Each axis 0.0–1.0
- confidence_note displayed as text below

e) **Translation history:**
- Store past translations per site for comparison
- Enable viewing confidence vectors across multiple meme translations on the same site

### 4.3 Cube Manipulation Code

**New operator types to implement:**

| Operator | Behavior |
|----------|----------|
| consolidation | Strengthen existing clusters, increase adjacency weights between already-connected cubes |
| erosion | Reduce edge weights toward zero without removing edges entirely |
| reinforcement | Increase weight of existing strong connections (rich-get-richer) |

These are additions to existing operators (inversion, amplification, drift, reassignment, preservation, shuffle). The existing operator application logic should be extended, not rewritten.

### 4.4 Site Context Curator (standalone webapp)

**Current state:** three tabs (Quantitative, Programmatic, Save) — the Architect's Reading tab was retired 2026-07-28. Outputs JSON. Includes embedded SunCalc for automatic sun exposure and daylight computation when lat/lng are provided. Includes a GEOCODE button that currently calls Nominatim directly — this does not work reliably from browser due to CORS and User-Agent restrictions (see §4.5).

**Integration options (in order of independence):**
1. **Fully standalone:** Architect uses the webapp, downloads JSON, manually places it in the project directory. API route reads from file.
2. **Shared storage:** Webapp writes to a shared location (S3, Vercel KV, Firebase) that the API route reads from. Site context keyed by site name.
3. **Embedded:** Webapp becomes a panel within Cuboid Studio. Tightest integration, least independence.

Recommend option 2 for thesis scope — independent webapp, shared storage layer.

**Automation features status:**
- Geocoding: IMPLEMENTED in UI, BROKEN in browser due to Nominatim CORS. See §4.5 for the fix.
- Sun analysis: IMPLEMENTED client-side via embedded SunCalc. Works offline, no API key needed.
- Wind data: NOT IMPLEMENTED. Manual input. Could integrate Open-Meteo (free, CORS-friendly) for historical wind direction averages.
- Transit: NOT IMPLEMENTED. Manual input. Would need Google Places API or OSM Overpass API.
- Walkability: NOT IMPLEMENTED. Manual input. Walk Score API requires a key.

Automation is toggleable — auto-filled values appear with a distinct style and the architect can override any field. The architect's manual input always takes precedence.

### 4.5 Geocoding Proxy (`api/geocode.ts`)

**Problem:** The Site Context Curator's GEOCODE button calls Nominatim directly from the browser. This fails silently because (a) Nominatim requires a custom `User-Agent` header identifying the application, which browsers cannot set on fetch requests, and (b) CORS responses from `nominatim.openstreetmap.org` are inconsistent and the public instance sometimes blocks browser origins entirely.

**Solution:** Add a Vercel serverless function that proxies geocoding requests server-side, where the `User-Agent` header can be set properly and CORS is not a concern.

**Spec:**

File: `api/geocode.ts`

Behavior:
1. Accepts `GET /api/geocode?q=<address>` with URL-encoded address string
2. Calls Nominatim: `https://nominatim.openstreetmap.org/search?format=json&q=<address>&limit=1`
3. Sets request header: `User-Agent: CuboidStudio/1.0 (topological-translation-thesis; iddonaim@gmail.com)` or similar identifying string per [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
4. Respects rate limits: max 1 request per second. Add simple in-memory or KV-based rate limiting.
5. Returns the first result's `lat` and `lon` as JSON: `{ lat: string, lng: string, display_name: string }`
6. Returns 404 if no results, 429 if rate-limited, 500 on Nominatim error

Frontend change in Site Context Curator:
- Replace the direct `fetch("https://nominatim.openstreetmap.org/...")` call with `fetch("/api/geocode?q=" + encodeURIComponent(address))`
- Error handling should surface failures visibly to the architect, not swallow them silently as the current artifact does

Alternative if Vercel serverless is not viable: use a third-party geocoding service with a browser-friendly free tier (Geoapify, MapTiler, OpenCage). Requires an API key stored either in the frontend (user-provided) or in environment variables.

---

## 5. THE MEME INPUT FORMAT

The meme arrives at the API route with:

```json
{
  "memeDescription": "string — text description of the meme content, context, and meaning",
  "locationTag": "string — geographic reference if any (neighborhood, street, city)",
  "engagementLevel": number (0-100),
  "memeImageUrl": "string — optional URL to meme image for vision analysis"
}
```

This is unchanged from v1. The meme data comes from `memes.iddonaim.com` or is entered manually.

---

## 6. OUTPUT FORMAT — COMPLETE EXAMPLE

A successful translation returns:

```json
[
  {
    "pass": 1,
    "rhetorical_moves": ["irony", "juxtaposition"],
    "cultural_tensions": [
      {
        "description": "Long-term Eritrean community shops being replaced by upscale brunch spots marketed to Florentin residents",
        "friction_type": "both"
      }
    ],
    "functional_affects": ["indignation", "dark humor"],
    "site_resonance": "Directly maps to the observed displacement pattern on the site's southern edge where informal food vendors are being pushed out by permitted restaurants",
    "meme_summary": "Ironically juxtaposes 'authentic neighborhood character' marketing language with the displacement it causes"
  },
  {
    "pass": 2,
    "operator": "reassignment",
    "targets": ["adjacency", "threshold"],
    "target_reasoning": "The meme's juxtaposition of incompatible populations maps to adjacency (who is next to whom) and threshold (where transitions between communities occur). At this site, the threshold between the market zone and the new commercial strip is the active tension line.",
    "magnitude": 0.72,
    "decay": 0.15,
    "cutter": {
      "type": "plane",
      "proportions": [1.0, 0.05, 0.8],
      "position": [0.0, -0.3, 0.2],
      "rotation": [0, 15, 0],
      "geometry_reasoning": "A near-vertical plane bisecting the lower portion of the cube — registering the sharp boundary between the market zone (ground level, south) and the gentrifying zone (north). Slight rotation off the street grid axis reflects the informal, diagonal pedestrian paths that actually cross this boundary."
    },
    "confidence_vector": {
      "rhetorical_clarity": 0.9,
      "site_resonance": 0.85,
      "affective_coherence": 0.75,
      "operational_specificity": 0.6
    },
    "confidence_note": "Rhetorical moves and site connection are strong. Affective coherence is slightly split — indignation pushes toward aggressive bisection while dark humor suggests something less severe. Operational specificity is moderate because the juxtaposition could equally have targeted visibility (sight lines between zones) rather than adjacency.",
    "reasoning": "An ironic meme about displacement at a site where displacement is physically observable. The reassignment operator swaps adjacency and threshold targets to disrupt the assumed boundary between communities. The plane cutter creates a hard spatial division that mirrors the cultural division the meme surfaces, positioned at the contested ground-level interface."
  }
]
```

---

## 7. THEORETICAL FRAMEWORK — KEY REFERENCES

For anyone needing to understand *why* this system works the way it does:

- **Functional emotions in LLMs** (Sofroniew et al., 2026 — Anthropic): Establishes that LLMs build abstract, context-general representations that causally modulate output. The pataphysical translation system treats memes as analogous cultural operators that modulate spatial output through the same representational architecture. The confidence vector is modeled after the paper's emotion vector geometry.

- **Compression progress theory** (Schmidhuber): The fitness function for the Evolution mode (not yet implemented) uses compression progress as intrinsic reward — spatial configurations are valued for how much they advance the observer's compression of the meme↔space relationship, not for static beauty.

- **Pataphysics** (Jarry): The translation operates through pataphysical equivalence — consistent but non-rational correspondences. The system does not claim rational mappings between memes and geometry. It claims associative, rule-governed translations that are reproducible and auditable but not deducible from first principles.

- **The architect as curator**: The system prompt is the architect's primary design artifact. Editing the prompt changes the translation logic. The architect does not design space directly — they design the rules by which culture becomes geometry, then interpret the results through professional judgment.

- **Model as engine, prompt as artifact**: The migration to OpenRouter (§4.1) is not merely infrastructural. It enables a thesis-level experiment: run the same meme + same site + same prompt through multiple frontier models (Claude Sonnet, Claude Opus, GPT-4o, Gemini, Llama) and compare the resulting confidence vectors. The claim to test is that the curatorial artifact (the prompt + site context) produces structurally consistent translations across engines, with surface variations. If true, this demonstrates that the architect's work — not the model's — is doing the thesis labor. If false, it reveals that the system is more model-dependent than claimed, which is also a finding. Either outcome is defensible and interesting. This experiment is enabled by OpenRouter but does not require it to be implemented in v1 of the system.

---

## 8. KNOWN LIMITATIONS AND OPEN QUESTIONS

- **The notation problem**: How to read the output cubes as spatial propositions remains unresolved. The confidence vector is a step toward notation but does not fully solve it.

- **Meme corpus bootstrapping**: The system requires a participatory meme ecology at each site. How to seed this remains an open problem being addressed separately.

- **Evolution mode**: ⚠ **Superseded — this line was wrong twice.** It said the genetic algorithm was "specified but not implemented." Evolution *is* implemented, and it is **not a genetic algorithm**: there is no population, no crossover, no mutation and no inheritance. What ships is a **single-lineage guided search with a human in the loop** — sample memes × target cubes, translate each candidate in parallel, score by compression progress against the current baseline, rank, let the architect pick, apply, shift the baseline. Crossover was refused deliberately (single lineage keeps a human answerable for each step). Do not use GA vocabulary for this mode outside a dated archival exhibit. *(Corrected 2026-07-28 against origin/main.)*

- **LLM opacity**: Unlike Anthropic's interpretability research, we cannot see inside the model during translation. We can argue by analogy to the functional emotions paper that abstract representations are doing the work, but we cannot prove it. For a B.Arch thesis, demonstrating consistent and site-responsive output variation is sufficient.

- **Professional adequacy**: The output cubes are heuristic objects, not architecture. The system is not asked to produce buildings. It produces spatial provocations that a trained architect interprets. This is a feature, not a limitation — it preserves the architect's agency as the final translation layer.
