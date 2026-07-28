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
| Out-of-scope questions | **Suggestion box.** Not an error state — a collection surface, and material for critique of the system. **Real and collecting on 2026-08-09**, not a declared gesture. |
| Conflicts / unknowns | **Flag, never paper over.** Show both sides with their sources and dates. |
| Home | This file for now. No new repo. |
| **Deliverable date** | **2026-08-09.** This is thesis material, not a side project. Anything after gets its own scope and probably lands in the portfolio website. |
| **Language** | **Hebrew.** English version later, out of scope for August 9. |

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

### Interface: browsable, not a blank box

**Decided 2026-07-27.** A blank chat box promises an infinite system and then
fails in front of the person it disappointed. The answer set is finite, so it is
**shown**: browsable by category, with search that narrows rather than
interrogates, and the suggestion box at the visible end.

This is the honest interface for a closed vocabulary, and it also removes the
project's largest technical risk (see §4a — Hebrew matching). If a visitor can
*see* the questions, no matching has to succeed for the thing to work.

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

## 4a. Hebrew — two consequences

**Decision: the answer set is Hebrew.** English is a later project.

### Agents do not draft the Hebrew

The SoT already sets this rule: *"agents no longer draft HE; final blessing stays
Iddo's."* It stands here. The division of labour is therefore:

| Work | Owner |
|---|---|
| Question list, ranking, provenance tags, tier + date stamps | Agent |
| Answer *content* — what is true, what the sources say, where they conflict | Agent, in English, as working scaffold |
| **The Hebrew that a jury reads** | **Iddo** |
| Interface, matching, suggestion-box plumbing | Agent |

**This is the schedule risk, and it is Iddo's time, not the agent's.** Every
answer in the shipped set has to pass through him in Hebrew. That caps the
realistic size of the set far below what the corpus could support — see §7.

Mitigating fact: these are the same answers he has to be able to *say aloud* in
the crit. Writing them is not additional work, it is crit preparation that
happens to be written down.

### Hebrew matching is genuinely hard

Hebrew has no capitalisation, attaches prefixes directly to words (ה, ו, ב, ל, מ,
ש, כ), writes without vowels, and inflects heavily. Naive keyword matching
underperforms badly: a visitor typing `איך המערכת מתרגמת ממים` will not
reliably reach an answer keyed on `תרגום ממים`.

Three options were considered:

1. **Build-time embeddings** (multilingual model, vectors shipped static — still
   air-gapped at run time). Handles morphology well, adds a build dependency six
   days before freeze.
2. **Hebrew normalisation** — strip the prefix letters, fold final forms
   (ם/ן/ץ/ף/ך), match loosely. Zero dependency, crude.
3. **Hand-authored trigger phrases per answer.** Most reliable for a set of this
   size, fully inspectable, and curated by the person who has to defend it.

**Decision: 3 + 2, with the browsable interface carrying the real load.** Option
1 stays available as a post-August upgrade. With a visible, finite, browsable set,
matching is a convenience rather than a dependency — which is the whole point of
not pretending the set is infinite.

RTL layout has precedent to borrow from: `archthesis` is Hebrew-first RTL with
i18next already.

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
Becomes the agent's entire content.

**Sizing.** The corpus could support 60+ questions. The Hebrew bottleneck (§4a)
means the shipped set should be **20–30**, chosen for what a jury will actually
ask, not for coverage. A small set of answers Iddo can defend beats a large set
he has skimmed — and an answer he has not personally blessed is exactly the
failure mode this whole design exists to prevent.

Ranked question list: `docs/THESIS_QA_QUESTION_LIST.md`.

### Phase 1 — the shipped surface (required for 2026-08-09)

**Confirmed as a thesis deliverable**, so this is no longer optional.

A single self-contained HTML page over the frozen answer set. Hebrew, RTL,
offline, no build step, no dependencies, opens from a USB stick or a laptop at
the pin-up. Browsable by category (§3), search narrows, suggestion box at the end.

**The suggestion box is real and collects.** Air-gapped, so it writes locally —
to a file or browser storage on the machine at the pin-up — and gets read
afterwards. It is not a form that posts somewhere.

Open: where it physically lives on 2026-08-09 (§8).

### Phase 2 — after 2026-08-09

Its own scope, its own time. Expected home: **the portfolio website.** Includes
the English set, the fuller retrieval layer, the other three repos' reconciled
context files, image captioning, live-code re-verification, and update protocols.

---

## 8. Open questions for Iddo

**Resolved 2026-07-27:** thesis deliverable for August 9 · Hebrew · suggestion box
real and collecting · later work goes to the portfolio website.

Still open:

1. **Where does the thing physically live on 2026-08-09?** A laptop or tablet at
   the pin-up, a QR to a local page, a page in the book with the answer set
   printed, or more than one. This decides the interface work and how the
   suggestion box collects.
2. **Does the answer set also print?** If it goes in the book as an appendix, the
   register changes — printed answers cannot say "tap for source."
3. **Who writes the ~25 Hebrew answers, and when?** The agent produces content
   scaffolds; the Hebrew is Iddo's, against a freeze around 2026-08-02. If that
   is not realistic, the honest move is to cut the set further rather than ship
   Hebrew he has not blessed.
4. **Does the suggestion box ask for a name?** Anonymous matches the platform's
   own ungated-entry posture; attributed makes the collected critique citable
   afterwards.

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
