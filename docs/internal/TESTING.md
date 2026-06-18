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
`*.test.ts` and sit next to the code they cover. Phase 1 runs in the `node`
environment — no browser/jsdom — because it only exercises pure logic.

## Philosophy — a pyramid, built bottom-up

Cheap, deterministic tests at the bottom; expensive, brittle ones at the top.
We add a layer only when it earns its keep.

1. **Pure logic** — functions that map input to output with no UI and no
   network. Highest value, zero mocking. *(Phase 1 — done.)*
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

## Phase 1 — pure logic (current)

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

## How we grow it — next passes

Roughly in priority order. Each is a self-contained follow-up PR.

- **Phase 2 — more pure logic.** `compressibility.ts` (the evolution scoring —
  `compressionProgress`, then the heavier `computeCompressibility` with cube
  fixtures), `applyOperator.ts`, and the decode geometry helpers
  (`snapUtils`, `variation2dPath`). Same node environment, no new tooling.
- **Phase 3 — stores.** `useTranslationLexiconStore` and `useLexiconStore` are
  the first targets: the stale-active-id-falls-back-to-default behaviour is a
  real correctness guarantee worth a test. Requires a small Firestore mock.
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
