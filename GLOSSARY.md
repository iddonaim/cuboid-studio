# Project Glossary — Term List for the Whole Ecosystem

> One list of every project-specific term across the thesis ecosystem:
> **cuboid-studio** (this repo), **map-context**, **archthesis**,
> **cuboid-marketing**, and **cowork-os**. Written in plain language for
> Iddo, thesis reviewers, and future Claude sessions.
>
> Compiled 2026-07-12 from `CONTEXT.md`, `PATAPHYSICAL_V2_SPEC.md`,
> `EVOLUTION_SPEC.md`, `docs/SYSTEM_MAP.md`, `docs/BOOK_AND_PRESENTATION_GUIDE.md`,
> and a code/doc survey of the four sibling repos. Terms with a footgun or an
> honesty caveat (things the thesis must *not* overclaim) are flagged ⚠.

---

## 1. The ecosystem — who's who

| Name | What it is |
|---|---|
| **Cuboid Studio** | The main thesis app (this repo): a web-based 3D modular design system that translates memes and photographed spaces into cube geometry. Live at cuboidstudio.vercel.app. |
| **Topological Translation** | The formal thesis title. The claim: architecture can be produced through a translation pipeline where memes supply the cultural layer, site data supplies the ground truth, an LLM mediates, and the architect curates. |
| **archthesis / ArchMeme / The Giggletecture Machine** | The participatory meme platform (memes.iddonaim.com). Same project under three names: `archthesis` is the repo, ArchMeme is the working name in planning docs, "The Giggletecture Machine" (מכונת הגיחוך וההגחה) is the public brand. It is the *input* side of the pipeline — the public makes memes here; Cuboid Studio consumes them. |
| **map-context / Context Mapper** | The site-analysis app (Railway-hosted): type an Israeli address, get an urban-analysis dashboard plus a 3D "atlas" of the area. Embedded inside Cuboid Studio as the Map tab. `context-mapper` is its internal package name. |
| **cuboid-marketing** | Not a website — a Remotion (code-driven video) project that renders the promotional/explainer videos for Cuboid Studio. |
| **cowork-os ("the twin")** | Iddo's personal context repo: thin Markdown briefs that calibrate every Claude surface (Cowork, Claude Code, Cursor). The governance/memory layer above all the code repos. |
| **step2views** | A shelved 2D notation project. Most of its intent now lives in Cuboid Studio's Decode mode. Don't revive unless Iddo asks. |
| **The pipeline** | cowork-os shorthand for the one-directional relationship: ArchMeme (input) writes memes to Firebase → Cuboid Studio (processing) reads them. One pipeline, two entirely separate codebases that must never be conflated. |

---

## 2. The geometric vocabulary (Cuboid Studio's Layer 0)

- **Cutter** — A primitive solid (sphere or cylinder) that gets boolean-subtracted from a cube to carve it. The word covers both the 8 fixed master cutters and the per-translation cutter a meme produces.
- **8 master cutters** — The complete, fixed set of carving shapes: 5 spheres + 3 cylinders, with deliberate radii (one is 10×φ, one is prime). Nothing outside this set ever cuts a cube — this closure is a theoretical cornerstone, not a limitation.
- **C(8,4)** — "Choose 4 of the 8 cutters." The combinatorics that generate the vocabulary: 70 possible combinations.
- **Variation / the 70 variations** — The 70 resulting cube types (`v-00` … `v-69`), shipped as pre-computed GLB meshes exported from Grasshopper, with pre-rendered thumbnails. The complete "alphabet" of the system.
- **Cut cube** — Marketing-video name for a variation ("Everything is built from 70 cut cubes").
- **Closed vocabulary** — The thesis-level property that follows from the fixed cutter set: because every cube is made of the same 8 primitives, any two cubes either share a cutter or they don't — connection, matching and mutation are exact set operations, "not vibes."
- **CSG (Constructive Solid Geometry)** — The boolean-subtraction technique (via `three-bvh-csg`) that produces cut geometry. Runtime CSG exists as a fallback; the shipped variations are pre-computed.
- **Base cube / grid constants** — The 42×42×42 mm starting cube. `CUBE_SIZE = 42`, gap 0.6, `GRID_STRIDE = 42.6`, shell thickness 1.6. All hardcoded.
- **Shell** — A hollowed-out cube treatment. ⚠ Not implemented at runtime — real shells only exist via Grasshopper export, and in the shipped connection rules a shell blocks all connections.
- **Assembly** — The multi-cube arrangement on the 3D grid; the working state of the model. Single source of truth is the Builder's placed-cubes list.
- **Composition** — The saved, named record of an assembly plus everything that produced it (readings, translations, provenance). ⚠ Also the mandated *product* noun in marketing copy — say "composition," not "assembly" or "building," when talking about the thing a user keeps.
- **Connection rules** — The logic deciding which cube faces may join: door faces map to spheres, window faces to cylinders; sphere↔sphere and cylinder↔cylinder connect, mixed types don't, shell blocks everything. Marketing tagline: "They only connect where their cuts agree."
- **Strict alignment** — An optional stricter mode on top of connection rules: cutters must line up within 10% of the cutter radius.
- **16 rotations** — Each cube can sit in 16 orientations (4 around Y × 4 around X).

---

## 3. The four modes (and the Builder)

- **AppMode / the workflow spine** — The four top-level tabs: **Map → Encode → Evolution → Decode**. That order is the intended narrative: pick a site, read a space, evolve it with culture, notate the result. (The app actually lands on Encode by default, not Map.)
- **Map (mode)** — Site picker. Hosts the embedded map-context app in an iframe; produces the *active site context* that feeds Encode and Pataphysical. Includes the signed-in "My sites" layer (all saved sites on one Leaflet map).
- **Encode (mode)** — Photograph-to-assembly. Upload 1–7 photos of an inhabited space; the model emits a five-axis reading first, then proposes a cuboid assembly that mirrors the space's logic.
- **Evolution (mode)** — Container for two sub-modes: **Evolve** (compressibility-driven candidate generation) and **Pataphysical** (meme → operator translation).
- **Decode (mode)** — 2D notation canvas (Konva): each variation has a tile glyph; drag/rotate/snap them into a plan-like drawing; export SVG or DXF.
- **Builder** — The full cube editor (place, rotate, delete, auto-fill, section cuts, tagging). ⚠ Not a tab — it surfaces inline: as the seed editor inside Encode's merge mode, and as the substrate that Pataphysical re-cuts.

---

## 4. Encode vocabulary (reading space)

- **Five-axis reading** — The structured reading the model produces *before* committing to geometry: three continuous axes (**atmosphere**, **light**, **emotion**) and two categorical axes (**rhythm**, **placement**). Marketing calls them "five open dials."
- **Reading-before-geometry contract** — The grammar's rule that the model must commit to a reading first, then derive geometry from it — the reading is evidence, not decoration.
- **The grammar** — `spatial-encoding-grammar.md`: the fixed IF/THEN template (atmosphere→variation band, rhythm→assembly shape, light→mixing, emotion→density) with `{{slots}}` where vocabulary is injected at runtime.
- **Lexicon** — The editable vocabulary injected into the grammar's slots: the pole labels for each axis (e.g. what the two ends of "atmosphere" are called). Editing the lexicon changes what the model looks for and how readings are labeled.
- **DEFAULT_LEXICON** — The built-in baseline lexicon, used when no custom lexicon is active. Never stored in the database.
- **L1 / L2 / L3** — The three layers of the reading system, in build order: **L1** = the model emits a five-axis reading; **L2** = the architect can edit the reading (the model's original is always preserved plus a `readingEdited` flag); **L3** = the architect can author whole named lexicons (Firestore-backed library, one active at a time).
- **Melancholic override** — A named rule in the grammar: the "melancholic" emotion pole overrides the usual emotion→density mapping. Quoted in the book as a prompt-artifact example.
- **"Do not average"** — The grammar's multi-image rule: with several photos, synthesize a reading rather than averaging them; the primary photo anchors the character.
- **Primary / supplementary images** — Of the 1–7 photos, one is primary (anchors the assembly's character) and up to 6 are supplementary.
- **Encode modes: standalone / merge / remix** — Image only; image + seed cubes from the Builder (opens the inline seed editor); image + a saved state as the seed.
- **Seed / seed editor** — The starting cubes an encode builds on in merge mode; edited in the inline Builder (`seedEditOpen`).
- **Reading provenance** — What gets saved with a composition so the record is self-describing: the model's untouched original reading, the edited flag, and a by-value snapshot of the lexicon that produced it.

---

## 5. Pataphysical vocabulary (translating culture)

- **Pataphysical (sub-mode)** — The meme-translation feature, named for Alfred Jarry's pataphysics. Takes a meme + site context and produces a spatial operator that re-cuts one target cube. ⚠ Marketing rule: the word "pataphysical" may appear in UI pixels but is banned from video captions.
- **Translation** — The full meme→geometry act. Marketing framing: "The meme becomes a cutter — for that cube." ⚠ A translation never adds or removes cubes; it re-cuts exactly one.
- **Two-pass translation (v2)** — The current pipeline: **Pass 1** extracts the meme's cultural content; **Pass 2** commits it to geometry. Both passes are shown to the user — the system notates its own reasoning.
- **Pass 1 (cultural extraction)** — Emits: rhetorical moves, cultural tensions, functional affects, site resonance, and a meme summary.
- **Pass 2 (geometric translation)** — Emits: the operator, its targets, magnitude/decay, the cutter (with geometry reasoning), the 4-axis confidence vector, and a confidence note.
- **v1 vs v2** — v1 (single-pass) mapped how a meme *looks* onto geometry; v2 explicitly repudiates that and translates what the meme *does* culturally (content + affect + site). Both prompts remain in the repo as before/after evidence. **Evolution runs on v2 two-pass** (since PR #59, 2026-06-08); v1 is archival, reachable only by toggling pass mode in `MemeInputPanel`.
- **Pass mode** — Per-request switch between single-pass and two-pass. Defaults to two-pass; **Evolution always sends two-pass** and therefore also sends site context. (The `TRANSLATION_PASS_MODE` env var is dead — nothing reads it.) *(Verified at origin/main 2026-07-28.)*
- **Rhetorical moves** — Pass 1's classification of how the meme argues (irony, juxtaposition, satire, solidarity, mourning, celebration, …). 10 types in v2.
- **Cultural tensions** — Pass 1's named frictions the meme surfaces (e.g. displacement), each tagged internal/external.
- **Functional affects** — Pass 1's emotional charges the meme carries (indignation, dark humor, …), which then bias the geometry.
- **Site resonance** — Pass 1's statement of how the meme's content maps onto the actual analyzed site.
- **Operator** — The named design move a translation yields. 9 classes: the v1 six (**inversion, amplification, drift, reassignment, preservation, shuffle**) plus v2's three (**consolidation, erosion, reinforcement**). ⚠ Honesty caveat: operators are *notation*. Every apply is one cutter subtraction; the operator name is stored, displayed and used in Evolve scoring but does not change geometry differently per class. Say "operators are preserved as reasoning notation; execution is deliberately reduced to the cutter."
- **Targets / edge types** — The 6 relation types an operator nominally acts on: **adjacency, access, visibility, conflict, overlap, threshold**. ⚠ Same caveat: the relational graph these describe is a notational vocabulary, not a runtime data structure.
- **Relational graph** — The spec-level idea that cubes are connected by weighted edges of the 6 types. Not implemented; keep it in the theory chapter, not the demo script.
- **Magnitude / decay** — Numeric parameters of a translation (how strong the move is; how sharply it falls off). ⚠ Neither modulates the geometry. But they are **not equally inert**: `magnitude` feeds the compressibility fingerprint (`compressibility.ts:573`), so it influences which candidate Evolution ranks highest — *the geometry ignores the meme's intensity; the system's taste does not.* `decay` is fully inert; nothing ever decays. The half-translated case is worth naming rather than flattening. *(Verified at origin/main 2026-07-28.)*
- **Confidence vector** — The 4-axis self-assessment attached to every translation: **RC** rhetorical clarity, **SR** site resonance, **AC** affective coherence, **OS** operational specificity (each 0–1). The thesis's notation for *translation strain* — low scores are data, not failure.
- **Confidence note** — The prose companion to the vector: where the translation was torn and why.
- **Geometry reasoning / target reasoning** — Pass 2's written justifications for the cutter shape/placement and for the chosen targets. Part of provenance.
- **Engagement (0–100)** — The meme's popularity signal, log-scaled from archthesis likes, passed into the translation.
- **Translation lexicon ("Level A")** — The Pataphysical counterpart of the Encode lexicon: the editable wording around the fixed operator/edge tokens (rhetorical-move→operator mappings, edge definitions, affect→geometry rules, confidence-axis definitions). The tokens are fixed because validators depend on them; the words are the architect's.
- **The editable-vocabulary pattern** — The project's most original interaction-design contribution: prompts are split into fixed grammar + editable lexicon (for both Encode and Translation). The architect edits *words*; the system guarantees *structure*.
- **Record drawer / translation record** — Click any changed cube to open its full dossier: pass 1, pass 2, confidence, model id. The provenance system made visible.
- **Cutter tweaks** — The panel for adjusting a proposed cutter's parameters before applying it — the architect's last word before geometry commits.
- **Prompt as artifact / model as engine** — The claim that the prompt (grammar + lexicon + site context) is the architect's design artifact and the LLM is a swappable engine. OpenRouter exists to make this demonstrable. ⚠ The cross-model comparison experiment has never actually been run — don't claim results.
- **Spatial heuristic** — What the output cube *is*: not architecture, but a provocation the trained architect interprets. "The meme does not become a building."
- **Architect as curator** — The role the system assigns the human: designing the rules by which culture becomes geometry, then interpreting the results — never drawing the geometry directly.

---

## 6. Evolve vocabulary (growing the assembly)

- **Compression progress** — Schmidhuber's idea, re-interpreted: a candidate is valuable by how much it *improves* the assembly's compressibility (score after − score before), not by static beauty. ⚠ Say "re-interpreted": the shipping engine is a static 4-sub-score stand-in, not a learning compressor.
- **Interestingness** — "The first derivative of compressibility": the steepness of the learning curve. The sparkline's slope.
- **Compressibility / the fitness function** — The 4-sub-score weighted sum measuring how much regularity the assembly has: **geometric clustering** (0.3), **spatial regularity** (0.3), **operator sequence** (0.2), **meme coherence** (0.2). ⚠ Two specced axes (CSG tree edit distance, topological genus) were never built.
- **Feature vector (14-D)** — How each cube's cut history is represented for clustering: 5 one-hot cutter types (incl. legacy `plane`) + 3 proportions + 3 position + 3 rotation. (Older docs say 13-D; 14 is correct.)
- **Dark room / white noise** — The two failure modes the fitness avoids: uniform repetition (fully compressed, boring) and random cuts (incompressible, also boring). The sweet spot is *structured novelty*.
- **Candidate** — One proposed move: one meme translated onto one target cube, scored by compression progress. Generated in parallel batches.
- **Generation** — One evolution round: snapshot → generate N candidates → rank → user previews/rates → apply or undo → log.
- **Population size** — Candidates per generation (2–12, default 6).
- **Selection pressure** — The "algorithm vs intuition" dial (0–100%): how much the ranking weighs computed compression progress versus the user's own ratings.
- **Target cube strategy** — How the engine picks which cube to mutate: `random`, `least-compressed` (highest local entropy), or `adaptive` (⚠ actually a 50/50 hybrid, not learning).
- **Meme pool** — The batch of memes pre-fetched from archthesis at session start (limit 50, hardcoded), optionally filtered by tag.
- **User score / combined fitness** — The architect's manual rating of a candidate, blended with compression progress into the final ranking — the human in the loop.
- **Sparkline / compressibility log** — The small chart tracking assembly compressibility over the session; its slope is the interestingness read-out.

---

## 7. Site & map vocabulary (Map mode + map-context)

- **Site context** — The structured JSON describing a real place: location, quantitative data, programmatic data, and the architect's reading. The ground-truth layer injected into translations (full JSON in two-pass) and encodes (flattened one-line prefix).
- **Active site context** — The one currently in effect, stored in the browser (`cuboid:activeSiteContext`). Set by Map's analysis, by the curator, or from a saved site.
- **Site Context Curator** — The manual panel for setting/clearing the active site context — the fallback path when the automatic Map handoff isn't used.
- **analysis-complete / the relay** — The message the finished map-context dashboard posts up to Cuboid Studio to hand over the site context. ⚠ Was broken end-to-end (the launcher page swallowed it); fixed 2026-07-12 with a relay in map-context's launcher.
- **My sites** — The signed-in Map layer plotting every saved site across all projects on one Leaflet map; from a pin you can load compositions or set the active site.
- **Dashboard** — map-context's main output: a self-contained HTML page of urban-analysis layers for the analyzed address. Six Hebrew tabs, ⚠ of which only Map/GIS and TABA are real — the rest are placeholders.
- **The atlas / Tel Aviv Atlas** — map-context's explorable 3D city model (orbit/fly/walk cameras, day/night, sun study, guided tour, 25 curated landmarks). **City atlas** = central Tel Aviv by default; **site atlas** = centered on the analyzed address with a red marker and radius ring.
- **Analysis pipeline (runAnalysis)** — map-context's core routine: geocode → buildings & heights → trees → streets/transit/institutions → registration blocks → elevation + demographics + statutory plans → dashboard + data payload. ⚠ Radius is hardcoded to 400 m server-side.
- **Fat HTML** — map-context's architectural principle: each dashboard/atlas is one portable HTML file with everything inline — shareable, offline-capable.
- **Trust Layer** — The design principle that every data row links to its official source (GovMap, CBS), so numbers read as verifiable, not hallucinated.
- **TABA / תב"ע** — Israeli statutory urban plan (zoning/building rights). map-context fetches the plans covering the site plus their documents: **takanon** (תקנון, the regulations text), **tasrit** (תשריט, the zoning drawing), **mmg** (bundled docs).
- **Gush / Chelka (גוש / חלקה)** — Cadastral block and parcel numbers — the key for looking up a site's statutory plans. **Registration blocks** are the block polygons drawn on the map.
- **Dunam** — Israeli land unit (1,000 m²), used for plan areas.
- **CBS / statistical area** — Israel's Central Bureau of Statistics (למ"ס) and its census geography; the site's statistical area supplies population, density, vehicle ownership, and housing tenure (falling back to Tel Aviv city-wide, locality 6900).
- **Mock mode** — The atlas's offline procedural stand-in city (`?mock=1`), watermarked "MOCK DATA" — for demos without internet.
- **POIs** — Points of interest around a site (transit, education, healthcare, civic, green space, markets, major roads), fetched via Overpass by Cuboid Studio's own `fetch-context-pois` endpoint.
- **Nominatim / Overpass / GovMap** — The external data services: OSM's geocoder (proxied server-side because browsers can't call it directly), OSM's query API, and Israel's national GIS.
- **Tel-Aviv-only surfaces** — ⚠ Parts of map-context that only work in Tel Aviv: trees, registration blocks, TABA resolution, buildings fallback, demographics default. Streets/transit/institutions/elevation/atlas work anywhere in Israel bounds.

---

## 8. Saving, exporting, leaving the system

- **Projects → Sites → Compositions** — The cloud data hierarchy (Firebase, signed-in): a Project holds Sites (places), each Site holds Compositions (saved work). Lexicons and translation lexicons live in their own collections.
- **Capture / restore** — Saving serializes the assembly, encode state + provenance, all translation records, the evolution log, decode tiles, and a site-context snapshot. ⚠ Geometry itself is *not* stored — restore deterministically replays each cube's operator stack against its base variation (a feature: the archive is a score, not a recording). ⚠ Not captured: tags, section cuts, translation-lexicon provenance.
- **Saved states** — The separate local-only save layer: up to 20 named slots in the browser, no sign-in needed; also feeds Encode's remix mode.
- **Shared Firebase project** — Cuboid Studio and archthesis use the *same* Firebase project. ⚠ The deployed Firestore rules live in the archthesis repo and are overwritten on its every deploy — rule edits in cuboid-studio must be mirrored there.
- **Tile glyph** — A variation's 2D symbol on the Decode canvas; the unit of the notation drawing.
- **DXF / SVG export** — Decode's CAD-readable outputs — the "return path" from the system into conventional drawing tools.
- **GLB export** — The merged 3D mesh of the assembly, downloadable and feeding the AR viewer.
- **AR viewer** — View the assembly at real-world scale through a phone (Scene Viewer on Android, Quick Look on iOS), with a scale slider.
- **Live-link / the Grasshopper bridge** — A small local Python server (port 9876) that receives the assembly state and round-trips it into a running Rhino/Grasshopper definition.
- **Section cuts** — Builder feature slicing the assembly along a plane for interior views. ⚠ Session-only, not saved.
- **Tags** — Word + intensity labels on cubes or the whole composition (Builder), overlaid on Decode. ⚠ Session-only — not saved with compositions; only composition-level tags render.

---

## 9. Theory shelf (the framework behind the words)

- **Pataphysics (Alfred Jarry)** — "The science of imaginary solutions." Grounds the translation method: consistent, rule-governed, auditable correspondences between meme and geometry that are *not* claimed to be rational or deducible — reproducible association, not logic.
- **Compression progress (Jürgen Schmidhuber)** — Intrinsic-motivation theory: an observer enjoys data that becomes more compressible as it learns. Scaffolds the Evolve fitness. ⚠ Re-interpreted, not implemented literally.
- **Virtual/real (Gilles Deleuze)** — Framing for why memes matter: they capture the cultural-virtual dimension of a site that physical analysis misses. Additive, honestly labeled as framing.
- **Krier (urban typologies)** — ⚠ Referenced in older docs but has zero trace in code or prompts — cut it from the book or write it for real.
- **Functional emotions paper (Sofroniew et al., 2026)** — The Anthropic interpretability work the confidence vector's geometry is modeled after; the argument-by-analogy for why meme content can modulate spatial output.
- **Humor-as-method / "Path B"** — The thesis's central bet (cowork-os phrasing): humor (memes) as the mechanism of public spatial critique — method, not decoration — with the architect as curator at the end.
- **Provenance all the way down** — The system-wide property: originals are never overwritten, edits are flagged, vocabularies are snapshotted by value, every cut stores its meme, both passes, confidence and model id. The archive is self-describing.
- **Parameter ledger** — The complete accounting (in `docs/SYSTEM_MAP.md`) of who owns each parameter: user-changeable in the UI vs system-level (code/file edit) vs deploy-level (env vars). Backs the claim "every parameter has an owner."
- **Drafting instrument** — The 2026-07 UI redesign's self-image: paper surfaces, warm-gray ink ramp, single vermilion accent, Geist type — the system as instrument, not oracle. ("Paper-light" is the same identity's name in the marketing repo.)

---

## 10. archthesis / Giggletecture vocabulary

- **גיחוך (gichuch)** — The platform's coined Hebrew word for "meme" (literally a giggle/chuckle), used throughout the UI instead of "מם". ⚠ Flagged in the design brief as possibly up for revision.
- **הגחה (hagacha)** — The brand name's second half — "emergence/breaking out," a near-rhyme wordplay with גיחוך.
- **Corpus** — The thesis framing of the collected memes: a field archive of vernacular visual humor tied to place — research material, not just a feed.
- **Absurd-harmony axis** — The design north star: the loud **meme register** and the earnest **scholarly register** coexist at full strength without ironizing each other (memes loud; chrome and metadata typeset like a catalogue).
- **Origin tracking** — The spatial-analytics subsystem recording *where* a contributor discovered the platform — a neighborhood QR code (`?ref=florentin` etc.) or an organic link. Tracks WHERE, not WHO; stamped on each published meme as `originSource`.
- **Scene model** — The editor's canvas data model: a flat list of elements (text, emoji, image, location) where list order is stacking order.
- **Template** — A preset meme background (Drake, Distracted Boyfriend, …) with pre-positioned text boxes.
- **Remix** — Reopening an existing gallery meme in the editor as the starting point for a new one. (Same word as Encode's remix mode in Cuboid Studio — different features.)
- **Sticker packs** — The editor's sticker drawer: meme (Twemoji), props, Hebrew slang badges (וואלה, סבבה, …), the hand-drawn drafting pack (שרטוט), plus "שלי" — the user's own uploaded stickers.
- **Bubblegum pop** — The current visual direction (pastel blobs, gradient headlines, sticker buttons with ink outline + hard shadow). Replaced the abandoned dark "blueprint" direction.
- **Lightbox** — The full-meme view, styled as a monograph plate facing a commentary page: the meme centered, with an editorial catalogue entry (contributor, date, tags, location map).
- **Likes → engagement** — The public's only write permission is liking; likes are log-scaled into the 0–100 engagement number Cuboid Studio's translations use.
- **Admin custom claim / App Check** — The platform's two guard rails: admin rights only via a Firebase Auth claim; reCAPTCHA-backed bot protection on all writes.

---

## 11. Marketing-video vocabulary (cuboid-marketing)

- **Explainer** — The ~110-second chaptered master video (8 scenes), from which shorter cuts derive (60s tight cut, 9:16 verticals, silent teaser loop).
- **HeroTransform** — The original dark-navy landing-hero clip, superseded by the paper-light explainer but still in the repo.
- **StagedDemo** — The scene that recreates the real app UI (top bar, cursor, panels) to perform the Translate flow with staged stand-in content.
- **Cold open** — Scene 0: the UI-less hook where a meme sinks into and re-cuts one cube.
- **Captions-first** — The authoring doctrine: on-screen caption lines *are* the script; any voiceover just reads them.
- **Language rules** — ⚠ Hard-won copy constraints: the product noun is **composition**; the verb is **interpret** (never "reads the mood"); "pataphysical" never appears in captions; a translation never adds or removes cubes.
- **The hook** — "What if a meme could change our city?" (v2; v1 said "…a building").
- **Taglines in circulation** — "Everything is built from 70 cut cubes." / "They only connect where their cuts agree." / "The meme becomes a cutter — for that cube." / "Reasoning on the table — tweak it first." / "Your read wins." / "The output is a diagram — you choose its form." (Hero headline and close-scene line: still TBD.)

---

## 12. cowork-os vocabulary (the working system around everything)

- **Stream** — A unit of work (client, venture, or project) with exactly one folder and one brief. The thesis is one stream family: ArchMeme, Cuboid, Paper, Presentation.
- **Brief** — A stream's thin context file (`CONTEXT.md` for Cowork, `CLAUDE.md` for code repos): gotchas-first, under 300 lines.
- **Surface** — Any Claude interface being calibrated: Cowork desktop, Claude Code, Cursor.
- **Master / deployment** — The master brief lives once in cowork-os; copies committed into code repos are deployments and must be re-synced when the master changes (the `brief-sync` skill does this; `context-sync` reconciles the other direction, repo → brief).
- **The spine** — The single shared thesis brief every thesis sub-project imports; holds only what's common to all four.
- **The invariants** — The four non-negotiable structure rules: one scoped folder per project, one brief per leaf, shared context lives once, `CONTEXT.md` for briefs vs `CLAUDE.md` for repos.
- **Registers** — The three labeled writing voices (thesis/academic Hebrew, working/chat, external/email), each tagged by reliability.
- **Airplane-mode reliability** — The hard demo constraint: anything shown live (presentation, Cuboid demo) must survive with zero network — deterministic client-side replay or cached fallback. (This is why saved compositions replay geometry deterministically.)
- **Command Center** — Iddo's Notion task database, written to via the `notion-command-center` skill under the World → Project → Task hierarchy.

---

## 13. Shorthand that shows up in docs

| Shorthand | Meaning |
|---|---|
| **L1 / L2 / L3** | The Encode reading layers: model reading / editable reading with provenance / editable lexicon library. |
| **Level A** | The editable *translation* lexicon (Pataphysical's counterpart to L3). |
| **P0 / P1 / P2…** | Priority ranks in `docs/GAPS_AND_HOLES.md` (P0-1 = the Map relay bug, P2-1 = operators-as-notation, P2-2 = inert magnitude/decay, P2-4 = never-run cross-model comparison, P0-4 = unsaved tags). |
| **RC / SR / AC / OS** | The four confidence axes: rhetorical clarity, site resonance, affective coherence, operational specificity. |
| **v1 / v2** | The two generations of the translation prompt: form-to-form vs content+affect+site. |
| **GLB / DXF / SVG / OBJ** | File formats: 3D mesh for web/AR; CAD drawing exchange; vector drawing; 3D geometry for Rhino. |
| **CSG** | Constructive solid geometry — boolean cutting. |
| **SSE** | Server-sent events — how map-context streams analysis progress. |
| **OSM** | OpenStreetMap — the open map data behind geocoding, streets, and the atlas. |
