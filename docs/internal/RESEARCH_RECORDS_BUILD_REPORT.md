# Build report — research_records schema + harness scaffold
**2026-08-30 · Milestones 1–2 of the Phase 0 handoff (spec v0.2, Step 3 rulings 2026-08-30)**

Plain-language summary of what was built, the judgment calls that need Iddo's
eyes, and the one blocked item. No campaign was run, no BASELINE tag exists,
no UI or prompt behavior changed.

## What was built and where

**Milestone 1 — schema + records**
- Envelope + four payload kinds (encode / translation / evolve_step /
  judgment): `src/research/types.ts`. Includes `declared{fixed,varied,
  stochastic,measured}`, `pass1_input_mode`, `step_input_mode`, raw + parsed
  output fields, `parse_status`/`failure`.
- v6 ontology ids + Phase-0 mapping (ruling R3): `src/research/ontology.ts`.
- Content hashes (sha256, key-sorted deterministic serialization):
  `src/research/hashing.ts`; reproducibility proven in
  `src/research/hashing.test.ts` (fixed digests, key-order invariance).
- Write path: `src/research/writeResearchRecord.ts` — single function,
  validates before write; invalid payloads are written as
  `parse_status: "failed"` with the original preserved; invalid envelopes
  throw. Rules make both collections create-only for the `research: true`
  custom claim and deny update/delete to **everyone** (admin included):
  `firestore.rules` here + the deployed twin in `archthesis/firestore.rules`.
  Per ruling R5 the archthesis change ships as its own PR (rules file alone)
  which must NOT be merged by the model — the PR link is in the summary that
  delivered this report.
- JSONL export: `scripts/research/export.ts` (filter by batch / experiment /
  kind; each line carries `_doc_id`).

**Milestone 2 — harness scaffold**
- Headless CLI: `scripts/research/run.ts` + `scripts/research/lib/*`,
  calling the app's inner functions only (`parseAndRoute`, the validators,
  `makeAnthropicCaller`/`makeOpenRouterCaller`, `buildUserMessage`,
  `composeTranslationPrompt`, `mapMemeToCuboidInput`) — never the Vercel
  handlers, never UI code paths (ruling R6).
- Matrix runner: corpus × model × cells(a/c) × replicate, deterministic
  ordering, resumable by batch_id (deterministic Firestore doc ids,
  existence-checked). Model routing explicit per cell — never inferred.
- Frozen input: E2 cell (c) via assistant prefill (R1), E3 state
  hash + request reconstruction (R2) in `scripts/research/lib/evolveState.ts`.
- Cost governance: `--dry-run` (verified: 18-cell toy matrix ≈ $0.53, zero
  network), `--budget-cap`, per-record `cost_usd_estimate`.
- Corpus (2026-08-30 addition #1): raw `memes` collection via REST
  `listDocuments`; the batch record stores `raw_collection_count` next to
  `used_count` with the filter spelled out.
- Ghost fields (addition #2): meme `content_hash` covers what each document
  actually stores (minus mutable `likes`/`hidden`/`timestamp`), never the
  declared type's defaults; `topText`/`bottomText`/`userId` are hashed only
  when a legacy doc really carries them. Covered-field lists are recorded
  per meme in the batch record.

**Definition of done** — tests all green (`npm test`, 52 files):
(a) hash reproducibility ✓ (b) envelope validation, all four kinds ✓
(c) append-only rules vs emulator ✓ (`npm run test:rules`;
`scripts/research/rules.emulator.test.ts`) (d) frozen-input round-trip ✓
(e) cell-(c) prefill parses through the existing validator ✓ (f) `ontology`
valid on every test record ✓ — plus the dry-run table (DoD 2) ✓.

## Rulings conflicts (stop-and-report items)

1. **R4 is already satisfied — no edit made.** R4 says to add a
   `# version: 1` header to `src/prompts/spatial-encoding-grammar.md`. The
   file **already carries `# version: 5`** (since 2026-08-01; the spec
   footer's "no header" note and its `grammar_version_declared: 4` example
   are stale). Adding a second header would be wrong, so the only permitted
   prompt-file edit was **not** made: zero prompt files changed, and
   `grammar_version_declared` reads "5" through the existing
   `parsePromptVersion`. *Ruled 2026-08-30: no action — confirmed.*
2. **E2 cell (b) — RESOLVED (Iddo, 2026-08-30): dropped as separate runs.**
   The shipped two-pass is one model call, so a true "Pass 1 only" run is
   impossible without a prompt variant (forbidden in Phase 0). Per the
   ruling, the E2 decomposition comes from cells (a) and (c) alone: (a)'s
   Pass-1 marginals carry the reading-variance component, (c) carries
   translation-variance-given-a-fixed-reading. Implemented: the matrix is
   cells (a, c) only, and a batch config naming "b" is rejected with a
   message citing this ruling. The envelope/payload schema needed no change
   (`pass1_input_mode` already distinguishes the two remaining cells).
3. **Deliverer id.** R3 defines deliverer as "the actor whose call produced
   the record" → `architect` (the harness) on every Phase-0 record. The v6
   arrow-colour law would instead attribute model output to `llm`. The
   ruling's literal text was followed; say the word and it flips.

## Spec tensions (rule 1 / rule 5 — proposed, not silently decided)

- **`raw_response` + `attempts[]` on model-call payloads.** The spec's payload
  prose lists only per-pass raw+parsed, but principles 1 ("raw model output
  verbatim") and 4 ("never silently retried out of the dataset") require the
  full response text of *every* attempt — the app pipeline retries once on a
  parse failure and once on a validation failure, and per-pass slices can't
  reconstruct the one-call wire text. Resolved toward the principles; the
  fields are additions to the payload prose, flagged here for approval.
- **Cell identity has no schema slot.** (a) vs (b) cells are byte-identical
  in payload, so cell identity lives in the deterministic Firestore document
  id (scheme documented in the batch record; `_doc_id` rides along in the
  JSONL export). **Proposal:** an optional `cell` envelope field in a future
  schema rev — not committed, per rule 5.
- **The batch record.** "Record the raw count next to the used count in the
  batch record" (2026-08-30) implies a batch-level record; the spec defines
  none. Implemented as an append-only `research_batches` collection (one
  manifest per batch: corpus counts + per-meme hashes, matrix, regime,
  doc-id scheme, cost estimate). Flagged as the interpretation taken.
- **`engagement_at_run`** is stored as `{likes, engagement_level}` — the raw
  count and the 0-100 log-scale value the prompt actually received (the spec
  names the field without fixing its type).
- **Not added (proposed only):** meme image *byte* hashes on translation
  records (the spec lists image hashes for encode only; the meme image
  reaches the model, so its bytes are technically an unhashed mutable input —
  the imageUrl string is inside the content hash), and real token usage
  (the transports discard the providers' usage blocks; a no-behavior-change
  extension could return them — see refactor list).

## Frozen-input refactor report (the "stop and report" clause)

- **E2 cell (c): NO pipeline modification was needed.** Changes to
  `api/translate-meme.ts` are limited to (i) `export` keywords on
  already-existing helpers (R6's sanctioned no-behavior-change refactor) and
  (ii) an optional `assistantPrefill` field on `CallerOpts`, implemented in
  both transports as a trailing assistant message — **inert for the app**
  (nothing app-side sets it; requests are byte-identical when absent). This
  kept one shared transport instead of a diverging research copy.
  `api/fetch-memes.ts` similarly only gained `export` keywords (constants,
  `extractValue`, `docToMeme`).
- **E3 step mode: partially ready, campaign mode blocked (R2).** Ready now:
  state schema, `hashEvolveState`, and exact request reconstruction from a
  frozen state's resolved assignments (`lib/evolveState.ts`), because
  `mapMemeToCuboidInput` and `computeCompressibility` are pure libs. Blocked,
  per R2 "report the exact refactor and wait":
  1. `pickTargetCubes` in `src/store/useEvolutionStore.ts` is module-private —
     needs `export` (no behavior change).
  2. The generation loop (meme sampling, candidate assembly, simulated
     scoring, ranking) lives inside `useEvolutionStore.generateCandidates()`
     — a UI code path. Extract it into a pure
     `src/lib/evolution/generation.ts` (inputs: placed cubes, operators,
     pool, config, an injectable random source; outputs: assignments +
     ranked candidates), with the store becoming a thin caller. Also needed
     for capturing a `FrozenEvolveState` from the app.
  3. `Math.random()` in sampling/target-picking needs an injectable RNG if
     campaign replay is ever to be seedable (harness-only concern).
  *Ruled 2026-08-30: refactor approved, behavior-preserving, as its own PR*
  — it ships separately from this change; the E3 runner gets wired after
  that PR lands. Until then the E3 runner stays a stub.

## Adversarial review round (pre-push)

A 44-agent review (four lenses — rulings, spec, correctness, regression —
each finding verified by two independent skeptics) ran over the diff before
push. Confirmed findings, all fixed in this same change:

- The prefill probe accepted any successful response as "supported" — a
  provider that ignores the trailing assistant message would have burned
  every cell-(c) replicate. The probe now accepts only a demonstrated
  continuation (`probeContinuationOk`), and a transient probe error (429,
  5xx, network) aborts resumably instead of being recorded as "provider
  cannot prefill" in the append-only dataset.
- A batch config omitting `composition_ref`/`target_cube`/`language` would
  have poisoned every record to `parse_status: "failed"` after the model
  spend — omitted fields now normalize to null (wrong types still fail fast).
- Cell (c) would inherit a Pass 1 from a FAILED cell-(a) record; the default
  frozen source now requires `parse_status: "ok"` (a failed reading must be
  pinned deliberately). An unavailable frozen source now defers that one
  cell (no write, resumable) instead of wedging the whole batch.
- Resuming a batch_id after a prompt/lexicon/meme/site change would have
  silently mixed regimes — resume now verifies current hashes against the
  stored batch manifest and refuses on drift.
- `site_context_hash` now hashes the exact injected prompt string, so two
  records share the hash iff their prompts carried the same bytes (the
  canonical-object hash was key-order-invariant while the prompt text wasn't).
- Anthropic-direct cells with a non-normalizable model id would have been
  silently served by `claude-sonnet-4-6` while the record claimed the
  configured model — the harness now refuses such configs up front, and it
  pre-flights every meme image so the transport's silent text-only fallback
  can't quietly change the experiment.
- Record coherence: `raw_response`/pass slices now always describe the same
  attempt as `failure` (a kept validation error is described by the attempt
  that parsed, not by an unparseable corrective retry); every attempt stays
  verbatim in `attempts[]` regardless.
- A hidden meme in an explicitly configured `meme_ids` list now errors
  instead of silently shrinking the matrix; `canonicalJson` refuses
  non-plain objects (Date/Map/Set) instead of hashing them as `{}`;
  `MAX_TOKENS_TWO_PASS` is imported from the app instead of duplicated.

- `firebase.json` initially mapped `firestore.rules`, which would have let a
  stray manual `firebase deploy` from this repo ship the reference ruleset
  (which lacks archthesis's own blocks) over the live one. The mapping is
  removed — the rules-unit-testing harness loads rules programmatically, so
  the emulator test still runs (verified) and a stray deploy now has no
  Firestore target.

## Also worth knowing

- New dev dependencies: `tsx` (runs the TS CLIs) and
  `@firebase/rules-unit-testing` (emulator rules test). A minimal
  `firebase.json` exists **only** so `npm run test:rules` can start the
  emulator — it deliberately maps no rules file, so nothing can deploy from
  it (Cuboid deploys via Vercel; rules deploy from archthesis).
- `vitest.config.ts` now also includes `scripts/research/**/*.test.ts`.
- The research identity is a client-SDK user with a `research: true` custom
  claim (grant: `admin.auth().setCustomUserClaims(uid, {research: true})`) —
  deliberately not firebase-admin, so append-only is enforced server-side
  even for the researcher.
- Prompt-assembly parity with the handler is tested, including the shipped
  quirk that with no site context the literal `{site_context}` placeholder
  stays in the prompt (measured as-is, per rule 3).
