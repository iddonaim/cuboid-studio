# Thesis Q&A Agent — Scope

> Status: **scope, not a build.** Nothing here is implemented.
> Drafted 2026-07-27. Author: Iddo + Claude session.
>
> This document is thesis-wide, not Cuboid-specific. It lives here only because
> the thesis has no cross-repo home yet. If a thesis-wide repo or a
> `thesis/` folder on the Mac becomes the canonical home, move it and leave a
> pointer.
>
> **Canonical inputs:** the Notion SOURCE OF TRUTH mirror (2026-07-23) and its
> Mac twin `thesis/cuboid/cuboid-context-recount_2026-07-21.md`; this repo's
> `CONTEXT.md`, `GLOSSARY.md`, `docs/SYSTEM_MAP.md`, `docs/GAPS_AND_HOLES.md`,
> `docs/BOOK_AND_PRESENTATION_GUIDE.md`.

---

## 1. What this is

A thing you can ask questions about the thesis — the whole thesis, not just
Cuboid Studio — that answers honestly, cites where each answer came from, and
says plainly when its sources disagree or when it doesn't know.

**It is not** a chatbot with a personality, a search box, or a demo of LLM
capability. It is an instrument that makes the project's own knowledge
inspectable, including the knowledge that the project is unfinished.

---

## 2. Decisions already made

| Question | Decision |
|---|---|
| Audience | **Jury + visitors.** A public-facing artifact, not a private tool. |
| Privacy | **Solved by air-gap.** Nothing is connected to anything. Iddo hand-picks and copies in what belongs. No live reads from Notion, Firestore, Drive or the repos. |
| Freshness | **Static-first.** The thesis freezes ~1 week before 2026-08-09 in order to produce everything; the corpus freezes with it. Update protocols are a later problem. |
| Corpus scope | Repos, written thesis text, theory & references, drawings/plates/images, the live meme material, the Notion SoT, the slide deck, future products and diagrams. |
| Out-of-scope questions | **Suggestion box.** Not an error state — a collection surface, and material for critique of the system. |
| Conflicts / unknowns | **Flag, never paper over.** Show both sides with their sources and dates. |
| Home | This file for now. No new repo. |

---

## 3. Architecture: no model at question time

Because the corpus **freezes** and the system is **air-gapped**, the answers can
be written and reviewed *before* anyone asks. The running thing does matching and
retrieval over a vetted answer set. There is no language model in the loop when a
visitor types a question.

```
BUILD TIME (before the freeze, with Iddo in the loop)
  corpus ──► draft Q&A set ──► Iddo reviews every answer ──► frozen answer set
                                                                    │
RUN TIME (in the crit room, on the wall, in the book)               ▼
  visitor question ──► match ──► vetted answer + sources + date
                         └──► no confident match ──► suggestion box
```

### Why this is better here, not just cheaper

1. **Every answer is proofread by the author.** "Never paper over" stops being a
   promise the system makes and becomes a property of the artifact.
2. **It runs in airplane mode.** The SoT already lists airplane-mode reliability
   as a *hard constraint* for anything demoed live. A live-LLM chat box breaks a
   rule the project already set for itself.
3. **It cannot be talked into anything.** No prompt at run time means no prompt
   injection, no jailbreak, no hostile-visitor surprise.
4. **Zero cost, zero latency, no API key, no account, no network.**
5. **It degrades to paper.** The same answer set prints as a book appendix or a
   wall panel. Nothing is lost if the software never ships.

### What it costs

It answers only what was anticipated. Novel synthesis on the spot — "compare your
operator vocabulary to Krier's typologies" — is out of reach unless that question
was written and answered beforehand.

This is a real limit and it should be **declared, not hidden** (see §5).

### The design rhyme

The project's central geometric claim is that a **finite, fixed vocabulary** makes
every relation unambiguous: 8 cutters, 70 variations, no vibes. An agent with a
finite, vetted answer set and a visible edge is the same argument in another
medium. The suggestion box is §D's *untranslatable remainder* and §I's
*remainder register* applied to the agent itself — the machine shows where its
vocabulary ends and collects what it could not take.

This is a defensible thesis position. "We hooked up a chatbot" is not.

---

## 4. The honesty machinery (already authored, not invented here)

The SoT already specifies how claims are weighted. The agent implements that,
verbatim, rather than inventing a new scheme.

**Precedence order (SoT):** repo (mechanism) → recount (decisions & facts) →
instruments (theory docs, evidence map, handover, drift plan) → archival.

**Every answer carries:**

| Tag | Meaning |
|---|---|
| Tier | `code-verified` / `decision` / `doctrine` / `conceptual` / `archival` |
| Source | The file, section or page it came from |
| Verification date | Per the SoT rule: *"a code-verified label carries its date and no more."* |
| Status | `built` / `planned` / `speculative` / `refused` |

**Four hard rules, each earned by a failure that already happened:**

1. **Nothing from the don't-claim table is ever asserted.**
   `BOOK_AND_PRESENTATION_GUIDE.md` §2 lists six claims already ruled out
   (operators having distinct geometric behaviors; magnitude modulating geometry;
   Schmidhuber implemented literally; cross-model results; Krier grounding the
   notation; sun/traffic analysis). These are guardrails, not documentation.

2. **Archival material is dated on its forehead.** The SoT flags the
   "Memetic–Topological Evolutionary Design Framework" diagram as
   *"radioactive to agents"* — a fossil containing GA, crossover, fidelity scores.
   Archival content is answerable **only** as history, never as mechanism.

3. **A verification stamp expires.** "Evolve uses single-pass" was false for six
   weeks, got labelled code-verified, and the label then protected it from
   re-checking. Any mechanism claim in the answer set gets re-verified against
   `origin/main` during the pre-freeze pass, and the answer shows that date.

4. **Conflicts are content, not bugs.** When the spec says six fitness axes and
   the code ships four, the answer says so and shows both. The known-drift list
   at the end of the SoT (stale single-pass mentions, stale magnitude claims,
   `connectionRules.ts`'s contradictory header, GA vocabulary in the spec files)
   seeds this directly.

---

## 5. Declared limits (shown to visitors, not hidden)

Stated plainly wherever the thing is used:

- It answers from a **frozen corpus**, dated.
- Its answer set is **finite**, and the edge is visible — questions outside it go
  to the suggestion box.
- It reports **what the project can defend**, not everything the project hopes.
- Where its sources disagree, it **shows the disagreement** rather than picking.

---

## 6. Corpus inventory

### Exists and is strong
- Notion SoT mirror + Mac recount — decisions, doctrines, open items, provenance
  tiering, the remainder register. **The spine.**
- `CONTEXT.md`, `GLOSSARY.md`, `docs/SYSTEM_MAP.md`, `docs/GAPS_AND_HOLES.md`,
  `docs/BOOK_AND_PRESENTATION_GUIDE.md` (Cuboid Studio).
- The four repos as mechanism ground truth.
- `Pressy_v3` (72pp) — the theory firmament; meme–classic homology is
  asset-complete per the SoT.
- `synopsis-sent_2026-07-23` — canonical public language, Hebrew.
- `wall-pinup-brief_v3_2026-07-24`.
- `thesis/archive` — INDEX, TIMELINE, SHORTLIST, 1,059 graded images.

### Exists but thin for this purpose
- `archthesis`, `map-context`, `cuboid-marketing` — READMEs only, no reconciled
  "what's true vs aspirational" file. A `context-sync` skill already exists to
  produce these.
- Theory docs (sectioned summary + narrative Hebrew) — both still await the
  quote/reply/judgment section near §28.

### Missing / blocked
- **Images are not answerable without captions.** 1,059 graded images can't be
  retrieved against unless each carries a line of text. Grading ≠ captioning.
- **The projectbook is mid-rethink** (six sections, Tolkien-map direction). Its
  content is not stable enough to freeze into an answer set yet.
- **`docs/LANDING.md`** — the landing protocol is doctrine-only, not in the repo.
  Open item (a) from the plate register.
- **The umbrella name is not locked** (POETIKS / פה-אתיקה, working). Every answer
  that names the project inherits this.

---

## 7. Phasing against the real calendar

**Final presentation: 2026-08-09. Freeze: ~2026-08-02.**

The open-items list already holds the wall pin-up, the projectbook rethink, the
two-site chain, the demo recording, B4, the airplane test, the name lock,
`LANDING.md` and repo hygiene. Adding a software build into that window is a real
risk, and it is not a risk that shows up in a diff.

So the recommendation is to **split the valuable half from the risky half.**

### Phase 0 — the Q&A corpus (before the freeze). Not software.

Write the questions and the honest answers, with tier + source + date + status on
each. This is **crit preparation**, which is needed regardless, and it is already
half-drafted across existing documents:

- §I's claim/counterclaim pairs → the seven hardest questions.
- §I's *"who decides which memes count?"* — flagged as having no prepared
  answer, and partially answered by the archthesis rules pass (at entry, no one;
  at removal, the author). That answer needs writing.
- The don't-claim table → six questions with careful answers.
- The refusals (crossover, fidelity score, reverse-mapping decode, decay) →
  "why not X?" questions, which juries ask.
- §A's tiering → tells you what each answer's provenance tag should be.

**Deliverable:** one document. Prints as a book appendix. Works as speech prep.
Becomes the agent's entire content if a wrapper is ever built.

**This is worth doing even if no code is ever written.**

### Phase 1 — thin static wrapper (only if Phase 0 finishes early)

A single self-contained HTML page over the frozen answer set. Offline, no build
step, no dependencies, opens from a USB stick. Matching by keyword plus
pre-computed similarity; suggestion box writes to local storage or a plain form.

Only start this if Phase 0 is done and the wall and book are on track. It is a
nice-to-have, not a thesis deliverable.

### Phase 2 — after 2026-08-09

Everything else: the fuller retrieval layer, the other three repos' reconciled
context files, image captioning, live-code re-verification, update protocols, and
the question of whether it becomes a real product.

---

## 8. Open questions for Iddo

1. **Is this a thesis deliverable or a post-thesis project?** If the answer set
   goes in the book, Phase 0 must start now. If the whole thing is post-August,
   we do it properly in September and it costs nothing today.
2. **Where does the Q&A document live** — book appendix, wall panel, spoken prep,
   or all three? This decides its length and register.
3. **Hebrew, English, or both?** The synopsis is canonical Hebrew; the jury is
   Hebrew-speaking; visitors may not be. Doubling the answer set doubles the
   proofreading.
4. **Does the suggestion box need to actually collect** during the crit, or is it
   a declared gesture? Collecting means storage and a plan for what happens to
   the submissions.

---

## 9. What was explicitly ruled out

- **Fine-tuning / training a model on the corpus.** It teaches style rather than
  facts, cannot cite a source, freezes on the day it is trained, and would absorb
  the stale claims as truth — breaking the one requirement that matters here.
  Retrieval over a curated corpus is strictly better for this use.
- **Live reads** from Notion, Firestore, Drive or GitHub. Air-gap is the privacy
  model; hand-copied material is the whole point.
- **A live LLM at question time**, for the presentation build. Breaks the
  airplane-mode constraint, cannot be proofread in advance, and is the only
  version that can be talked into saying something the project has ruled out.
