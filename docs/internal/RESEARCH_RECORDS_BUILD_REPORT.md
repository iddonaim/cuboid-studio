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
  *Ruled 2026-08-31: the likes loophole stays as is.* Likes are live platform
  state: the meme content hash deliberately excludes them, they are
  snapshotted at corpus load, and a resumed batch re-reads them — so the
  engagement a prompt receives is not pinned by any hash and can drift
  between capture, run, and resume. Per the ruling this is not enforced
  away; instead `engagement_at_run` is declared **reported-not-measured** in
  every pre-registration default (E2 cells and E3 steps): it is provenance,
  never a controlled condition or an outcome, and no analysis may treat it
  as either without labeling the move exploratory (spec principle 6).
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
- **E3 step mode: WIRED (Iddo's go, 2026-08-31).** One evolve_step record =
  one replayed generation-step from a frozen state: assignments fired
  through the app's transports/validator, candidates kept raw+parsed with
  per-candidate attempts, ranking scored with the extracted generation lib,
  the state's declared criterion (`max-compression-progress`) selecting the
  winner. The state schema gained `composition.cube_operators` (the full
  per-cube operator history — `operator_count` alone cannot reproduce
  ranking scores); site-context, lexicon, pool-content and state hashes are
  verified before any spend, and resume re-verifies the state hash against
  the batch manifest. *In-app capture approved and built 2026-08-31*
  (minimal, per the ruling: ONE export action in the Evolve panel, no other
  UI change): it fetches each referenced meme's raw document for wire-truth
  hashing, self-checks the state through the harness's own parser, and
  downloads the state file plus — when a site is active — the companion
  site-context file the batch config points at. The frozen-state schema
  moved to `src/research/evolveState.ts` so capture and replay share one
  source (the scripts module re-exports it); the Firestore REST decoder
  likewise moved to `src/research/firestoreRest.ts` with `api/fetch-memes.ts`
  re-exporting. Still absent: CAMPAIGN mode. The refactor that unblocked
  step mode (below) shipped as its own PR per the ruling:
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
  — shipped and merged as cuboid-studio#155; the step-mode runner above is
  built on it. `EvolveCandidateRecord` gained an optional `attempts[]`
  (same principle-1/-4 grounds as the translation payload's attempts —
  flagged here like the others).

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

## Batch API transport + headless runner (2026-09-04 instruction)

Scope as instructed: one PR; no changes to app code, prompts, lexicons, or
the record schema. `--transport batch` submits a batch's model calls through
the Anthropic Message Batches API; `--collect` retrieves results and writes
records exactly as the sync path does; the dry-run prices the actual route
(batch discount + prompt-caching reads, sync kept for comparison); a
`workflow_dispatch` Action runs one round per dispatch; the batch record
gains `operator`.

### How "same records, same hashes, same failure handling" is enforced

- **Submit = the normal executor with a capturing transport.** The request
  params are built by the same code path that later interprets the response
  (prompt assembly, prefill resolution, `parseAndRoute`); nothing is written
  at submit time. `lib/anthropicBatch.ts` mirrors only the wire encoding of
  `makeAnthropicCaller`, and `anthropicBatch.parity.test.ts` pins that
  mirror byte-for-byte by patching `fetch` and diffing against the real
  caller's body (images, prefill, model normalization, version header,
  response handling and its exact error messages). If the app transport ever
  changes, the parity suite fails before a divergent batch can be submitted.
- **Collect = the normal executor with a replaying transport.** The stored
  result answers the initial call; a parse/validation retry falls through to
  the real sync caller (same retry policy, image dropped from retries
  exactly as the sync caller does). Records come out shape-identical —
  the emulator round-trip suite (`batchRounds.emulator.test.ts`) drives a
  full E2 a→c two-round flow and E3 steps end to end and compares.
- **Request identity is hash-verified before any result is attached**: the
  submission doc stores sha256 of every submitted request body; collect
  rebuilds the body from current inputs and refuses on mismatch (observed
  live in the test by moving image bytes under a stable URL). A result is
  never written onto a request the harness can no longer reproduce.

### Decisions taken (flagging for review, not blocking)

1. **Collect-time sync retries.** `parseAndRoute`'s corrective retries
   cannot happen inside a one-shot batch; the alternatives were (a) freeze
   batch records at one attempt (different failure handling than sync) or
   (b) let retries run synchronously at collect time (identical failure
   handling, small sync spend at collect). (b) was chosen as the literal
   reading of "same failure handling"; retries are rare (parse/validation
   failures only). If (a) is preferred, it is a small change.
2. **Anthropic-routed models only.** OpenRouter has no batch API. A config
   mixing providers is refused under `--transport batch` with instructions
   to split — nothing is silently rerouted (explicit-routing rule).
3. **E2 needs two rounds.** Cell (c) prefills the stored Pass-1 of this
   batch's cell (a) r0 record (R1), which exists only after the first
   collect — so submit defers (c) cells exactly like the sync path's
   frozen-source defer, and a second submit/collect round completes the
   matrix. Not a new semantic: it is the existing defer rule under a
   transport where "later" is a separate command.
4. **Expired/canceled slots** (the API bills nothing for them) void back to
   pending and resubmit next round. An E3 step with a PARTIAL expiry
   sync-fills only the missing candidates at collect, so paid results are
   not discarded; a fully-expired unit defers whole.
5. **Declared lines, not schema.** Batch-collected records append two
   `declared` lines (fixed: transport + cache_control note; stochastic:
   batch scheduling, replay-not-latency `timing_ms`, best-effort cache
   hits, sync retries at collect). Sync records are byte-unchanged. The
   envelope schema is untouched.
6. **`cost_usd_estimate` on batch records = the worst-case (no-cache-hit)
   batch figure** — deterministic and conservative; both bounds plus the
   sync comparison live in the submission doc. The batch record's
   `cost_estimate_usd` stays sync-basis for cross-transport comparability
   (noted inside the record).
7. **Budget caps gate on the worst-case batch estimate** per round
   (submit) and per run (collect) — consistent with the sync loop's
   per-invocation semantics. Worst-case batch never exceeds sync (1h cache
   write ×2 halved = ×1 on the system prompt; everything else halved).
8. **Prompt caching**: `cache_control {type: ephemeral, ttl: 1h}` on the
   shared system prompt only — billing metadata, not prompt content (the
   parity test asserts strip-and-unwrap equals the sync body). 1h TTL per
   the batch docs' recommendation; hits are best-effort and both pricing
   bounds are always shown. Below the 1024-token cache minimum the
   estimator prices without caching and says so.
9. **Operator provenance under append-only.** `operator` on the batch
   record names the batch's CREATOR (the record can never be updated);
   every batch submission doc carries its own round's operator. A sync
   RESUME by a different operator is therefore not individually recorded —
   accepted limitation; a run-log collection would fix it but is scope
   beyond the instruction (proposed only, not added). A differing operator
   is deliberately NOT a resume mismatch.
10. **Recovery path**: if the submission doc write fails after the batch
    was created, submit prints the batch id and `--collect
    --anthropic-batch-id <id>` registers it — after verifying every
    result custom_id corresponds to this config's pending calls.

### Pricing facts used (official docs, fetched 2026-09-04)

Batches are GA (no beta header); 50% off input AND output; the discount
stacks multiplicatively with cache multipliers (write 1.25×/5m, 2×/1h;
read 0.1×); ~1024-token minimum cacheable prefix on Sonnet-class models
(below: silent no-op, no premium); results retained 29 days; custom_id
must match `^[a-zA-Z0-9_-]{1,64}$` (ours are hashes of
`<doc id>::<call key>`, so collect can recompute the mapping from the
config alone). Base per-model prices in `MODEL_PRICING` were deliberately
NOT touched (snapshot 2026-08; the user said no model changes — edit there
when list prices move).

### Verified

- 493 vitest tests green (13 parity + 16 transport-behavior new), plus the
  emulator suite (`npm run test:rules`): append-only rules AND the full
  batch round-trips — E2 submit(a)/collect/submit(c)/collect with real
  prefills from round-1 records, one-open-submission refusals, expired
  resubmission with identical custom_ids, image-drift refusal, E3
  per-candidate batching. `tsc` clean over src and the scripts tree.
- Dry-runs: E2 toy $0.5326 sync vs $0.19–0.36 batch; E3 toy $0.2967 sync
  vs $0.12–0.19 batch. No keys or Firestore needed for dry-run.
- NOT verified against the live Batch API (no key in this environment):
  the REST client's request/response shapes follow the current official
  docs and the scripted-API tests; the first real submit should be the toy
  batch with a small `--budget-cap`.

### Usage block approved and added (2026-09-04, second ruling)

Iddo accepted decisions 1–5 above as built and approved the usage proposal
as an ADDITIVE, optional schema change — the one sanctioned addition:
`envelope.usage?` (`UsageInfo` in `src/research/types.ts`) carries the
API's real billed token counts. Only batch-collected records populate it
(`batchUsageForRecord` sums the replayed results' verbatim `usage`
objects); the sync transports still discard usage (app code, unchanged),
so a record's sync-run calls — collect-time retries, sync-filled expired
slots, whole sync runs — report none, and `calls_covered`/`calls_total`
make that partial coverage explicit rather than letting a summed number
quietly understate consumption. A succeeded batch result that later
failed parsing still counts: its tokens were billed. Validation accepts
records with or without the block (absent on every earlier record) and
checks the shape when present; batch-collected records also declare the
measurement (a third appended `declared` line, under `measured`).
Covered by validator tests, transport unit tests (retry raises
`calls_total` not `calls_covered`; E3 sync-fill slots uncovered), and the
emulator round-trips (written E2/E3 records carry the exact summed
block).
