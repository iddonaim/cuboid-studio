# The Eight Cutters, Read as a Composition

> Positional analysis of the 8 master boolean cutters against the 42 mm cube,
> derived from the exact Grasshopper coordinates in
> `src/lib/cube/specifications.ts`. Companion drawing plate:
> [`docs/cutter-composition-plate.html`](./cutter-composition-plate.html)
> (open in a browser — all figures are drawn true-to-scale from the same
> coordinates).
>
> Analysis date: 2026-07-24. No placement rationale was previously documented
> anywhere in the repo; everything below is measured from the numbers, with a
> confidence note at the end separating exact identities from interpretive
> reads.

---

## Headline: 8 cutters = 4 twin pairs, one pair per wall

Every one of the 4 radius values appears **exactly twice**, and each pair
enters the cube through the **same face**:

| Wall (plan) | Twin pair | Shared radius | Identity |
|---|---|---|---|
| Front (Y=0) | Sphere 01 + Cylinder 05 | 16.18034 | 10 × φ (golden ratio) |
| Right (X=42) | Sphere 02 + Cylinder 06 | 9.864601 | 3.14 × π — exact to all stored digits |
| Back (Y=42) | Sphere 03 + Cylinder 07 | 13 | prime, and a Fibonacci number |
| Left (X=0) | Sphere 04 + Sphere 08 | 17.085938 | (3/2)⁷ — seven musical fifths, exact to all stored digits |

Each sphere+cylinder pair is the same circle *played twice*: once stamped
into the face (sphere), once dragged through the cube along that face's
normal (cylinder — every cylinder enters from its twin sphere's face). The
left wall is the exception: two stamps, no drag, and the only face using the
largest radius.

The count is perfectly even: **exactly 2 cutters per vertical wall, 0 on the
floor and ceiling**. No cutter originates on a Z face and no cylinder runs
vertically. Walls get openings; floor and ceiling are only grazed indirectly
(Cylinder 05 grooves the underside, Sphere 03 pokes through the ceiling).

The `specifications.ts` header only vaguely says the radii are "π-derived"
and "harmonic fifths"; the two identities above (3.14 × π and (3/2)⁷) are the
actual closed-form values, verified to every digit stored in the code.

## The twin displacement is a near-constant (~15 mm)

Measured in the plane of each face, every twin sits **14.7–16.3 mm from its
sibling** — four different walls, four different radii, one slide distance:

| Pair | In-plane displacement | Character of the slide |
|---|---|---|
| S01 → C05 (front) | 14.71 | almost pure vertical drop (sideways drift 1.40); axis lands 1.2 below the floor |
| S02 → C06 (right) | 16.26 | the only horizontal slide (vertical drift exactly 1.40); axis lands 1.8 outside the front face |
| S03 → C07 (back) | 15.15 | vertical drop (drift 4.06); the only cylinder whose axis stays fully inside the cube — a true tunnel |
| S04 → S08 (left) | 14.93 | toward back-bottom; each centre lies *inside* the other's radius, so the two merge into one double-bubble |

This is the strongest compositional invariant found: *same circle, same
face, slid about 15 mm.*

## Seen from the side (elevation)

- **Four of the eight centres sit in a 3 mm height band: Z = 26.3, 27.8,
  29.1, 29.2** (C07, C06, S04, S02) — just above the golden section of the
  cube's height, 42/φ = 25.96.
- The rest of the height score: S08 holds mid-height (21.25 ≈ 21), S01
  anchors low (13.44), S03 breaks the top edge (40.90, reaching Z = 53.9),
  C05 dips below the floor (−1.20, grooving the bottom).
- **The small numbers form a family**: C05 sits 1.2 below the floor, C06
  sits 1.8 in front of the front face — ratio exactly **3:2**, the same
  harmonic fifth as the (3/2)⁷ radius. The two twin drifts of 1.40, the
  1.5 vertical gap between the C06 and C07 axes (another exact 3:2 echo),
  and the 1.6 shell thickness complete the sequence
  1.2 · 1.4 · 1.4 · 1.5 · 1.6 · 1.8.

## How the cutters relate to each other (overlap graph)

Checking every pair of cutters for whether their carved volumes physically
intersect:

- **Every twin pair overlaps** — a complete pair always reads as one
  connected void, never two separate bites.
- Cross-family overlaps: S01–S04, S01–C06, S01–C07, S02–C07, S04–C05,
  S04–C06, C05–S08, C06–C07. (12 overlapping pairs total, including the 4
  twins.)
- **Sphere 01 and Sphere 04 are the hubs** — 4 contacts each. The two
  largest radii do the connecting.
- **Sphere 03 is the loner** — it touches *only* its twin, Cylinder 07. In
  any variation that includes S03 without C07 (20 of the 70), the back-top
  bite is guaranteed to be an isolated, sealed pocket.

## Where it repeats across the 70 variations

- Each complete twin pair appears in **15 of 70** variations. The golden
  pair {S01, C05}: v-01, v-05, v-09, v-10, v-11, v-15, v-19, v-20, v-21,
  v-25, v-26, v-27, v-31, v-32, v-33.
- **Six variations are "perfect duets"** — two complete twin pairs and
  nothing else, the purest expression of the pairing logic:

  | Variation | Pairs | Radii |
  |---|---|---|
  | v-09 | front + right | 10φ + 3.14π |
  | v-20 | front + back | 10φ + 13 |
  | v-27 | front + left | 10φ + (3/2)⁷ |
  | v-42 | right + back | 3.14π + 13 |
  | v-49 | right + left | 3.14π + (3/2)⁷ |
  | v-60 | back + left | 13 + (3/2)⁷ |

- Void connectivity splits the catalog almost in half: **26 of 70
  variations carve one fully connected void; 44 break into 2–4 separate
  pockets**. v-00 (the four original spheres) is three separate voids;
  v-69 (all cylinders + S08) is two.
- The bookends are exact complements: v-00 = {S01, S02, S03, S04},
  v-69 = {C05, C06, C07, S08} — and in general every variation has a mirror
  twin using the other four cutters.

## Reading confidence

**Exact, to every stored digit:** the 3.14 × π and (3/2)⁷ radius identities;
the 3:2 ratios among the small offsets (1.2 : 1.8 and the 1.5 axis gap); the
two-per-wall / twin-per-face / zero-on-Z structure; the variation counts and
overlap results (computed, not estimated).

**Interpretive but tightly clustered:** the ~15 mm twin slide
(14.71 / 16.26 / 15.15 / 14.93) and the height band at the golden section
(centres 26.3–29.2 against 42/φ = 25.96). These read as compositional habits
rather than formulas — real numerical clusters, but not exact constants.
