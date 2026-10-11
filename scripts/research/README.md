# Phase 0 research harness (`research_records`)

Data layer + batch-runner scaffold for the Phase 0 baseline characterization
(`phase0-baseline-spec.md` v0.2, handoff of 2026-08-14, Step 3 rulings of
2026-08-30). **Scaffold only — running a campaign is a separate,
human-initiated step, and no BASELINE tag exists yet.**

## What lives where

| Piece | Path |
|---|---|
| Envelope + payload types (4 kinds) | `src/research/types.ts` |
| v6 ontology ids (ruling R3) | `src/research/ontology.ts` |
| Content-hash utilities | `src/research/hashing.ts` |
| Verbatim pass-slice extraction | `src/research/jsonSlice.ts` |
| Schema validation | `src/research/validate.ts` |
| The single write path | `src/research/writeResearchRecord.ts` |
| Security rules (reference copy) | `firestore.rules` (deployed twin: `archthesis/firestore.rules`) |
| Batch runner CLI | `scripts/research/run.ts` |
| JSONL export CLI | `scripts/research/export.ts` |
| Batch export (JSONL + CSV → `research-data/`) | `scripts/research/lib/exportBatch.ts` |
| Corpus / matrix / costs / cell executor | `scripts/research/lib/` |
| E3 frozen-state schema + parser + ranking (R2) | `scripts/research/lib/evolveState.ts` |
| E3 step-mode executor | `scripts/research/lib/evolveStep.ts` |
| Anthropic Message Batches mirror (parity-tested) | `scripts/research/lib/anthropicBatch.ts` |
| Batch submit/collect rounds + submission docs | `scripts/research/lib/batchTransport.ts` |
| Headless runner (workflow_dispatch) | `.github/workflows/research-batch.yml` |
| Toy batches (dry-run fixtures, E2 + E3) | `scripts/research/examples/` |

## Commands

```bash
# Price a batch without calling any model or touching Firestore:
npm run research:run -- --config scripts/research/examples/e2-toy.batch.json --dry-run
npm run research:run -- --config scripts/research/examples/e3-toy.batch.json --dry-run
# …priced as it would route through the Anthropic Batch API (50% discount +
# prompt caching), with the sync figure kept for comparison:
npm run research:run -- --config <batch.json> --dry-run --transport batch

# Execute a batch (requires env below; resumable by batch_id — completed
# cells are skipped; --budget-cap aborts when the estimate is exceeded).
# --operator records who launched it (a human name or a session identifier):
npm run research:run -- --config <batch.json> --execute --operator "<who>" [--budget-cap 25]

# Same batch through the Anthropic Message Batches API (anthropic-routed
# models only; identical records, doc ids, hashes and failure handling):
npm run research:run -- --config <batch.json> --execute --transport batch --operator "<who>"   # submit a round
npm run research:run -- --config <batch.json> --collect --operator "<who>"                     # collect it later
# An E2 batch is typically two rounds: submit/collect the (a) cells, then
# submit/collect the (c) cells (their frozen Pass-1 sources are the round-1
# records). --collect says what is still processing / pending; re-run it and
# the next submit until "nothing to submit" + nothing awaiting.

# Export a batch to research-data/<batch_id>/ (JSONL + CSV; see "Export
# protocol" below). --collect does this itself after every collect:
npm run research:export -- --batch <batch_id> --research-data

# Ad-hoc filtered JSONL (not the protocol export):
npm run research:export -- --batch <batch_id> --experiment E2 --kind translation --out out.jsonl

# Verify the append-only rules + batch rounds against the Firestore emulator:
npm run test:rules
```

## Headless runs (GitHub Actions)

`.github/workflows/research-batch.yml` is a `workflow_dispatch` runner for
exactly one step per dispatch: `dry-run` (default, no spend), `submit`,
`collect`, or `export`. The first three take a repo-relative config path and
a budget cap; `export` takes a `batch_id`. All take an optional operator
(defaults to the dispatching GitHub username + run id). `collect` and
`export` commit the batch's export to the `research-data` branch (see
"Export protocol").
State lives in Firestore (batch record + append-only `__submission__` docs),
so submit and collect can run on different days and runners — everything is
resumable by `batch_id`. Repository secrets to set (names, exactly):

| Secret | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key (submit/collect + collect-time sync retries) |
| `OPENROUTER_API_KEY` | OpenRouter key (openrouter-routed cells; unused by batch rounds) |
| `FIREBASE_API_KEY` | the Firebase **web** API key (the public client key the app ships) |
| `FIREBASE_PROJECT_ID` | the Firebase project id |
| `RESEARCH_USER_EMAIL` | the research identity's email (custom claim `research: true`) |
| `RESEARCH_USER_PASSWORD` | its password |

Secret values are passed to the harness as env only; the harness never
prints them, and GitHub masks them in logs regardless.

## Export protocol — a batch is not finished until it is exported

Every successful `--collect` rewrites the batch's export from the database,
and the workflow commits it — nobody has to remember a separate step. The
same export runs on demand for any batch (`research:export -- --batch <id>
--research-data`, or the workflow's `export` mode), e.g. for batches
collected before the protocol existed. Re-exporting rewrites both files in
full from Firestore; records in the database are only ever read.

- **Where:** the `research-data` branch of this repo (never `main`). The
  workflow creates it as an orphan branch on first use, so it holds only
  `research-data/<batch_id>/` folders. One commit per export, message
  `research-data: <batch_id> — <N> records`; an unchanged export makes no
  commit. Locally the files land in `research-data/<batch_id>/` of the
  working copy (don't commit them to `main`).
- **`<batch_id>.jsonl` — the artifact of record.** One line per record:
  `_doc_id` (the Firestore document id, which encodes the cell identity)
  plus every stored field — envelope, payload, raw model text, every
  attempt, usage. Keys are sorted, so an unchanged re-export is
  byte-identical. Analyses run on this file.
- **`<batch_id>.csv` — the reading copy.** One flat row per record, failed
  records included, UTF-8 with a byte-order mark (spreadsheet apps show the
  Hebrew without an import step). Derived from the same records; never the
  source of truth. Columns, in order:

| Column | From |
|---|---|
| `record_id`, `doc_id`, `batch_id`, `experiment`, `kind`, `replicate_index` | envelope (`doc_id` = Firestore id) |
| `cell` | `a`/`c`, read from `doc_id`; blank for E3 |
| `meme_id`, `language` | payload |
| `model_id`, `model_provider` | envelope `model` |
| `status` | `ok` / `failed` (`payload.parse_status`) |
| `pass1_input_mode`, `pass1_freeze_method`, `prefill` | how Pass 1 was obtained |
| `run_operator` | who launched the batch (the batch record's `operator`) |
| `pass2_operator` | Pass 2's operator class |
| `cutter`, `cutter_proportions`, `cutter_position`, `cutter_rotation` | Pass 2 cutter (type; three `[x,y,z]` vectors) |
| `targets` | Pass 2 targets, `; `-separated |
| `magnitude`, `decay` | Pass 2 |
| `confidence_rhetorical_clarity`, `confidence_site_resonance`, `confidence_affective_coherence`, `confidence_operational_specificity` | Pass 2 confidence vector |
| `pass1_meme_summary` | Pass 1's one-line reading |
| `attempts` | number of model calls the record made (retries included) |
| `cost_usd_estimate` | the harness's estimate |
| `usage_input_tokens`, `usage_output_tokens`, `usage_cache_creation_input_tokens`, `usage_cache_read_input_tokens` | real billed tokens where the transport reported them (batch-collected records) |
| `created_at` | envelope |
| `failure_stage`, `failure_reason` | blank when `status` is `ok` |
| `baseline_tag` | envelope |

Pass-2 columns are blank for failed records and for non-translation kinds.

## Environment (execute/export only — dry-run needs nothing)

- `ANTHROPIC_API_KEY` and/or `OPENROUTER_API_KEY` — per each cell's **explicit**
  routing (`models[].provider` in the batch config; routing is never inferred).
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID` (or unprefixed forms).
- `RESEARCH_USER_EMAIL`, `RESEARCH_USER_PASSWORD` — the research identity: a
  normal Firebase user carrying the `research: true` custom claim. Grant once
  with the Admin SDK, the same way archthesis grants `admin`:
  `admin.auth().setCustomUserClaims(uid, { research: true })`.
  The harness signs in as this user through the **client** SDK on purpose —
  admin credentials would bypass the security rules, and append-only should
  hold server-side even for the researcher.

## Design points worth knowing

- **Corpus source is the raw `memes` collection** (REST `listDocuments`),
  never `/api/fetch-memes` — that endpoint orders by `createdAt` and Firestore
  silently drops documents missing the ordered field. The batch record stores
  the raw collection count next to the count actually used, plus the filter
  applied (`hidden !== true`).
- **Meme content hashes cover wire truth**: the fields each document actually
  stores (minus mutable state: `likes`, `hidden`, `timestamp`), not the
  declared `ArchthesisMeme` type. Ghost fields (`topText`/`bottomText`/
  `userId`) are hashed only when a legacy doc really stores them. Each hash's
  covered field list is recorded in the batch record.
- **E2 cell (c) = Pass 1 frozen in the user turn** (ruling R1; mechanism
  revised 2026-10-10): the unchanged system prompt, and the user turn =
  the meme message + a short wrapper + the stored Pass-1 object verbatim
  (`buildPass1FreezeBlock` in `lib/translationCell.ts`). The model returns
  the Pass-2 object alone; the record keeps that reply verbatim, and only
  for parsing/validation the harness composes `[` + stored Pass 1 + `,` +
  reply + `]` so the app's parser and two-pass validator run unchanged.
  Retries carry the same user message, so the frozen Pass 1 survives them.
  Records carry `pass1_input_mode: "frozen:<record_id>"` and
  `pass1_freeze_method: "user_message_v1"` (with `prefill: false`). The
  original mechanism — prefilling the assistant turn — is retired: current
  Claude models reject assistant prefill outright (all 9 (c) records of
  `e2-toy-001` failed on it). Those records are identifiable as frozen
  records with `prefill: true` and no `pass1_freeze_method`. No per-model
  prefill probe exists any more; the user-turn freeze works for every
  model the same way.
- **Runs exit on their own**: `run.ts` and `export.ts` call `process.exit` once their work is
  done — the Firebase client keeps its Firestore channel and auth timers
  open, which otherwise kept every finished CI run alive until the job limit.
- **Cell identity lives in the Firestore document id**
  (`<batch>__<exp>__translation__<meme>__<provider>_<model>__cell-<x>__r<n>`),
  not in the record schema — the spec envelope has no cell field. The batch
  record documents the scheme; resume = existence check on the id.
- **E3 step mode = frozen-state replay** (ruling R2): an E3 batch replays
  one `FrozenEvolveState` (`e3.state_file`) N times — every candidate call
  rebuilt from the state's resolved assignments, ranked with the app's own
  compression-progress scoring (`src/lib/evolution/generation.ts`), the
  state's declared criterion selecting the winner. Site-context, lexicon,
  pool-content and state hashes are all verified before any spend.
  **Capturing a state**: the Evolve panel's "Export frozen state (research)"
  action (below the candidate list, enabled once a generation exists)
  downloads the state file — and, when a site is active, a companion
  site-context file to point the batch config's `site_context_file` at.
  The export is self-checked through the same parser the replay runs, and
  meme content hashes come from the raw documents, so a captured state is
  accepted-by-construction. Campaign mode is still a stub.
- **Failures are data**: refusals, malformed JSON, timeouts and the
  pipeline's own retries are all recorded verbatim (`attempts[]`), and
  schema-invalid payloads are written as `parse_status: "failed"` with the
  original preserved. Only a schema-invalid *envelope* throws.
- **Append-only**: creates only; `update`/`delete` denied for everyone —
  research and admin claims included — in both rules files.
- **Batch transport = the same pipeline, split in two** (2026-09-04). Submit
  runs the normal executor with a transport that CAPTURES the request and
  throws instead of calling — the submitted params are built by the exact
  code path that later interprets the response (`lib/anthropicBatch.ts` only
  mirrors the wire encoding, pinned byte-for-byte by
  `anthropicBatch.parity.test.ts`). Collect re-runs the executor with the
  stored result replayed for the initial call; parse/validation retries fall
  through to the real sync caller, so failure handling is identical by
  construction. Before any result is attached, the request params are
  rebuilt and hash-compared against the submission doc (a result never lands
  on a request the harness can't reproduce). Batch-collected records differ
  from sync ones in three appended `declared` lines (transport, batch
  scheduling, usage measurement) and an optional `usage` block — the real
  billed token counts summed over batch-replayed calls, with
  `calls_covered`/`calls_total` making explicit that sync retries and
  sync-filled slots report none (additive schema change, approved
  2026-09-04); `timing_ms` there measures collect-time replay, not model
  latency. Expired/canceled slots billed nothing and re-enter the next
  submit round; an E3 step with a partial expiry sync-fills only the missing
  candidates. One submission may be open at a time per batch; submission
  docs (`<batch_id>__submission__NNN` in `research_batches`) are append-only
  provenance carrying the Anthropic batch id, per-call params hashes,
  the operator, and both cost bounds. Budget caps gate on the WORST-case
  (no-cache-hit) batch estimate, which never exceeds the sync estimate.
