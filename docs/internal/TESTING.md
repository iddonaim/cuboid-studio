# Testing

This project uses **[Vitest](https://vitest.dev)** as its test harness. Vitest
reuses the Vite toolchain, runs TypeScript/ESM natively, and is fast. This
document is the map of what is tested today and the plan for growing that
coverage in deliberate passes.

## Running tests

```bash
npm test          # run the whole suite once (CI mode)
npm run test:watch # re-run on change while developing
```

Config lives in `vitest.config.ts` (kept separate from `vite.config.ts` so the
test runner doesn't pull in the PWA/build plugins). Test files are named
`*.test.ts` and sit next to the code they cover. Phases 1–2 run in the `node`
environment — no browser/jsdom — because they only exercise pure logic.

## Philosophy — a pyramid, built bottom-up

Cheap, deterministic tests at the bottom; expensive, brittle ones at the top.
We add a layer only when it earns its keep.

1. **Pure logic** — functions that map input to output with no UI and no
   network. Highest value, zero mocking. *(Phases 1–2 — done.)*
2. **Stores** — Zustand state logic, with Firestore faked out.
3. **Components** — render in a simulated browser (jsdom + Testing Library),
   assert wiring and behaviour.
4. **API route orchestration** — the serverless handlers, with the LLM caller
   mocked.
5. **End-to-end** — a real browser driven through the live app (Playwright).
   Highest fidelity, highest upkeep; only if it ever earns it.

### What we deliberately do **not** test

- **The model's actual output.** It is non-deterministic; a test asserting "the
  model returns operator X" would fail at random and train us to ignore it. We
  test the *plumbing around* the model (does a bad operator get rejected? does a
  custom vocabulary compose correctly?), never its creativity.
- **Coverage for its own sake.** A few tests on load-bearing logic beat a
  hundred on trivial getters.

## Phase 1 — pure logic: prompt + API + core geometry (done)

Locks in the two most recently shipped, highest-risk pieces (the operator-422
fix and the editable translation vocabulary), plus a slice of core geometry.

| File | Covers |
|---|---|
| `src/prompts/translationLexicon.default.test.ts` | Prompt composition fills every `{{slot}}`, leaves `{site_context}` for the API, and renders all operators/edge types; a **snapshot** locks the composed default prompt byte-for-byte so it can't silently drift; the `isTranslationLexicon` validator accepts the default and rejects malformed input; the fixed operator/edge token sets stay consistent. |
| `api/translate-meme.test.ts` | The Pass 1 / Pass 2 / single-pass validators — including the exact **#62 regression**: an operator of `juxtaposition` (a rhetorical move, not an operator) is rejected with the "operator must be one of…" message. |
| `src/lib/cube/connectionRules.test.ts` | Face geometry invariants (opposite-of-opposite, negated direction vectors, unit axes), the `canConnect` rule (like cutters join, a shell wall blocks growth), and the 16-rotation enumeration. |

The snapshot baseline is `src/prompts/__snapshots__/`. If an intentional prompt
change makes it fail, update it with `npx vitest run -u` and review the diff.

> Note: the validators in `api/translate-meme.ts` are exported solely so they can
> be unit-tested. Vercel uses only the file's default export as the handler;
> named exports are inert at runtime.

## Phase 2 — more pure logic: evolution scoring + cut geometry (done)

| File | Covers |
|---|---|
| `src/lib/evolution/compressibility.test.ts` | `computeCompressibility`'s four sub-scores (geometric clustering, spatial regularity, operator sequence, meme coherence) against a hand-verified known assembly and an unrelated-cubes case that lands on zero; the documented 0.3/0.3/0.2/0.2 weighting; the "fewer than 2 operated cubes" guard; `compressionProgress`'s sign convention; `createSnapshot`'s delta/pass-through fields. |
| `src/lib/operators/applyOperator.test.ts` | `normalizedPositionToCubeLocal`'s clamping and range mapping; `createCutterFromLLMOutput`'s per-cutter-type sizing (box/sphere/cylinder/plane) and proportion clamping; `applyLLMOperator`'s CSG subtraction — result stays within the original bounds, a cut measurably changes the geometry (vs. the silent-fallback-on-failure path), and the target geometry isn't mutated in place. |
| `src/lib/decode/snapUtils.test.ts` | `rotatePoint`/`transformWorldPoint` quarter-turn rotation math; `worldSnapPoints` scaling and offsetting real lexicon data by tile position/rotation; `findClosestSnap`'s radius cutoff, self-exclusion, closest-of-multiple-candidates tie-breaking, and reported alignment offset. |
| `src/lib/decode/variation2dPath.test.ts` | The `/2d/{id}.svg` path helper. |

The CSG tests exercise the real `three-bvh-csg` boolean evaluator (no mocking)
— it runs fine in plain Node since it's pure geometry math, no DOM/WebGL
needed. Console output from the cut pipeline's own logging shows up in test
output; that's existing production logging, not a test artifact.

## How we grow it — next passes

Roughly in priority order. Each is a self-contained follow-up PR.

- **Phase 3 — stores.** `useTranslationLexiconStore` and `useLexiconStore`
  (`src/store/`) are the first targets — they're structurally identical
  (one mirrors the other), so one well-built test file is a near-template
  for the second.

  **Mocking:** `vi.mock()` each store's own Firestore wrapper module
  (`src/lib/projects/lexiconFirestore.ts` / `translationLexiconFirestore.ts`)
  rather than the raw `firebase/firestore` SDK — that's the boundary the
  store already imports through, so faking `listLexicons`/`createLexicon`/
  `updateLexicon`/`deleteLexicon` is enough; no need to fake `db`, `collection`,
  `query`, etc. Optionally also mock `src/lib/storage/active(Translation)Lexicon.ts`
  to assert *which* persistence call fires (see below) — **not** because it's
  required: confirmed empirically that plain Node (no jsdom) has no global
  `localStorage` (`ReferenceError` on access), and every function in those
  storage helpers already wraps its body in try/catch, degrading to a no-op /
  `null` return. So the store is safe to test in the existing `node`
  environment with zero storage setup; mock it only if a test wants to assert
  the *choice* of persistence call, not just the resulting state.

  **Specific behaviours worth locking in** (each store, ~mirrored):
  1. *Stale active id falls back to default* — seed `activeLexiconId` with an
     id, call `loadLexicons(ownerId)` with a mocked list that excludes it →
     `activeLexiconId` becomes `null`. The inverse case matters too: a
     *valid* id present in the loaded list must survive `loadLexicons`
     unchanged (don't reset valid selections).
  2. `getActiveLexicon()` / `getActiveTranslationLexicon()` resolution: `null`
     → the built-in default; a set id matching a loaded doc → that doc's
     vocabulary; a set id with no matching doc (the defensive `??` branch,
     distinct from the loadLexicons-validation path above) → falls back to
     the default rather than throwing.
  3. CRUD plumbing: `createLexicon` prepends (newest-first, not appended);
     `updateLexicon` patches the matching doc in place and stamps a fresh
     `updatedAt`; `deleteLexicon` resets `activeLexiconId` to `null` **only
     when the deleted doc was active** (assert it does *not* reset on
     deleting a non-active doc — easy regression to introduce);
     `duplicateLexicon` names the copy `"${name} (copy)"`, clones
     tags/descriptions, and throws if the source id doesn't exist.
  4. `setActiveLexiconId`: `null` clears persisted storage, a real id sets
     it — two different calls, easy to swap by accident.
- **Phase 4 — components.** Add `jsdom` + `@testing-library/react`, then start
  with the `TranslationLexiconEditor` (the editor shipped in #63 that could not
  be click-tested at build time): assert it renders, saves a draft, and switches
  the active vocabulary. Switch only these files to the jsdom environment via a
  `// @vitest-environment jsdom` pragma.
- **Phase 5 — API orchestration.** Test `parseAndRoute`'s retry behaviour (bad
  JSON retried once; a semantically-invalid response re-asked once, then 422)
  by mocking the transport caller — no real network or model calls.
- **Later — end-to-end.** Only if the app surface stabilises enough to justify
  Playwright's maintenance cost.

## Conventions

- Co-locate `*.test.ts` with the code under test.
- Deterministic inputs only; no live network, no real Firestore, no real model.
- When fixing a bug, add the failing case as a test first (the #62 operator case
  in `api/translate-meme.test.ts` is the template).
