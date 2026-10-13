# BASELINE-1

Freeze record for Phase 0 BASELINE-1 (ruling: Iddo, 2026-10-11, option A — E2 on a composition the app already encoded).

| | |
|---|---|
| Date | 2026-10-11 |
| Code | `721c27629d81c234b35eb7a05861108f8ad410e9` (main, merge of iddonaim/cuboid-studio#163), git tag `BASELINE-1` |
| Batch | `e2-base-001` — config `scripts/research/examples/e2-base-001.batch.json` |
| Model | `anthropic/claude-sonnet-4.6` (Anthropic direct, Message Batches API) |
| Design | E2, cells (a) and (c); N = 10; (c) pins every (a) replicate (10 pins × 10 replicates per meme); 45 memes (raw collection 46, `hidden === true` excluded); 4,950 records |
| Budget cap | $120 (dry-run worst case $101.78, best case $43.79) |

## Regime hashes (sha256)

| | |
|---|---|
| Two-pass translation prompt (`src/prompts/pataphysical-translation-v2.md`, declared version 4) | `2e3fcb6ca5844e860f7f18426a08dd455a4baa20f737c4f4199fdbf638bda033` |
| Translation lexicon (built-in default) | `4847980b55b2102fe52db4263cf82a54739c71e2825e8c21de16833938f85f59` |
| Spatial-encoding grammar (`src/prompts/spatial-encoding-grammar.md`, declared version 5) | `0c9b87574bcc257295f68ac3624eff49f9cee1f6c2af2488c95abf2f177336ac` |
| Spatial lexicon | `e1c2588a9fa8eb7f41e5bb375679e37e645a6cb62ed7f10ed5a6c7e93f8b94b9` |

## Composition

| | |
|---|---|
| Composition id | `NSCSM9TXSN0KhhvnhGkJ` ("נחלת יצחק 16") |
| Project / site | `MO0Vd4P8eMMkL4VsCZmn` / `w360Y6L05TxfR3zBa776` |
| Target cube | none (null) |
| Site-context hash (sha256 of the exact site-context string in the prompt) | `129cd04cd42edd38cf649c9e3f95bf01bd576aa88fa44deec458747bde978fd2` |
| Pin file | `scripts/research/examples/compositions/NSCSM9TXSN0KhhvnhGkJ.json`, sha256 `889ecad60a72b3651fffe945fb51e522bf17fe355fb879f2c66987bc774f08e2` |
| Stored composition document (sha256 at dump, 2026-10-11T12:40:49Z) | `15c60b38667e6d24a565bd790a629a90d680c89df9abeae12b6b7ef936823ab7` |
| Encode photos (full-resolution sha256) | `57fa3269…99208`, `e139eef9…a0c83`, `9be964de…63550` (primary), `1f717898…cdb5` — full values in the pin file |

Every record of `e2-base-001` carries `baseline_tag: "BASELINE-1"`, `composition_ref: "NSCSM9TXSN0KhhvnhGkJ"`, `target_cube: null` and the site-context hash above; the batch record in `research_batches/e2-base-001` carries the full manifest. Exports: `research-data/e2-base-001/`.

## Note: records stamped with a different commit (round 2b)

The 1,000 records written by the collect of round 2b (Anthropic batch `msgbatch_01Qw4Ut3Yp2A6dFWjspkGzJC`, collect run https://github.com/iddonaim/cuboid-studio/actions/runs/38156374175) carry `app_commit: "157cf49a255c0259efd18313e77605c24d19dc1d"` instead of `721c276…`. That collect was dispatched from `main` after iddonaim/cuboid-studio#164 merged.

`157cf49` differs from `721c276` only in `vercel.json` (one file: a Vercel setting that stops deployments of the `research-data` branch). The research harness does not read `vercel.json` — nothing under `scripts/research/` or `src/research/` or the research workflow references it — so all 4,950 records of `e2-base-001` come from identical harness code, prompts, lexicons, rules and grammar. The regime hashes above are unchanged.

## Completion (2026-10-12)

`e2-base-001` is complete: 4,950 of 4,950 records written (450 cell (a), 4,500 cell (c)), all unique.

| | |
|---|---|
| Records | 4,950 (450 (a), 4,500 (c)) |
| Failures | 0 — every record `parse_status: "ok"` |
| Retries | 4 records needed one retry each; all succeeded on it |
| Cost | ≈ $52.08, from billed token usage in the export (batch rates, 50% discount, caching as billed); dry-run estimate was $43.79 best / $101.78 worst; cap $120 |
| Code | 3,950 records `721c276`; 1,000 records (round 2b) `157cf49` — see the note above. Rounds 2c onward were dispatched from tag `BASELINE-1` |
| Final export | `research-data` commit `9abcc59` |

| Round | Cell | Anthropic batch id | Requests |
|---|---|---|---|
| 1 | a | `msgbatch_01U9orY89NvCYxkDeSujKE2D` | 450 |
| 2a | c | `msgbatch_01KUuZakBJsxuJypcjKiB5Xb` | 1,243 |
| 2b | c | `msgbatch_01Qw4Ut3Yp2A6dFWjspkGzJC` | 1,000 |
| 2c | c | `msgbatch_015ftXYjyUk4AiSE4qLriVPE` | 555 |
| 2d | c | `msgbatch_01453uNuJTBbvLZibhfca4tr` | 373 |
| 2e | c | `msgbatch_01PFXmsoznHnuixbeQVUU269` | 1,212 |
| 2f | c | `msgbatch_017DaAYwg2EN4em4drBUz6WT` | 117 |

Round sizes vary because each round is capped at 200 MB of requests; the cap does not affect what is sent per request.

Exports:
- CSV: https://github.com/iddonaim/cuboid-studio/blob/research-data/research-data/e2-base-001/e2-base-001.csv
- JSONL (gzip): https://github.com/iddonaim/cuboid-studio/blob/research-data/research-data/e2-base-001/e2-base-001.jsonl.gz
- Tag: https://github.com/iddonaim/cuboid-studio/releases/tag/BASELINE-1
