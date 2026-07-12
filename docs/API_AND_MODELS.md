# API & Model Usage Map

> Written 2026-07-12, verified against `main`. Companion to `docs/SYSTEM_MAP.md`.
> This file answers two questions: *which AI models does the system call, via
> which service?* and *what is the strategy for model choice as models change?*

---

## The two AI call paths

Only two things in the whole system talk to an AI model, both in Vercel
serverless functions. API keys never reach the browser.

| | ② Encode (photo → assembly) | ③ Translate (meme → operator) |
|---|---|---|
| **Function** | `api/encode-space.ts` | `api/translate-meme.ts` |
| **Service** | Anthropic API directly — always | **OpenRouter** when `OPENROUTER_API_KEY` is set; Anthropic API as fallback |
| **Model** | `claude-sonnet-4-6` (hardcoded, line ~103) | OpenRouter default: `anthropic/claude-sonnet-4` (`DEFAULT_MODEL`, line 28) · Anthropic fallback default: `claude-sonnet-4-6` |
| **max_tokens** | 2000 | 2000 (two-pass) / 1000 (single) |
| **Sampling params** | none sent | none sent |
| **Callers** | Encode button — 1 call per encode, with resized photos attached | Pataphysical (1 call per translate) **and** Evolve (1 call per candidate — a default generation = 6 parallel two-pass calls) |
| **Per-request override** | none | `model` body param, validated + passed through (no UI yet — see GAPS P2-4) |

Provenance: every translation records the model that produced it
(`lastModel`, shown in the record drawer and serialized into compositions).
Encode results do **not** currently record their model — small gap worth
closing whenever `encode-space.ts` is next touched.

### Known inconsistency (as of this writing)

The three model references do not agree:

1. Encode: `claude-sonnet-4-6` (current-generation-adjacent, still active).
2. Translation via OpenRouter (the deployed path): `anthropic/claude-sonnet-4`
   — plain Sonnet 4, which **Anthropic has formally deprecated** (retirement
   date TBD, migration target Sonnet-tier current). When it is retired, the
   deployed translation path breaks or silently degrades.
3. Translation fallback: `claude-sonnet-4-6`.

So translations currently run on an older, deprecated model than encodings,
and removing the OpenRouter key would silently *change* translation behavior.
Fix tracked as the "model alignment" decision (see strategy below).

**Implementation note for whoever aligns them:** OpenRouter slugs use dots
(`anthropic/claude-sonnet-4.6` style) while Anthropic IDs use dashes
(`claude-sonnet-4-6`). The fallback path only strips the `anthropic/` prefix
(`translate-meme.ts` ~line 359) — it would pass a dotted ID straight to the
Anthropic API, which rejects it. Any new default needs (a) the OpenRouter slug
verified against `GET https://openrouter.ai/api/v1/models` at deploy time
(unreachable from dev sandboxes), and (b) a dot→dash normalization or explicit
map in the fallback resolver.

---

## Non-AI network surface

**Serverless (data fetches, no models):**
- `fetch-memes` / `fetch-meme-by-id` → archthesis Firestore REST (public
  read-only web key; hardcoded in source — acceptable but move to env someday).
- `geocode` → Nominatim. `fetch-context-pois` → Overpass.

**Direct from the browser:** Firebase (auth, projects/sites/compositions,
both lexicon libraries — shared project with archthesis); the map-context
iframe (Railway); Grasshopper live-link (local HTTP, port 9876).

**map-context uses zero AI** — its pipeline is entirely public data services
(Nominatim, Overpass, GovMap, Tel Aviv GIS, data.gov.il, elevation services,
land.gov.il, Meirim).

**Env keys:** `OPENROUTER_API_KEY` (translation + Evolve),
`ANTHROPIC_API_KEY` (encode + translation fallback), `VITE_FIREBASE_*`,
`VITE_MAP_CONTEXT_URL`. (`TRANSLATION_PASS_MODE` is documented but dead —
GAPS P0-2.)

---

## Model strategy (for the ever-changing model world)

Principles this project follows, in priority order:

1. **Provenance over pinning.** The archive is protected not by never
   changing models but by every record knowing which model made it. This is
   already true for translations; extend to encodings when convenient. An
   upgrade never corrupts history — old records stay interpretable.
2. **One model across the pipeline, one place in the code.** The thesis
   claim "the prompt is the artifact" is confounded if encode and translate
   run different models. Model IDs should live in a single config point
   (env var with a sane default), not scattered hardcodes — a model swap
   should be a deploy setting, not a code change.
3. **Freeze near deadlines, experiment after.** Prompts are tuned against a
   specific model's behavior. Newer models follow instructions more literally
   and can shift output style/length — never swap close to a presentation.
   After the deadline, the cross-model comparison (GAPS P2-4: same meme, same
   site, N models, N confidence vectors) turns model choice into thesis
   material instead of a config decision.
4. **Cost is not the deciding factor at thesis scale.** A two-pass
   translation costs on the order of a few cents on Sonnet-tier and roughly
   3× that on Opus-tier; even hundreds of runs are tens of dollars.
   Behavioral stability and comparability matter more than price here.
5. **Watch the deprecation list, not the launch announcements.** The forcing
   function for change is a model *retiring* (as plain Sonnet 4 will), not a
   new one launching. Newer models can also change token accounting (newer
   Sonnet-generation tokenizers count ~30% more tokens for the same text), so
   any upgrade must re-check the `max_tokens: 2000` budgets — a two-pass JSON
   response that fit on the old model can truncate on the new one.

Current landscape at time of writing (Anthropic tiers, per-1M-token pricing):
Sonnet 4.6 ($3/$15, the model this system was tuned against) · Sonnet 5
($3/$15, intro pricing until 2026-08-31; near-Opus coding quality; new
tokenizer + behavioral shifts) · Opus 4.8 ($5/$25, most capable standard
tier) · Haiku 4.5 ($1/$5, fast/simple tasks). Deprecated: Sonnet 4 (the
current OpenRouter default), retirement TBD.

**Decision record:** lives in `docs/MODEL_STRATEGY.md` (the adoption
protocol + log). As of 2026-07-12: the Model lab (cross-model comparison
panel in Pataphysical two-pass mode) is built, model defaults are
env-configurable (`TRANSLATION_MODEL`, `ENCODE_MODEL`), and the default
choice is pending the first probe-set comparison run.
