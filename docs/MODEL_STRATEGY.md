# Model Adoption Strategy

> Written 2026-07-12. Companion to `docs/API_AND_MODELS.md` (the usage map).
> This is the standing protocol for choosing which AI model the system runs —
> both the decision pending now and every future decision when a new model
> appears or an old one is deprecated.

## Where model choice lives in the system

- **One registry:** `src/lib/models.ts` — the candidate list the Model lab
  offers, plus the OpenRouter→Anthropic id conversion. Adding a new model to
  the system = adding one entry here.
- **Two deploy settings:** `TRANSLATION_MODEL` (meme translation + Evolve;
  OpenRouter-style id) and `ENCODE_MODEL` (photo encoding; either id style) —
  Vercel env vars with safe built-in defaults. Changing the production model
  = changing an env var, no code.
- **Provenance on every record:** each translation stores the model that
  produced it; encode responses now report theirs. Old records stay
  interpretable after any switch — this is what makes upgrading safe.

## The trigger events

1. **A model the system uses is deprecated or retired** (the forcing
   function — check Anthropic's deprecation list, not launch announcements).
   *Response required*: run the protocol below before the retirement date.
2. **A new model launches** that plausibly improves cultural reading.
   *Response optional*: run the protocol when curiosity or the book demands
   it. Never adopt in the first weeks purely because it's new.
3. **A behavioral regression is noticed** (translations feel off after a
   provider-side update). *Response*: comparison run against the previous
   default to confirm, then decide.

## The protocol (per candidate model)

**Step 0 — availability check.** Verify the OpenRouter slug exists
(`GET https://openrouter.ai/api/v1/models`) and add the entry to
`src/lib/models.ts` if missing. A wrong slug fails visibly per-model in the
Model lab; nothing else breaks.

**Step 1 — the probe set.** Run the comparison on a *fixed* set of probes so
runs are comparable across time: 3–5 memes chosen to span the rhetorical
range (one ironic, one mournful, one celebratory/absurd, one rage-adjacent),
each against the same saved site context. Record the probe memes' archthesis
ids here once chosen:

> Probe set: _to be curated — list meme ids + site name here._

**Step 2 — read the results in the Model lab** (Pataphysical → two-pass →
Model lab). Judge each candidate against the current default on:

- **Validity** — did every run return a well-formed result? (Errors and
  retries show up as failures or long times in the panel.)
- **Cultural depth** — is the pass-1 extraction (tensions, affects, site
  resonance) specific and grounded, or generic? This is the architect's
  judgment call and the most important criterion.
- **Confidence-vector behavior** — does the vector *spread* (discriminate
  between memes) or flatten toward uniform values? A model that scores
  everything 0.7 is notating nothing.
- **Operator distribution sanity** — across the probe set, does the model
  use a range of operators, or collapse onto one favorite?
- **Latency** — the panel shows per-model seconds; matters mostly for
  Evolve (6 parallel calls per generation).
- **Output size** — if responses hit the `max_tokens` ceiling (truncation
  errors), the new model needs a raised limit before adoption
  (`api/translate-meme.ts`).

**Step 3 — decide and record.** Update the env var(s), and write one line in
the decision log below. If the corpus matters for a publication, regenerate
canonical figures on the new model and note the model in captions —
provenance fields make mixed-model archives legible, but figures read better
from one model.

**Step 4 — align.** Encode and translation should normally run the same
model family/version. Since 2026-08-02 both surfaces route the same way
(OpenRouter primary, Anthropic fallback), so the same OpenRouter-style id
works in both `ENCODE_MODEL` and `TRANSLATION_MODEL`. Deliberate divergence
is allowed but must be recorded below with its reason.

## Standing rules

- **Freeze near deadlines.** No model changes inside the final two weeks
  before a presentation or submission; prompts are tuned against a specific
  model's behavior.
- **Cost doesn't decide.** At this project's scale, even Opus-tier runs are
  tens of dollars for hundreds of translations. Judge on reading quality.
- **The comparison itself is thesis material.** Divergent readings of the
  same meme by different models — and their confidence vectors — are
  findings, not just QA. Screenshot Model lab runs for the book.

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-07-12 | Model lab built; defaults unchanged (`anthropic/claude-sonnet-4` translation, `claude-sonnet-4-6` encode) pending first probe-set run | Informed decision preferred over blind alignment; Sonnet 4 deprecation makes a decision necessary soon |
| 2026-08-02 | **Encode transport aligned with translation: OpenRouter primary, Anthropic-native fallback** (`api/encode-space.ts`). Model unchanged (Sonnet 4.6); `ENCODE_MODEL` default respelled `claude-sonnet-4-6` → `anthropic/claude-sonnet-4.6` (either spelling still accepted). Both surfaces now record a `provider` provenance field. | Closes the key-asymmetry footgun (encode 500'd if only the OpenRouter key was set while translation kept working); one gateway rule across the pipeline. Not live-verified at decision time — an encode against a real photo on the preview deployment is the gate before merge. |
| 2026-07-14 | **Standardized on Sonnet 4.6 across the pipeline.** Translation default moved `anthropic/claude-sonnet-4` → `anthropic/claude-sonnet-4.6` (`api/translate-meme.ts`); encode already ran `claude-sonnet-4-6`. Model lab **archived** — hidden by default behind the `MODEL_LAB_ENABLED` flag / `?modellab=1` URL override (`src/lib/modelLab.ts`), code kept in-tree. | Decision reached ("wisdom from the model lab"); aligning encode + translation on one model satisfies the "one model across the pipeline" principle and retires the deprecated Sonnet 4 default. Comparison UI no longer needed day-to-day but revivable when the next model lands. |

> **Reviving the Model lab.** It is not deleted — the panels, registry
> (`src/lib/models.ts`), and store logic all remain. To bring it back: flip
> `MODEL_LAB_ENABLED` to `true` in `src/lib/modelLab.ts` (one line — the
> intended path for a Claude Code session), or, live and without a redeploy,
> open the app with `?modellab=1` in the URL (`?modellab=0` turns it off
> again; the choice persists in the browser). Then run the protocol above.
