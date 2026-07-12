# Book & Presentation Guide — synthesizing Cuboid Studio

> Produced 2026-07-12 from the full-system audit (`SYSTEM_MAP.md`,
> `GAPS_AND_HOLES.md`). This is the "what do I actually say" document: the
> argument as it truly stands, what to claim and what not to, a chapter
> structure, a figure list, and a demo path. Written for Iddo to work from
> directly; any future Claude session should read all three docs together.

---

## 1. The argument as it actually stands

The defensible one-paragraph version:

> Architecture has lost its channel to live cultural conversation; memes are
> that conversation in compressed form. Cuboid Studio demonstrates that memes
> can drive spatial organization through a **measurable, transparent, editable**
> process: a fixed geometric vocabulary (8 cutters → 70 variations) so every
> relation is unambiguous; a two-pass LLM translation that first extracts a
> meme's cultural content and then commits it to geometry, with every step of
> reasoning preserved as provenance; a confidence vector that turns each
> translation's *strain* into legible notation; and a compression-progress
> fitness that operationalizes "interestingness" over the growing assembly.
> The architect stays in the loop at every layer — the vocabulary, the reading,
> the lexicon, the candidate choice — so the system is an instrument, not an
> oracle.

Three properties make this defensible rather than hand-wavy, and all three are
verified in code:

1. **Closed vocabulary → unambiguous relations.** Because the 8 cutters are
   fixed, connection, matching and mutation are exact set operations, not vibes.
2. **Provenance all the way down.** The model's original reading is never
   overwritten; edits are flagged; the lexicon that produced a reading is
   snapshotted by value; every cut stores its meme, both passes, the confidence
   vector and the model id. The archive is self-describing.
3. **The editable-vocabulary pattern (L3 / Level A).** The prompts are split
   into fixed grammar + editable lexicon, for both Encode and Translation. The
   architect edits *words*, the system guarantees *structure*. This is the
   project's most original interaction-design contribution and deserves its own
   chapter section.

## 2. What to claim / what not to claim

| Claim it | Because |
|---|---|
| "The meme's cultural content, not its image composition, determines geometry" | v2's explicit, documented repudiation of v1 — a real intellectual pivot with artifacts on both sides |
| "Interestingness = compression progress, operationalized" | `compressibility.ts` literally computes Δscore; honest re-interpretation is stated |
| "The confidence vector is a notation for reading strain — low scores are data, not failure" | Typed, validated, displayed, persisted; the framing is in the prompt itself |
| "The prompt is the artifact; behavior changes by editing language" | True by construction (grammar+lexicon runtime composition, snapshot-tested) |
| "Every parameter has an owner: system, architect, or model" | The parameter ledger in SYSTEM_MAP backs this |

| Don't claim | Reality |
|---|---|
| Operators have distinct geometric behaviors / act on a relational graph | They're a notational vocabulary; every apply is one cutter subtraction (GAPS P2-1). Say: "operators are preserved as reasoning notation; execution is deliberately reduced to the cutter" |
| Magnitude/decay modulate the geometry | Both inert at runtime (P2-2) |
| A learning compressor / Schmidhuber implemented literally | Static 4-sub-score stand-in — say "re-interpreted," it's stronger than pretending |
| Cross-model comparison results | Never run (P2-4) — unless you build the selector first |
| Krier grounds the notation system | Zero trace in code or prompts; cut or write it for real |
| Sun/traffic analysis in Map | Not built; trees/transit/demographics/plans are real |

## 3. The story arc (build history is thesis material)

The abandoned approaches are not embarrassments — they're the strongest
evidence that the final form was *chosen*. Use them:

1. **Runtime CSG → precomputed vocabulary** (2026-01). Four failed attempts at
   live shell booleans crashed browsers; the pivot to 70 pre-computed
   Grasshopper meshes is what *made* the vocabulary closed — the theoretical
   cornerstone arrived as an engineering retreat. Tell it that way.
2. **v1 form-to-form → v2 content+affect+site** (2026-04). v1 mapped how a meme
   *looks* onto geometry; v2 rejects that as superficial and translates what the
   meme *does* culturally. The two prompts coexist in the repo as before/after
   evidence — quote them side by side.
3. **One-shot translation → two visible passes + confidence.** The system
   stopped hiding its reasoning and started notating its own uncertainty.
4. **Code-owned vocabulary → architect-owned lexicons** (2026-06). The L3/Level-A
   editors moved authorship of the system's language from the developer to the
   architect.
5. **Floating panels → drafting instrument** (2026-07). The UI redesign as the
   system understanding itself as an instrument.

Arc in one line: *from making cubes, to making meaning legible, to handing the
language over.*

## 4. Suggested book structure

1. **The claim** — architecture and cultural conversation; memes as compressed
   observations. (Deleuze framing lives here, honestly labeled as framing.)
2. **The vocabulary** — 8 cutters, C(8,4)=70, why closure matters; the
   runtime-CSG failure story; Grasshopper pipeline. *Figures: cutter table,
   70-variation grid, connection-rule diagram.*
3. **Reading space (Encode)** — five-axis reading before geometry; the grammar;
   multi-image "do not average"; editable reading with provenance. *Figures:
   photo → reading → assembly triptych; grammar excerpt; lexicon editor.*
4. **Translating culture (Pataphysical)** — Jarry as prompt-level method; v1→v2
   pivot; two passes; the confidence vector as the centerpiece; **the operators-
   as-notation section (own P2-1 here, explicitly).** *Figures: meme → pass 1 →
   pass 2 → cut sequence; confidence-vector profiles compared across memes.*
5. **Evolving the assembly (Evolve)** — Schmidhuber re-interpreted; the four
   sub-scores; selection pressure as the algorithm↔intuition dial; the human
   rating in the loop. *Figures: candidate grid with scores; sparkline over a
   session.*
6. **Site as ground truth (Map / map-context)** — what the analysis actually
   provides; site context as prompt prefix vs full injection; Tel Aviv
   specificity as a feature of a sited thesis.
7. **Notation and return (Decode, exports, AR, Grasshopper)** — leaving the
   system: DXF/SVG, GLB/AR, the live-link; the archive (projects, provenance).
8. **The instrument's own language** — the editable-lexicon pattern as the
   contribution; who owns which parameter (the ledger as a full-spread table).
9. **Honesty & future work** — the gap table (P2), graph operators, decay over
   generations, cross-model comparison, fitness axes 5–6.

## 5. Figure list (produce once, reuse everywhere)

Already exists: the system-map artifact (modes/flows/ownership diagram) — use as
the book's opening spread and presentation anchor slide.

To produce (all cheap screenshots/exports from the live app):
1. 70-variation grid (thumbnails exist in `public/thumbnails/`).
2. Encode triptych: source photo → reading panel → resulting assembly.
3. Same photo, two lexicons: how vocabulary changes the reading labels.
4. Pataphysical record drawer: one meme's full pass-1/pass-2/confidence card.
5. 3–4 confidence-vector profiles side by side (the "spatially equivalent memes"
   argument from the v2 prompt).
6. Evolve candidate row with scores + the sparkline mid-session.
7. Decode canvas + a DXF opened in CAD (proof of the return path).
8. map-context dashboard + site atlas for the thesis site.
9. AR photo of an assembly at real scale on site (phone, golden hour — the money
   shot for the presentation).
10. Prompt excerpts typeset as artifacts: the melancholic override; "do not
    average"; the operator-class hard constraint; a confidence-axis definition.

## 6. Presentation demo path (and its risks)

Spine demo, ~6 minutes: **Map** (site already analyzed — don't wait 90 s live)
→ **Encode** with 2–3 photos (pre-tested set) → open the reading, edit one axis
→ **Pataphysical**: pick a meme from archthesis, two-pass, show pass 1 land
before geometry, apply, open the record drawer → **Evolve** one generation,
rate a candidate, apply → **Decode**, export DXF → AR on the phone.

Risk notes:
- Every LLM call is a live network call; have a **saved composition of the same
  sequence** as instant fallback (restore replays all geometry deterministically
  — that's what the provenance system is for; say so out loud, it's a feature).
- Fix GAPS P0-1 first if the Map→Encode toast is part of the choreography;
  otherwise set site context via the curator before starting.
- Pre-warm the map-context atlas cache for the site (first build 30–90 s).
- The default landing tab is Encode, not Map — start the demo on the right tab.

## 7. If any building time remains (ranked by material-per-hour)

1. **P0-1 relay fix** — makes the spine real (~30 min incl. deploy/verify).
2. **Model-selector + comparison table (P2-4)** — the one build that generates
   *new thesis content*: same meme, same site, 3 models, 3 confidence vectors,
   one table for the book (~half a day).
3. **Magnitude → cutter scale (P2-2)** — one honest line of code so a shown
   number does something (~1 hour incl. test).
4. Persist tags (P0-4) if tagging appears in the book (~1 hour).

Everything else: after the deadline.
