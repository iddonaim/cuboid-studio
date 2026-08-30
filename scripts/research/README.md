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
| Corpus / matrix / costs / cell executor | `scripts/research/lib/` |
| E3 frozen-state support (R2) | `scripts/research/lib/evolveState.ts` |
| Toy batch (dry-run fixture) | `scripts/research/examples/` |

## Commands

```bash
# Price a batch without calling any model or touching Firestore:
npm run research:run -- --config scripts/research/examples/e2-toy.batch.json --dry-run

# Execute a batch (requires env below; resumable by batch_id — completed
# cells are skipped; --budget-cap aborts when the estimate is exceeded):
npm run research:run -- --config <batch.json> --execute [--budget-cap 25]

# Export records as JSONL (filterable):
npm run research:export -- --batch <batch_id> --experiment E2 --kind translation --out out.jsonl

# Verify the append-only rules against the Firestore emulator:
npm run test:rules
```

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
- **E2 cell (c) = assistant prefill** (ruling R1): the unchanged prompt, the
  assistant turn started with `[` + the stored Pass-1 verbatim + `,`. Records
  carry `pass1_input_mode: "frozen:<record_id>"`, `prefill: true`, and the
  prefill's content hash. Non-Anthropic OpenRouter providers are probed once;
  unsupported → cell (c) skipped for that model with a recorded reason.
- **Cell identity lives in the Firestore document id**
  (`<batch>__<exp>__translation__<meme>__<provider>_<model>__cell-<x>__r<n>`),
  not in the record schema — the spec envelope has no cell field. The batch
  record documents the scheme; resume = existence check on the id.
- **Failures are data**: refusals, malformed JSON, timeouts and the
  pipeline's own retries are all recorded verbatim (`attempts[]`), and
  schema-invalid payloads are written as `parse_status: "failed"` with the
  original preserved. Only a schema-invalid *envelope* throws.
- **Append-only**: creates only; `update`/`delete` denied for everyone —
  research and admin claims included — in both rules files.
