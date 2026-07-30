# Gaps & Holes — ranked

> Produced 2026-07-12 alongside `SYSTEM_MAP.md`. Three buckets: **P0** things that
> are actually broken or misleading right now (cheap fixes, do before the
> presentation if possible), **P1** documentation drift (fixed or flagged as of
> this audit), **P2** thesis-level gaps — real divergences between the claimed
> system and the built one. For P2 the honest options are *fix*, *descope the
> claim*, or *present the gap itself as a finding*; a recommendation is given for
> each. **P3** is robustness debt that doesn't block the thesis.

---

## P0 — Broken right now (fix cheap)

### P0-1 · ~~The Map → Encode handoff never fires~~ — FIXED 2026-07-12
Fixed in map-context (`launcher.js`): the launcher page now relays
`analysis-complete` from its nested dashboard iframe up to the embedding app.
Verified with a Playwright test reproducing the production nesting. Original
finding kept below for the record.

### P0-1 (original finding) · The Map → Encode handoff never fires (map-context)
The dashboard's `analysis-complete` postMessage targets its own parent — the
map-context picker page — which renders the dashboard in a nested `srcdoc`
iframe and has **no listener and no relay** (`launcher.js:93` vs `:497-519`).
Cuboid Studio's listener (`MapContextCanvas.tsx`) sits one window level higher
and never receives it. The first arrow of the workflow spine is decorative in
the deployed app; site context only flows via the manual curator.
**Fix (~5 lines, in map-context):** add a `message` listener in the launcher
page that re-posts `analysis-complete` to `window.parent`, with the parent
origin locked instead of `"*"`. Verify live once.
**Priority: do before the presentation** — this is the demo's opening move.

### P0-2 · `TRANSLATION_PASS_MODE` env var is dead
Documented in `.env.example`, CONTEXT.md and HANDOFF as the server-side
default/rollback switch, but `resolvePassMode` (`api/translate-meme.ts:61-63`)
never reads it. Either wire it in (one line) or delete it from the docs.
No user-facing impact (the client always sends an explicit mode).

### P0-3 · TABA plan documents never render (map-context)
The pipeline downloads plan PDFs and stores them under
`plan.documents.takanon/tasrit/mmg` (`index.js:672-674`), but the dashboard
looks up `documents.main/K/M` — keys that are never set — so the links silently
vanish. Also: the launcher doesn't serve `output/`/`cache/`, so the paths
wouldn't resolve in hosted mode anyway; and `plan.polygon` is always null, so
the TABA map highlight is a synthetic circle, not real plan geometry.
**Fix:** align the keys (10 minutes) + serve the cache dir, or hide the
document affordance. Decide by whether TABA features in the presentation.

### P0-4 · Tags are lost on save
`useTagStore` (composition + per-cube tags) is not serialized by
`captureComposition()` — tags survive only within a session. Also only
composition-level tags render on the Decode overlay; per-cube tags render
nowhere. Either persist them (small, low-risk addition to the composition
schema) or don't show tagging as a durable feature.

### P0-5 · Bus routes silently dropped (map-context)
The Overpass query requests bus route relations but the parser only handles
nodes/ways, so `busLines` is always empty and the layer toggle never appears.
Fix the parser or remove the dead query.

### P0-6 · ~~The connection law reads a face model that is wrong for 69 of 70 variations~~ — FIXED 2026-07-28

Fixed in `src/lib/cube/faceCuts.ts`. The derivation now computes, per cutter,
every face its solid actually crosses, and a face carries a **set** of cut types
rather than one — because 38.6% of variation faces carry both a sphere and a
cylinder cut. `canConnect` became a set intersection, which is the
closed-vocabulary claim stated as an operation: two faces join when they share a
cut type, and a shell is the empty set that intersects nothing.

**The change is monotone: 5,479 of 14,700 verdicts (37.3%) went from refused to
open, and none went the other way.** That is structural rather than lucky — the
old model could only ever under-report cuts, so supplying the missing ones can
only make faces agree more often. Consequences: no assembly that was placeable
becomes unplaceable, no saved composition gains a violation it did not have, and
placement and auto-fill only gain options. Measure it with
`node scripts/connection-verdict-delta.mjs`.

Also renamed for honesty: `VARIATION_FACE_TYPES` → `VARIATION_FACE_CUTS`,
`getRotatedFaceCutType` → `getRotatedFaceCuts`, `getRotatedFaceCutter` →
`getRotatedFaceCutters` (plural — a face has several), and the dead
`FaceCutType` union is gone. Strict alignment now asks whether *any* matching
pair of cutters lines up, where before it tested one arbitrarily-chosen pair.

Original finding kept below for the record.

### P0-7 · ~~The spec and the shipped models disagree about which way is up~~ — FIXED 2026-07-30

Found while chasing a field report P0-6's fix did not cure: a green placement
preview directly on a face the viewer could see is a shell (v-33, twice).

The cutter constants in `specifications.ts` are authored in the Grasshopper
document's frame, where **Z is up**. The GLB models the app renders went
through the standard Rhino→glTF export conversion, which rotates everything
−90° about X so **Y is up**. Nothing ever converted the spec to match — so the
connection law, face cuts, strict alignment and the CSG fallback all reasoned
about a rotated twin of every cube on screen. A shell the viewer saw on top
was, to the law, a cut face on the depth side; the law's verdicts were
internally consistent and wrong about the visible world.

**Measured, not inferred**: `scripts/measure-glb-face-solidity.cjs` decodes all
70 shipped GLBs (the app's own Draco decoder) and reports per-face solidity.
38 of 70 models disagreed with the spec-frame prediction about which faces are
uncut, every disagreement fitting the one rotation. The hollow shell faces
pin the frame beyond argument: their fabrication rims measure **14.7%** solid,
exactly what the 1.6 wall thickness predicts, and they sit on Y faces where
the spec put them on Z. After conversion, all 37 spec-uncut faces across all
70 models land on a measured rim or full panel — zero contradictions
(`scripts/glb-face-solidity.json` holds the measurements;
`src/lib/cube/renderFrame.test.ts` locks witnesses in all six directions).

Fixed at one choke point: `MASTER_CUTTERS` is now expressed in the render
frame (`toRenderFrame` in `specifications.ts`), so everything downstream —
`faceCuts`, `canConnect`, strict alignment, CSG fallback geometry — agrees
with the models. Bonus fix included: the CSG fallback previously built
geometry in the unconverted frame, silently disagreeing with the GLBs it
stands in for.

**This change is NOT monotone, unlike P0-6's.** 201 of 420 face readings
(47.9%) change; 62 faces change shell status. Verdicts flip in both
directions wherever cubes meet vertically or in depth (lateral X contacts are
unaffected). Saved compositions will read differently — some contacts that
showed open close, and vice versa. That is the point: the previous readings
described a world nobody was looking at.

### P0-8 · Green preview when placing from below — field report, OPEN

Reported 2026-07-30, twice, after every fix below was pushed: approaching a
composition from underneath, the placement ghost can still show green where
the reporter expected a refusal. Parked deliberately — deadline pressure —
not because it is understood.

**What is already fixed and verified upstream of this report** (all on PR
#128): hover targeting reads the ray's entry into the cell box, not the hit
triangle's normal (212k-ray sweep, 0 wrong cells); the placement verdict memo
tracks every input; the verdict answers about the chosen rotation, not a
substituted one; an occupied hover cell refuses before the rules are asked;
and the cutter spec was converted into the shipped models' frame (P0-7), which
was the actual cause of the earlier green-on-shell sightings.

**Candidate explanations, in the order to check them:**

1. **Stale deployment.** The two post-fix sightings came minutes after the
   pushes; if the Vercel preview predates commit `a482b77` (the frame
   conversion), the main cause was still live in the tested build. First step
   of any follow-up: confirm the deployed commit, then reproduce.
2. **The verdict may be right.** After the frame fix, shells live mostly on
   top/bottom faces — but 12 faces across the 70 variations are 93% solid
   (a cutter nicks one corner) and read as closed to the eye while the law
   counts the nick as a real cut. Green there is the law being honest about
   a hole the viewer cannot see. Needs the specific cube id + rotation from
   a reproduction to confirm or rule out.
3. **Edge-tie in `getHoveredFaceFromRay`.** When the ray enters the cell box
   almost exactly along an edge, the dominant-component tie-break can pick
   the side face instead of the bottom, targeting a side cell that is empty →
   all rotations valid → green. Steep from-below angles make edge entries
   more likely. Testable in isolation with rays at grazing angles.
4. **Hollow-model raycast path.** The models are hollow with one open rim
   face; from below, a ray through the opening can hit interior walls or
   pass through entirely, changing which cube (if any) receives the hover.
   The targeting math is cell-based so a *received* hover is still resolved
   correctly, but a hover received by an unexpected cube targets that cube's
   neighbourhood.

**To make this actionable:** a reproduction with the composition saved, the
cube id + rotation hovered, and the deployed commit hash. Without those,
anything further is guesswork — which is what this entry exists to prevent.

### P0-6 (original finding) · The connection law reads a face model that is wrong for 69 of 70 variations

`computeFaceCutTypes` (`connectionRules.ts`) derives each face's cut type from
two helpers that **cannot express the geometry they claim to read**:

- `getSphereFace()` returns **a single `Face`** — the one whose plane the
  sphere's centre sits on. The master spheres are r 9.9–17.1 mm on a 42 mm cube
  and routinely breach two or three faces. `SPHERE_01` opens X_NEG 19.4%,
  Y_NEG 32.8% and Z_NEG 6.6%; only Y_NEG is recorded.
- `getCylinderFaces()` returns **only the two faces perpendicular to the axis**.
  All three cylinders are `length 51` through a 42 mm cube (confirmed in the
  Grasshopper definition — three sliders, all 51), so they pierce fully, and
  their radii breach side faces too. `CYLINDER_05` opens Z_NEG 50.0% and
  X_NEG 33.8% beyond its two Y faces; neither is recorded.

Structural, not numerical: a return type of `Face | null` cannot represent a
cutter that opens three faces. **6 of the 8 master cutters are under-reported.**

| Uncut ("shell") faces per variation | Real geometry | Code model |
|---|---|---|
| 0 | 35 / 70 | 0 |
| 1 | 33 / 70 | 0 |
| 2 | 2 / 70 | 42 / 70 |
| 3 | 0 | 26 / 70 |
| 4 | 0 | 2 / 70 |

**69 of 70 variations have at least one depth (Z) face genuinely cut. The code
says 0 of 70.** The two models disagree on 69 of 70 variations, and the missed
openings run 6.6%–50% of a face — real holes, not slivers.

**It does not depend on the transcribed cutter centres.** A cutter of radius `r`
centred on a 42 mm face avoids breaching a neighbouring face only if it stays
`r` clear of all four edges, leaving `(42-2r)²` of safe area: **5.3%** for 10φ,
28.1% for 3.14π, 14.5% for r=13, **3.5%** for r=17.086. For the two largest
cutters, 94.7% and 96.5% of all possible positions force a multi-face breach.
Multi-face cutting is what this cutter set *does* on a cube this size.

Reproduce: `node scripts/analyze-cutter-faces.mjs` and
`node scripts/analyze-cutter-face-area.mjs`.

**Consequences.** `canConnect` refuses connections the geometry permits. The
assembly editor's placement preview refusing every rotation at a cell was
largely this. The ConnectionReading panel's shell counts are inflated. The
closed-vocabulary claim survives in principle — the cutter set really is closed
and finite — but the implementation of "which faces agree" does not match the
geometry.

**Fix cost and risk (as assessed before the fix).** Correcting the derivation
changes every connection verdict in the app: interactive placement, auto-fill,
valid-rotation sets, the encode connection reading, and the reading of every
already-saved assembly. Scheduled *after* PR #127 merged so the geometry landed
as its own revertible diff. In the event the change proved monotone — see the
FIXED note above — so the risk was lower than feared.

**Verification still open:** analytic, from `specifications.ts`. The Grasshopper
file supplied (v515 Presentation) confirms cube 42, the three 51 mm extrusions
and the radii (Golden Ratio component ×10 → 10φ; 3.14π), but its sphere centres
are live graph output rather than stored literals and it is a different version
from whatever exported `public/models`. The shipped GLBs remain the untouched
ground truth for the per-variation counts.

*RESOLVED 2026-07-30 while fixing P0-7: the shipped GLBs were decoded and
measured directly (`scripts/measure-glb-face-solidity.cjs`). After the frame
conversion, the spec's uncut faces match the models 37/37 — the transcribed
cutter geometry is confirmed against the ground truth it was transcribed from.*

---

## P1 — Documentation drift (addressed by this audit)

Corrections recorded in the CONTEXT.md addendum (2026-07-12):

1. Pataphysical `passMode` default is **`'two_pass'`** (`useMemeStore.ts:161`),
   not `'single'` as CONTEXT said. (HANDOFF was right, CONTEXT was stale.)
2. Feature vector is **14-D**, not 13-D (`FEATURE_DIM=14`).
3. Encode uses **Anthropic-native `claude-sonnet-4-6`**, not OpenRouter — only
   translate-meme goes through OpenRouter.
4. The **translation-lexicon system** (Level A: store, Firestore collection
   `translationLexicons`, editor shown in two-pass mode, localStorage key) was
   entirely undocumented.
5. Record-viewer drawer (`TranslationRecord`, `CubeChangeCard`), onboarding
   modal + guided tour, and the API activity indicator were undocumented.
6. `firestore.rules` also covers `translationLexicons/**`.
7. Stale comments in `useAppStore.ts:3-26` still claim Map/Decode are unmounted
   placeholders — they aren't. Delete when next touching the file.
8. `SERIALIZATION_GUIDE.md` still shows the old permissive shell connection
   table (`shell↔sphere ✓`); shipped rules block shell from everything.

---

## P2 — Thesis-level gaps (fix, descope, or present as finding)

### P2-1 · The relational graph doesn't exist — operators are notation
**The single largest spec↔build divergence.** PATAPHYSICAL_V2_SPEC describes
cubes as a graph with 6 edge types whose weights the 9 operators mutate
(consolidation strengthens adjacencies, erosion decays weights, reinforcement is
rich-get-richer). In code there is no graph, no edge weights. Every apply is one
boolean subtraction of one cutter from one cube (`applyOperator.ts` reads only
`result.cutter`). Operator names and edge targets are stored, displayed, and
scored — never executed.
**Recommendation: present as a finding, don't fix before the deadline.** The
honest formulation is strong: *the operators are a notational system — the LLM
reasons through the full graph vocabulary, and that reasoning is preserved as
provenance, but the geometric execution is deliberately reduced to the cutter.*
Building real graph mechanics is the natural "future work" chapter. What you
must NOT do is present operator names as if they have distinct geometric
behavior.

### P2-2 · `magnitude` and `decay` do not shape geometry
Both are validated, stored and displayed; neither scales or fades the actual
cut, and decay has no generational mechanism anywhere. Same family as P2-1.

⚠ **"Inert" is too strong for `magnitude`, and the distinction is load-bearing.**
It feeds the compressibility fingerprint (`compressibility.ts:573`), so it does
affect which candidate Evolution ranks highest — the geometry ignores the meme's
intensity, but the system's *taste* does not. `decay` is the fully inert one.
Say "magnitude is geometrically inert but scored"; do not say both are inert.
*(Verified at origin/main 2026-07-28.)*
**Option:** wiring magnitude → cutter scale is a genuinely small change
(multiply proportions in `applyOperator.ts`) if you want one honest "the number
does something" demo; decay should stay future work.

### P2-3 · Fitness axes 5–6 not built
CSG-tree edit distance and topological genus remain aspirational; the shipping
engine is the 4-sub-score signature. Already stated honestly in CONTEXT/specs.
**Descope the claim; keep as future work.**

### P2-4 · ~~The cross-model comparison was never run~~ — BUILT 2026-07-12 · ARCHIVED 2026-07-14
The "Model lab" panels (Pataphysical → two-pass, and Encode) run one input
through several models side by side with confidence vectors, timings, and
per-model errors, and apply the chosen reading with full provenance. Decision
protocol: `docs/MODEL_STRATEGY.md`. **Archived 2026-07-14** once the system
standardized on Sonnet 4.6: hidden by default behind the `MODEL_LAB_ENABLED`
flag / `?modellab=1` URL override (`src/lib/modelLab.ts`), all code kept
in-tree so it can be revived when a new model warrants a fresh run. Original
finding kept below for the record.

### P2-4 (original finding) · The cross-model comparison was never run
The `model` param exists end-to-end but there is no selector UI, so the
thesis-flavored experiment ("same meme, same prompt, different models — compare
confidence vectors") has never been exercised. **This is the cheapest remaining
high-value build item** (a dropdown + N calls + a comparison table) and it would
generate genuinely novel material for the book. If any building happens before
the deadline, consider this first.

### P2-5 · Translation history per site
Comparing confidence vectors across memes on one site is specced, not built.
Partial substitute exists: the operator history list + record drawer per cube.
**Descope or hand-assemble the comparison for the book from saved compositions.**

### P2-6 · Theory-to-code honesty ladder
For the book's own integrity (details in BOOK_AND_PRESENTATION_GUIDE):
Schmidhuber → real code, deliberately re-interpreted (static scorer, not a
learning compressor). Confidence vector → real, typed, validated artifact — but
model-generated, not mechanistic; the cited paper is inspiration, not
dependency. Jarry → real design principle, lives entirely in the prompts.
Deleuze → framing of the two-input architecture, no code trace. Krier → citation
only, zero trace; **either write the Decode/notation connection for real or cut
the citation.**

### P2-7 · "Adaptive" target strategy is a 50/50 hybrid
Not the learning strategy the spec describes. Rename it in the UI or descope.

---

## P3 — Robustness debt (post-thesis)

**map-context** (none of these block a Tel-Aviv-sited thesis, all block
generalization):
- Fatal-vs-graceful asymmetry: geocode, buildings, **trees**, and streets abort
  the whole analysis on failure (trees will throw outside Tel Aviv), while
  elevation/CBS/TABA degrade silently. Wrap the fatal four.
- No caching for the heavy layers — every run refetches everything (CBS boundary
  file can be ~200 MB); only TABA and the atlas cache.
- Client-picked lat/lon are discarded; the server re-geocodes the address string
  (a user selecting a specific suggestion can get a different point). Analysis
  radius is hardcoded 400 m server-side.
- Open, unauthenticated endpoints with CORS `*` — fine for a demo, not for a
  shared deployment (rate-limit or token-gate before publicizing).
- Layer discovery by Hebrew keyword-matching against Israeli GIS catalogs —
  breaks on any upstream rename, with no alert.
- Leaflet/three.js from unpkg CDN at runtime (single point of failure); the
  dashboard's five placeholder tabs advertise features that don't exist.
- `config.json` contains a real residential address — swap for a landmark.

**cuboid-studio:**
- No tests: encode-space API, composition round-trip, builder/encoding/meme/
  evolution store flows, exports, the postMessage adapter. The composition
  round-trip test is the highest-value single addition (it guards the thesis
  archive itself).
- archthesis public API key hardcoded in `api/fetch-memes.ts` (public-read
  rules make this acceptable, but move to env for hygiene).
- Three localStorage naming conventions (`cs-`, `cuboid:`, `cuboid-`); builder
  undo history unbounded.
- Firestore rules deploy from the archthesis repo — an edit here that isn't
  mirrored there silently does nothing (process risk, documented in CONTEXT).

---

## If you only do three things before the presentation

1. ~~**Fix P0-1** (map handoff relay)~~ — done 2026-07-12.
2. **Decide the P2-1 story** — one honest paragraph/slide: operators as
   notation + provenance, geometry as cutter. This defuses the sharpest
   possible jury question.
3. **Consider P2-4** (model selector) only if there's real time left — it's the
   one buildable item that adds new intellectual material rather than polish.
