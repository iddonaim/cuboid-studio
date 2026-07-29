# Brief for Claude Design — Cuboid Studio onboarding assets (v2)

> v2 = v1 re-issued after the July 2026 design overhaul (PR #79). The v1 brief
> specified the old dark slate/amber palette; producing assets to that spec now
> would clash with the shipped app. **This version is the only valid brief.**

**Context.** Cuboid Studio is a browser 3D tool (B.Arch thesis) that translates
inhabited spaces and internet memes into modular "cuboid" assemblies — a 42 mm
cube cut by 4 of 8 fixed boolean cutters (spheres & cylinders) → 70 variations.
A 7-frame onboarding showcase modal needs polished visual assets. Keep
everything **vector/illustrative**; frames 2–5 now use real screenshots of the
shipped UI (already in `public/onboarding-screens/`), so only the three hero
diagrams remain to be produced.

**Visual system (match exactly — "drafting instrument").** Light, paper-and-ink:

| Role | Value |
|------|-------|
| Paper / background | `#F7F5F0` (transparent also fine) |
| Panel / surface | `#FCFBF8` |
| Ink (text, strokes) | `#24221C` |
| Muted ink | `#7C786C` |
| Hairline rules | `#DAD6CB` |
| **Primary accent (vermilion)** — "the move" / active element | `#BC4A1F` |
| Secondary accent (blueprint blue) — selection / secondary highlight | `#3B5A80` |

Typography: Geist (sans) for labels, Geist Mono for annotations; sentence-case,
minimal text, thin strokes (~1–1.5px), subtle rounded corners. No
gradients-as-decoration, no photoreal. Cubes draw as white fills with fine ink
outlines — like the app's viewport.

**Deliverables — three hero diagrams, SVG, transparent background:**

- `frame1-primitives.svg` — a 42 mm cube being cut by 4 of 8 primitive cutters
  (spheres + cylinders), resolving into a grid of 70 small variation glyphs.
  Cutters in vermilion; cube in white/ink.
- `frame6-toolkit.svg` — a 5-icon set (one consistent style): orbit/ortho
  navigation, section-cut, edit-seed (assembly editor), save state/screenshot,
  Grasshopper/GitHub link. Ink strokes, vermilion for the active detail.
- `frame7-pipeline.svg` — a horizontal pipeline Map → Encode → Evolution →
  Decode, caption "ground → space → culture → drawing". The lit/active stage
  in vermilion, the rest in ink.

**Screenshot slots (already satisfied):** `map/encode/evolution/decode.png` in
`public/onboarding-screens/` are real captures of the shipped UI. Regenerate
after major UI changes rather than illustrating them.
