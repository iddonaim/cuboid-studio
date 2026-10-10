> HISTORIC (2026-08-30): process record, not current. Its premise ("the modal is NOT in this repo") is false at HEAD — the shipped `OnboardingModal.tsx` exists and differs from this script, so its "source of truth" claim is retired. File stays at this path — `OnboardingModal.tsx` cites it. Do not cite as current.

# Cuboid Studio — Onboarding Showcase Script (v4)

> v4 = v3 reconciled with the July 2026 design overhaul (PR #79). Structure and
> copy unchanged except where the overhaul changed on-screen facts (marked ◆).
> Seven-frame showcase modal. Frames 1, 6 & 7 diagrammatic; frames 2–5 use
> **swappable screenshot slots** (`public/onboarding-screens/{map,encode,evolution,decode}.png`).
> Copy is short + bulleted by design — the modal is glanceable, not read.
>
> **Status:** the modal implementation described as "already done" in earlier
> notes is NOT in this repo (no branch has it). This script is the source of
> truth for whoever builds or re-lands it.

---

## Frame 1 — The bet  *(diagram: cube → cutters → 70 variations)*
**One vocabulary, measurable culture**
Lead: Most site analysis misses the cultural layer. This makes it measurable.
- Built from primitives — a 42 mm cube cut by 4 of 8 fixed cutters (spheres & cylinders) → 70 variations
- The rule: cubes that share a cutter can sit side by side
- Four stages build on this: Map · Encode · Evolution · Decode

## Frame 2 — Map  *(screenshot: map.png)*
**Meet the real site**
Lead: The base context layer every architecture project starts from.
- Type an address
- Gathers buildings (2D→3D massing + heights), streets, transit, demographics
- Becomes the shared input every later stage builds on

## Frame 3 — Encode  *(screenshot: encode.png)*
**Read a real space**
Lead: Photograph a space; the model reads its logic — you curate it.
- Upload 1–7 photos (one primary)
- Five-axis reading: atmosphere · light · emotion · rhythm · placement
- Proposes a cuboid seed assembly
- Vocabulary = an editable lexicon — prompt is the artifact

## Frame 4 — Evolution  *(screenshot: evolution.png)*
**Let culture push the form**
Lead: A meme becomes a geometric move.
- Translates a meme → cultural reading → spatial operator (erosion · reinforcement · drift)
- Confidence as four dials (rhetorical, site, affect, operation) — shows where the move is well-grounded
- ◆ Preview as a vermilion-highlighted cube → apply or undo *(was "amber wireframe"; the overhaul's single accent is vermilion)*

## Frame 5 — Decode  *(screenshot: decode.png)*
**A diagram to intervene from**
Lead: The result is a notation diagram — the rules of engagement for the site.
- 3D assembly flattens to a 2D notation canvas
- Glyph tiles snap to a grid, rotatable
- Read alongside the photos & site context as the basis for intervention
- Export to DXF & SVG

## Frame 6 — Good to know  *(diagram: toolkit icons)*
**Tools that run throughout**
- Navigate the 3D cube — orbit, pan, ortho mode
- Section-cut to look inside an assembly
- Hand-edit a seed assembly inside Encode
- Save screenshots / states as you go
- Live round-trip to Grasshopper · code on GitHub
- ◆ Sidebar hides with Cmd/Ctrl+B for a full-bleed view

## Frame 7 — The through-line  *(diagram: pipeline lit in sequence)*
**Model as engine, prompt as artifact**
Lead: The pipeline, end to end.
- Map gathers the ground
- Encode reads the space
- Evolution lets culture act
- Decode makes the diagram
- The judgment lives in the prompts & lexicon

---

### Notes
- **Screenshots:** real captures of the redesigned UI live in
  `public/onboarding-screens/`. Regenerate after major UI changes —
  layout/copy/motion of the modal stay unchanged.
- **Evolution accuracy:** centred on the Pataphysical translator (live). "Evolve"
  GA kept light; adjust if its status changes.
- **Screenshot callouts (later):** once the modal lands, animated hotspot markers
  can point at the exact control each bullet names.
