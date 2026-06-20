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
`*.test.ts`/`*.test.tsx` and sit next to the code they cover. Phases 1–3 run in
the `node` environment — no browser/jsdom — because they only exercise pure
logic and store state. Phase 4 (component) tests opt into `jsdom` per-file via
a `// @vitest-environment jsdom` pragma.

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

## Phase 3 — stores: lexicon + translation-lexicon state (done)

| File | Covers |
|---|---|
| `src/store/useLexiconStore.test.ts` | `getActiveLexicon()` resolution (`null` → default; matching id → doc's lexicon; stale id with no matching doc → default, the defensive `??` branch); `loadLexicons()` validation (stale active id falls back to `null` and clears storage, a valid id survives unchanged, a `null` id stays untouched); `createLexicon` prepending newest-first; `updateLexicon` patching in place with a fresh `updatedAt`; `deleteLexicon` resetting `activeLexiconId` only when the deleted doc was active; `duplicateLexicon` naming/cloning and throwing on a missing source; `setActiveLexiconId`'s two distinct persistence calls. |
| `src/store/useTranslationLexiconStore.test.ts` | The same behaviours, mirrored for the translation-lexicon store. |

Both files mock their own Firestore wrapper module (`lexiconFirestore.ts` /
`translationLexiconFirestore.ts`) and their own `localStorage` helper module
(`activeLexicon.ts` / `activeTranslationLexicon.ts`) — the boundaries the
stores already import through — rather than the raw Firebase SDK or
`localStorage` itself. Store state is reset between tests via
`useXStore.setState(...)` rather than re-importing the module, since the
store is a plain Zustand singleton.

## Phase 4 — components: TranslationLexiconEditor (done)

| File | Covers |
|---|---|
| `src/components/meme/TranslationLexiconEditor.test.tsx` | The sign-in gate when there is no user; the default vocabulary renders as active for a signed-in user with no saved lexicons; saving a new draft (`Edit` → fill name → `Save as new`) calls `createTranslationLexicon` with the expected payload and switches the active vocabulary to the new doc; activating a saved lexicon from the library switches `activeLexiconId` and the row's `Active` badge. |

Added `jsdom` and `@testing-library/react` as dev dependencies. This file uses
the real `useTranslationLexiconStore` (reset via `setState` between tests,
same as Phase 3) with the Firestore and `localStorage` boundary modules
mocked, plus a mocked `useAuthContext` — so the test exercises real
component-store wiring, not a fully-stubbed store. Other files stay in the
`node` environment; only `.test.tsx` files pay the jsdom cost, opted in
per-file via the `// @vitest-environment jsdom` pragma.

## How we grow it — next passes

Roughly in priority order. Each is a self-contained follow-up PR.

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
