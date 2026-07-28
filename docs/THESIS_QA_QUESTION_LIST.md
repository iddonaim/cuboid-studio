# Thesis Q&A — ranked question list

> Working scaffold for the August 9 answer set. Drafted 2026-07-27.
> Companion to `THESIS_QA_AGENT_SCOPE.md`.
>
> **Questions are in English here on purpose.** This is the working list, not the
> shipped artifact. Per the SoT rule — *"agents no longer draft HE; final blessing
> stays Iddo's"* — the Hebrew that a jury reads is Iddo's, not an agent's.
>
> **Nothing here is an answer.** The `Source` column says where an answer would
> come from. Where it says NONE, that is the finding.

---

## How to read this

| Column | Meaning |
|---|---|
| **Ship** | ✅ in the ~25-question August 9 set · ⬜ post-August |
| **Tier** | `code` = verifiable at `origin/main` · `decision` = SoT §C/§H · `doctrine` = SoT §F · `concept` = theory · `archive` = history only |
| **Source** | Where the answer comes from. **NONE** = no prepared answer exists. |

Every shipped answer carries tier + source + verification date, per §4 of the
scope. Mechanism claims get re-verified against `origin/main` during the
pre-freeze pass — the SoT's own rule, earned by the six-week single-pass error.

---

## A. The ones with no prepared answer

**This is the most important section in this document.** Each of these is flagged
in the SoT's own remainder register (§I) or theory open questions as unanswered,
and every one of them is a question a jury actually asks. They are ranked first
because they need Iddo's thinking, not just his Hebrew.

| # | Question | Ship | Tier | Source |
|---|---|---|---|---|
| A1 | Who decides which memes count? | ✅ | concept | **PARTIAL** — SoT §I names it as *"jury question with no prepared answer."* The archthesis rules pass answers half: at entry no one (anonymous, no approval state), at removal the author (`hidden` flag). The honest answer states both halves — but the *position* is unwritten. |
| A2 | You read Hebrew-first material with a model weighted toward the English internet. Whose collective knowledge is this? | ✅ | concept | **NONE** — SoT §D calls this *"the heaviest open question"* and says it *"needs an authored thesis position."* Unwritten. |
| A3 | What stops the platform from filling with rubbish, bots, or the same few loud voices? | ✅ | concept | **NONE** — SoT §I "platform power" under Recover: moderation, bots, rubbish, unequal visibility. |
| A4 | Is this laughing *at* places and the people in them? | ✅ | concept | **NONE** — theory doc open question 1, "humor ethics." |
| A5 | Does turning a joke about a building into architecture defuse the criticism it carried? | ✅ | concept | **NONE** — theory doc open question 3, "parody vs legitimation." |
| A6 | The participation is unequal — you built the system, you chose the memes, you made the judgments. What did participants actually decide? | ✅ | concept | **NONE** — SoT §I, "the unequal participatory encounter," listed as the sharper participatory counterclaim. |
| A7 | Has a meme ever changed a design decision you would otherwise have made? | ✅ | concept | **NONE** — SoT §I Recover, "humor that alters decisions." |
| A8 | What do the white, orange and green in the physical models mean? | ⬜ | doctrine | **NONE** — SoT §I: *"UNDOCUMENTED, awaiting two sentences from Iddo."* Two sentences closes it. |

> **A1–A7 are seven answers Iddo has to think, not translate.** They are also the
> seven most likely questions in the room. If the schedule forces a cut, cut
> elsewhere — this section is the reason the artifact is worth building.

---

## B. Mechanism — "how does it actually work"

Answerable today, verifiable at `origin/main`. Low authoring cost, high visitor
demand.

| # | Question | Ship | Tier | Source |
|---|---|---|---|---|
| B1 | Why 70 shapes? | ✅ | code | C(8,4) over 8 fixed cutters (5 spheres, 3 cylinders), 42mm cube. SoT §B |
| B2 | What actually determines the geometry when a meme is translated? | ✅ | code | Only the cutter (type/proportions/position/rotation). SoT §B |
| B3 | How does a photo of a room become cubes? | ✅ | code | 1–7 photos → five-axis reading → proposed assembly. SoT §B, CONTEXT.md Encode |
| B4 | What are the two passes, and why two? | ✅ | code | Pass 1 cultural extraction, Pass 2 geometric translation. SoT §B, PATAPHYSICAL_V2_SPEC.md |
| B5 | Why can't every cube connect to every other? | ✅ | code | Same-type cutter pairs only; shell blocks every connection — *"growth stops at blank walls."* `connectionRules.ts:192–205` |
| B6 | What is one cube, in metres? | ✅ | doctrine | A declared landing decision, constrained by cutter semantics (sphere=door, cylinder=window ⇒ cube ≈ room, ~3.5–4m). SoT §H pin-up facts |
| B7 | What does the confidence vector measure? | ✅ | code | 4 axes; strain as notation, not failure. SoT §B |
| B8 | Can you change how it reads, without changing the code? | ✅ | code | Two editable lexicons — SpatialLexicon (Encode) and TranslationLexicon (Pataphysical/Evolution), both Firestore-backed and versioned. SoT REPO STATUS CORRECTION |
| B9 | What gets saved, and what can be replayed? | ✅ | code | Everything downstream of translation replays deterministically; geometry is never stored, it is rebuilt. SoT §B |
| B10 | Is a human in the loop, or does the machine decide? | ✅ | code | Architect picks candidates, edits readings, authors lexicons, makes the landing call. SoT §B, §C5 |
| B11 | What is the notation for, if the geometry already exists? | ⬜ | doctrine | Decode = the architect's reply in the system's vocabulary. SoT §F sheet doctrine |
| B12 | Which model, and does that matter? | ⬜ | code | OpenRouter default / Anthropic fallback; model id + promptVersion recorded on every surface. SoT §B |

---

## C. Honest limits and refusals

Jury members probe here. Every one of these has a prepared, defensible answer
already — this section is cheap to ship and it buys enormous credibility.

| # | Question | Ship | Tier | Source |
|---|---|---|---|---|
| C1 | Is this a genetic algorithm? | ✅ | code | **No.** No population, crossover, mutation or inheritance. *Single-lineage guided search with a human in the loop.* SoT §B |
| C2 | Why did you refuse crossover? | ✅ | decision | Accountability — single lineage keeps a human answerable for each step. SoT fossil-panel refusal lines |
| C3 | Why is there no fidelity score — how do you know the translation is *right*? | ✅ | decision | Pataphysical translation owes no faithfulness. Refused deliberately. SoT fossil panel |
| C4 | Does the meme's intensity affect the shape? | ✅ | code | **No.** `magnitude` is geometrically inert but feeds the compressibility fingerprint (`compressibility.ts:573`) — *the geometry ignores the meme's intensity; the system's taste does not.* SoT §B |
| C5 | What do `targets` and `decay` do? | ✅ | code | Validated, displayed, persisted — but touch no behaviour. The untranslatable remainder, visible in the schema. SoT §B, §D |
| C6 | Nothing decays — isn't that a problem for a project about cultural drift? | ✅ | decision | **The one refusal that still costs something.** SoT §I: decay's criticism — cultural disturbance rendered too orderly — *"remains open."* Answer it as open, do not paper over. |
| C7 | Is this Schmidhuber implemented? | ✅ | code | Re-interpreted, not implemented: a static four-sub-score delta, not a learning compressor. Say "re-interpreted" — it is stronger than pretending. BOOK_AND_PRESENTATION_GUIDE §2 |
| C8 | Do the operators have distinct geometric behaviours? | ✅ | code | **No** — every apply is one cutter subtraction. Operators are preserved as reasoning notation; execution is deliberately reduced to the cutter. GAPS_AND_HOLES P2-1 |
| C9 | Where is the building? | ✅ | doctrine | No building proposal, by design. *"Never extrude the assembly into a building — that reenacts the pathos the project critiques."* SoT §F intervention doctrine |
| C10 | What can this system not record? | ✅ | concept | The act of translation itself. *"The archive replays everything downstream of translation; the act of translation can only be re-performed, never replayed."* SoT §D — the strongest honest-limit answer in the project |
| C11 | Did you compare models? | ⬜ | code | **No.** Never run. Do not claim. BOOK_AND_PRESENTATION_GUIDE §2 |
| C12 | Does Krier ground the notation? | ⬜ | archive | **No** — zero trace in code or prompts. Cut or write it for real. BOOK_AND_PRESENTATION_GUIDE §2 |
| C13 | What is the diagram with the genotypes and the crossover? | ⬜ | **archive** | The 2019-era fossil. **Answerable only as history.** SoT flags it *"radioactive to agents"* — must carry its date. |

---

## D. Theory and framing

| # | Question | Ship | Tier | Source |
|---|---|---|---|---|
| D1 | Why memes? | ✅ | concept | Synopsis (canonical Hebrew, 2026-07-23) — already written, do not re-draft |
| D2 | Aren't memes trivial compared to a building? | ✅ | concept | Meme–classic homology: Dawkins 1976 already includes *"ways of building arches."* The internet meme is the special case. Pressy_v3 pp.9–12, asset-complete |
| D3 | What is the difference between a meme and a classic? | ✅ | concept | The **transmission regime** — speed, fidelity, gatekeeping. Canonisation is judgment that happened slowly. SoT meme–classic homology |
| D4 | So it's just internet memes? | ✅ | decision | **Own it plainly.** Iddo's 2026-07-23 correction: no pathos-shield; *"it's just internet memes"* is a self-defeating reduction. Transmission-regime line is the second punch, not the lead defence. |
| D5 | Why pataphysics? | ✅ | concept | Science of imaginary solutions; grounds a translation that owes no faithfulness. CONTEXT.md, PATAPHYSICAL_V2_SPEC.md |
| D6 | Where is the virtual in this? | ✅ | decision | **The notation spread in Decode, pre-placement** — live possibility, still choosable at the landing moment. Not the evolution stage's refused candidates (retracted 2026-07-23). SoT correction |
| D7 | Why Deleuze? | ⬜ | concept | *Difference & Repetition* — the strongest canonical anchor on the quotes slide. Pressy_v3 |
| D8 | Where is time in the system? | ⬜ | concept | Meaning drifts in minutes; the versioned regime (`# version:` headers, promptVersion provenance) is meaning-drift meeting a dated translation regime. SoT time-nativeness |
| D9 | What is the harmony/absurd axis? | ⬜ | concept | Founding axis; both registers at full strength, neither ironising the other. GLOSSARY, SoT §F |

---

## E. Authorship and method

| # | Question | Ship | Tier | Source |
|---|---|---|---|---|
| E1 | What did you design here — the buildings, or the machine? | ✅ | decision | *"Authors the conditions of translation, curates the material moving through them, and assumes responsibility for its architectural continuation."* SoT §C5 |
| E2 | If the LLM does the reading, what is the architectural work? | ✅ | decision | The regime: vocabulary, grammar, lexicon, candidate choice, landing declaration. SoT §C5, §F |
| E3 | Could someone else continue one of these? | ✅ | doctrine | Continuability is empirical — one continuation by a non-author; a documented refusal counts as much as an acceptance. SoT §F. **Check status before the freeze** — this was an open item. |
| E4 | Is the prompt part of the thesis? | ✅ | doctrine | Yes — the prompt is the curatorial artifact; behaviour changes by editing language. Grammar at `# version: 3` |
| E5 | You removed a control that did nothing. Why show that? | ⬜ | decision | The slider passes its own test: a joke that changed the code, with a commit hash as evidence. Confession becomes evidence *for* the humor doctrine. SoT §I |
| E6 | What would you refuse to let this system do? | ⬜ | doctrine | Extrude into a building; self-simulate; treat editing the representation as editing the space — *"the whole judgment doctrine lives in the gap where 'thereby' broke."* SoT founding-message genealogy |

---

## F. Project shape

| # | Question | Ship | Tier | Source |
|---|---|---|---|---|
| F1 | What is it called? | ✅ | decision | POETIKS / פה-אתיקה — **working name, not locked** (D1). Say so. SoT addenda |
| F2 | Why two sites? | ✅ | decision | Demo site ≠ pin-up site; multiple sites = multiple readings = the system's zero-state. SoT §H1 |
| F3 | Which parts are built and which are planned? | ✅ | code | The built/planned/speculative labelling is on every answer. CONTEXT.md, GAPS_AND_HOLES.md |
| F4 | Are these three separate projects? | ✅ | decision | **Convergence, not chain** — the platform and Map Context are parallel independent inputs into Cuboid Studio. SoT §E |
| F5 | What happens to this after the thesis? | ⬜ | concept | Re-entry loop, released meme template, colleague continuations. Stated as next moves, declared not faked. SoT §I Test |
| F6 | Why is there no photo of the old man under the tree? | ⬜ | concept | *"Because that knowledge had nowhere to be written."* SoT Or Yehuda. **Iddo's own aloud-test is still queued and his last verdict was "still weak and engineered to my taste."** Ships only if he clears it. |

---

## G. Questions about this Q&A itself

Worth having ready — someone will ask, and the answers are the thesis argument in
miniature.

| # | Question | Ship | Tier | Source |
|---|---|---|---|---|
| G1 | Is this AI answering me? | ✅ | doctrine | No. Every answer was written and blessed before today; nothing is generated live. Scope §3 |
| G2 | Why can't it answer everything? | ✅ | doctrine | Finite vocabulary, visible edge — the same argument as the 8 cutters. What it can't take goes to the suggestion box. Scope §3 |
| G3 | What happens to what I write in the box? | ✅ | doctrine | Depends on §8.4 (anonymous vs attributed) — **answer required before it ships** |

---

## Counts

| | Ship ✅ | Post-August ⬜ | Total |
|---|---|---|---|
| A. No prepared answer | 7 | 1 | 8 |
| B. Mechanism | 10 | 2 | 12 |
| C. Limits & refusals | 10 | 3 | 13 |
| D. Theory | 6 | 3 | 9 |
| E. Authorship | 4 | 2 | 6 |
| F. Project shape | 4 | 2 | 6 |
| G. Self | 3 | 0 | 3 |
| **Total** | **44** | **13** | **57** |

**44 is too many for the Hebrew bottleneck.** Realistic target is 25. The
suggested cut, in order: E5–E6, D6, F4, B9–B10, C7–C8, then B-section overflow.
**Do not cut section A** — it is the section that makes the artifact worth having,
and the seven answers there are ones Iddo needs in his mouth on August 9 whether
or not any of this ships.
