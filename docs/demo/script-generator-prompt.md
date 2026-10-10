> HISTORIC (2026-08-30): process record, not current. Its CANONICAL FACTS block predates the POETIKS rename and the P0-7 geometry fix — the anti-drift mechanism has itself drifted. If demo generation is rerun, rebuild the facts block from CONTEXT.md first. Do not cite as current.

# Cuboid Studio — Demo Script Generator Prompt

Reusable prompt for producing future video scripts / live-demo narrations (Claude, NotebookLM, etc.).
Fill the variables, paste the whole thing. The CANONICAL FACTS and PROHIBITED CLAIMS blocks are the anti-drift mechanism — never trim them.

---

You are writing a {DELIVERY: recorded voiceover script | live demo narration | onboarding walkthrough} for Cuboid Studio, for an audience of {AUDIENCE: professional architects | design students | general public | potential collaborators}, in {LANGUAGE: English | Hebrew}, targeting {DURATION} minutes (~130 spoken words/min in English, slightly fewer in Hebrew).

SITE CONTEXT for this run:
{SITE_CONTEXT: 1–3 sentences on the anchor site, or "site-agnostic — keep [SITE] slots"}

STEPS TO COVER (default: full spine):
{FOCUS: Map → Encode → assembly/vocabulary → Pataphysical → Evolve → Decode | subset}

## Canonical facts — every claim must be consistent with these

1. Cuboid Studio is a web app (React/Three.js, cuboidstudio.vercel.app). Workflow spine: Map → Encode → Evolution → Decode; the assembly editor is inline, not a tab. Pataphysical is a sub-mode of Evolution.
2. Map: address geocoding + POI harvest (~22 categories, 50 m–2 km radius) into a persistent structured site context that is injected into both Encode and Pataphysical. Deeper analysis runs in the embedded map-context app.
3. Encode: 1–7 photos (1 primary). The system emits a five-axis reading BEFORE any geometry — atmosphere, light, emotion (continuous) + rhythm, placement (categorical). The reading is editable; the model's original is always preserved with an edited flag. Axis vocabulary comes from architect-authored lexicons.
4. Vocabulary: 70 cube variations = choose 4 of 8 fixed cutters (5 spheres + 3 cylinders) subtracted from a base cube. Finite fixed vocabulary → unambiguous relations (share a cutter or not). Saving stores boolean cutting conditions, not meshes — form regenerates on load.
5. Pataphysical translation is two-pass: (1) cultural extraction — rhetorical move, tensions, affects, site resonance; (2) geometric translation — a NAMED operator (inversion, amplification, drift, reassignment, preservation, shuffle, consolidation, erosion, reinforcement) with targets, magnitude/decay, a cutter, written reasoning, and a 4-axis confidence vector (rhetorical clarity, site resonance, affective coherence, operational specificity). Parameters are tweakable before apply. The prompt is the design artifact.
6. Evolve: generates candidate translations in parallel, scored by compression progress (interestingness, after Schmidhuber) over four weighted sub-scores — geometric clustering, spatial regularity, operator-sequence repetition, meme coherence. Candidates are ranked; the architect previews, applies, or discards.
7. Decode: a MANUAL 2D notation canvas — tile glyphs per variation, 90° rotation, snap-to-grid, SVG/DXF export. Not automatic.
8. Memes come from the archthesis platform (memes.iddonaim.com); site analysis from map-context. Network-dependent steps: Map services, Encode vision call, Pataphysical/Evolve generation. Deterministic/offline-safe: assembly editing, Decode, scoring, saved-state restore.

## Prohibited claims — never say or imply

- "No architect / no design background / no math needed" or any erasure of the human role. The correct frame is the architect as curatorial translator; every automated step exposes an editable intermediate.
- That Encode "scans mood" as a single opaque judgment — always name the five-axis reading and its editability.
- That Evolve "randomly twists/rotates blocks," "bakes," or brute-forces — always describe compression-progress scoring.
- That Decode is "one click" or automatic flattening/unfolding.
- Vague mysticism about "invisible blades" or "energy" in place of the named operator vocabulary.
- Any capability not in the canonical facts (do not invent features).

## Register rules by audience

- **Professional architects:** lead with the decisions behind the design (typed intermediate representation as the falsifiability answer; finite vocabulary; conditions-not-meshes persistence; confidence vector; curation-not-optimization). Precise, no hype.
- **Students / onboarding:** same facts, warmer pacing; one concrete micro-example per step; end each step with "what you can change."
- **General public:** simplify vocabulary but keep the human-in-the-loop frame; never cross into the prohibited claims.
- **Collaborators:** add where things live (repos, prompts as artifacts, saved-state architecture) and what is open for contribution.

## Output format

Timed beats (mm:ss) with a [SCREEN: …] capture cue per beat; mark network-dependent beats ⚡ with the offline fallback (restore saved state). Spoken text in plain prose — no bullets inside the narration. Keep [SITE] / [SITE CONTEXT] slots verbatim when running site-agnostic.
