# Cuboid Studio — A Step-by-Step Walkthrough for Architects

Live app: https://cuboidstudio.vercel.app · Repo: https://github.com/iddonaim/cuboid-studio
Companion projects: https://github.com/iddonaim/archthesis (meme platform) · https://github.com/iddonaim/map-context (site analysis)

Cuboid Studio is a web-based design system built on a specific claim: the cultural conversation around a place — the frustrations, jokes, and shared readings that circulate as memes — is legitimate design input, and its translation into geometry can be made measurable and inspectable rather than metaphorical. The workflow spine is four tabs: **Map → Encode → Evolution → Decode**, with an inline **assembly editor** as the modelling substrate. Each step below pairs *what you do* with *why it is built that way*, because the design decisions are the argument.

## Step 1 — Map: the site as a first-class input

Type an address (or click to pin), set a radius between 50 m and 2 km, and the app assembles a structured site context: geocoded location plus the surrounding fabric across some twenty-two categories — transit, education, healthcare, civic uses, green space, markets, major roads. A dedicated site-analysis view (the embedded map-context app) runs the deeper reading.

*Why:* the site context is not a backdrop image. It is written to a persistent record that both the photographic encoding and the meme translation read from. Cultural translation in this system is site-specific by construction — the same meme produces a different cut on a different site, and you can trace exactly which contextual facts entered the translation.

## Step 2 — Encode: a reading before any geometry

Upload one to seven photographs of an inhabited space; the primary image anchors the assembly's character. Before proposing any geometry, the system publishes its reading of the space on five explicit axes — atmosphere, light, and emotion as continuous scales, rhythm and placement as categories — together with its reasoning.

You can edit this reading. The model's original is preserved untouched alongside your revision, with a flag recording that it was edited. The vocabulary labelling the axes is itself authored: signed-in architects write and save their own lexicons, and the active lexicon drives every encode.

*Why:* this is the system's answer to the hardest critique of any culture-to-form pipeline — unfalsifiability. By forcing the interpretation into a typed intermediate representation that appears *before* geometry, the reading becomes something you can inspect, contest, and overrule. Authorship stays auditable: the record always shows what the machine read and what the architect changed.

## Step 3 — The vocabulary and the assembly editor

Every form in the system derives from seventy cube variations: choose four active cutters from a fixed set of eight (five spheres, three cylinders) and subtract them from a common base cube. The assembly editor — surfaced inline within Encode — places these on a 3D grid with connection rules, rotation, undo/redo, and per-cube tagging.

*Why two decisions matter here.* First, the vocabulary is finite and fixed: with eight primitives, every relation is unambiguous — two cubes either share a cutter or they don't, and assembly, matching, and mutation all follow from that. Second, saving a composition stores the cutting conditions — the boolean operators — not the resulting mesh. The form regenerates from its forces on every load. The stored object is the set of conditions that produce the form, not the form itself.

## Step 4 — Pataphysical translation: from meme to operator

In Evolution's Pataphysical sub-mode, browse the meme library (collected and annotated on the archthesis platform) and select one. The translation runs in two passes. Pass one extracts the cultural content: the rhetorical move the meme performs, the tension that powers it, its functional affects, and its resonance with the active site. Pass two commits geometry: a named operator — erosion, consolidation, amplification, inversion, drift, reassignment, and others — with explicit targets, magnitude and decay, a chosen cutter from the fixed set, written geometric reasoning, and a four-axis confidence vector covering rhetorical clarity, site resonance, affective coherence, and operational specificity.

Parameters can be tweaked before applying, and every applied operator is kept in a per-cube history.

*Why:* decomposing the translation into two inspectable passes means nothing between the joke and the cut is a black box. The confidence vector makes the system state where its own translation is weak instead of performing certainty. And the prompt that governs the translation is treated as the design artifact — refining the translation means rewriting the prompt, in language, not the code.

## Step 5 — Evolve: curation, not optimization

The Evolve sub-mode generates a pool of candidate translations in parallel and scores each by compression progress: how much more structured — more learnable — the assembly became after the candidate is applied. The fitness is a weighted sum of four measurable sub-scores: geometric clustering, spatial regularity, operator-sequence repetition, and meme-group coherence. Candidates arrive ranked; previewing highlights the target cube in the viewport, and each candidate can be applied or discarded.

*Why:* there is no optimum being approached. Compression progress operationalizes interestingness (after Schmidhuber): a candidate is good when it teaches the assembly new structure. The ranked list positions the architect as curator of proposals, not consumer of an output.

## Step 6 — Decode: back into notation

The Decode tab flattens the work into two-dimensional architectural notation on a canvas: each variation has a tile glyph; you place, rotate in 90° steps, and snap to grid, then export SVG or DXF directly into a documentation pipeline. Tags assigned while editing the assembly appear as an overlay.

*Why manual:* the return to drawing convention is deliberately an act of composition rather than an automatic flattening. Decoding is authorship too — the notation is where the work re-enters the discourse the profession already reads.

## What the system refuses to claim

Cuboid Studio does not remove the architect. Every automated step publishes an editable intermediate — the site record, the five-axis reading, the operator with its confidence vector, the ranked candidate list — precisely so judgment has somewhere to act. The position throughout is the architect as curatorial translator, and culture as a first-class design material.

## Appendix — network dependency (for live demos)

| Step | Network | Offline strategy |
|---|---|---|
| Map (geocode, POIs, map-context iframe) | Yes | Pre-baked site context / restored state |
| Encode (vision reading) | Yes | Restore a saved composition with its reading |
| Assembly editor | No | Fully deterministic, safe live |
| Pataphysical / Evolve generation | Yes | Restore applied results; scoring itself is client-side |
| Decode + SVG/DXF export | No | Fully deterministic, safe live |
