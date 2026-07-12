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

### P2-2 · `magnitude` and `decay` are inert at runtime
Both are validated, stored and displayed; neither scales or fades the actual
cut, and decay has no generational mechanism anywhere. Same family as P2-1.
**Option:** wiring magnitude → cutter scale is a genuinely small change
(multiply proportions in `applyOperator.ts`) if you want one honest "the number
does something" demo; decay should stay future work.

### P2-3 · Fitness axes 5–6 not built
CSG-tree edit distance and topological genus remain aspirational; the shipping
engine is the 4-sub-score signature. Already stated honestly in CONTEXT/specs.
**Descope the claim; keep as future work.**

### P2-4 · The cross-model comparison was never run
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
