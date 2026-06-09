# Presentation Offline Investigation — Step 0 Verification Gate

**Status:** Read-only recon complete. No app code changed. This document is the only write.
**Date:** 2026-06-09
**Branch:** `claude/stoic-curie-qeeirt`

> **Honesty note on "empirical."** This investigation ran in a headless remote
> container. I could **install dependencies and run a real production build**
> (`npm install` + `npm run build`, both exit 0) and inspect the resulting
> `dist/` bundle and service-worker precache manifest — those are genuine
> observations. I could **not** run a browser, could not run `vercel dev` /
> `vercel env pull` (no Vercel auth/network in this container), and could not
> physically disable the OS network and watch the app behave. So the runtime
> browser-offline conclusions below are **traced from code + build artifacts**,
> not observed in a live offline browser. Everything I only reasoned about is
> collected in the final section and labelled as such.

---

## 1. Recon doc: NOT FOUND

`docs/internal/presentation-offline-investigation.md` does not exist on any
branch.

- `git branch -a` → only `main` and `claude/stoic-curie-qeeirt` (+ their `origin/*`).
- `git log --all --oneline -- docs/internal/` → three commits, all touching
  `HANDOFF.md`/context docs only; no offline-investigation file ever existed in
  history.
- `git log --all --diff-filter=A -- '*presentation-offline*'` and a filesystem
  `find` → nothing.
- `docs/internal/` contains only `HANDOFF.md`.

The prior recon was lost. This document re-establishes it from scratch, and (per
the task) is committed on a branch with a PR so it can't be lost again.

---

## 2. The offline test environment — facts established

- **Serve target:** `package.json` has `build` (`tsc --noEmit && vite build`) and
  `preview` (`vite preview`). A local production build is the correct offline
  serve target; the Vercel URL and `npm run dev` are not. Confirmed `npm run
  build` produces `dist/` cleanly.
- **`/api/*` routes are server-only.** They live in `/api/*.ts` as Vercel
  functions (`encode-space`, `fetch-context-pois`, `fetch-meme-by-id`,
  `fetch-memes`, `geocode`, `translate-meme`). A static `vite preview` of `dist/`
  serves **none** of them — any `fetch('/api/...')` 404s offline. This is
  expected and central to the analysis below.
- **PWA / service worker:** `vite.config.ts` configures `vite-plugin-pwa`
  (`generateSW`, `registerType: 'autoUpdate'`, `globPatterns` includes
  `js,css,html,jpg,jpeg,png,svg,glb,json`, 5 MB max file size). The build
  reported **`precache 224 entries (8506 KiB)`** and emitted `dist/sw.js`.
  - **What the SW caches:** all built JS/CSS/HTML, **all 70 `models/v-*.glb`**
    (verified: 70 GLB entries in `sw.js`), and **all variation thumbnails**
    (`thumbnails/v-*.png`, verified present in `sw.js`). So a previously-visited
    production build loads its own shell and all local geometry assets offline
    from SW cache — this **helps**.
  - **What the SW does NOT cache:** anything cross-origin. `globPatterns` only
    matches files emitted into `dist/`. There is **no `runtimeCaching` rule**, so
    Google's DRACO CDN, Firebase Storage meme images, and `/api/*` responses are
    never precached. This is the crux of the hardening section.
  - **Complication:** `registerType: 'autoUpdate'` + `skipWaiting`/`clientsClaim`
    means the SW tries to check for updates on load. Offline that check simply
    fails silently and the cached version is served — not a blocker, but worth
    knowing the laptop must have loaded the *exact* build being demoed at least
    once online to populate the cache. (Reasoned, not observed — see final
    section.)

---

## 3. The core gate

### 3a. localStorage `savedStates` layer — **FAILS for the demo as imagined** (app-layer, not network)

**The save side works and is offline-clean.** `src/lib/savedStates.ts:saveState`
calls `buildAssemblyExport(placedCubes, cubeOperators)`
(`src/lib/export/assemblyExport.ts`) and writes JSON to localStorage key
`cuboid-saved-states` (max 20 slots). The persisted JSON **does** include, per
cube, the full operator history: `id, operator, targets, magnitude, decay,
memeDescription, reasoning, cutter{type,proportions,position,rotation},
createdAt` (see `ExportedOperator`). So the translation's boolean cut **is
written to disk**.

**The load side throws that away.** The only restore UI is
`SavedStatesPanel.tsx:handleLoad`:

```ts
const handleLoad = (state: SavedState) => {
  const cubes = savedStateToPlacedCubes(state);
  setPlacedCubes(cubes);
};
```

`savedStateToPlacedCubes` (`savedStates.ts`) returns **only**
`{ id, variationId, position, rotation }` per cube. It does **not** read the
`operators` array back. `handleLoad` calls **only** `setPlacedCubes` — it never
writes `cubeOperators`, never rebuilds `cubeGeometryOverrides`, and never touches
the meme store.

**Why that kills the cut visually:** `Viewport3D.tsx` renders each cube's cut
geometry from `useMemeStore.cubeGeometryOverrides[cube.id]`
(`Viewport3D.tsx:251,397`). After a savedStates load those overrides are empty,
so every cube renders as its **base variation geometry** — the meme-driven
boolean cut is gone, even though it sits intact in the saved JSON.

**Field-level persistence summary:**
- Persisted by save, **dropped by load:** per-cube `operators[]` (the entire
  translation cut history).
- Persisted and restored: cube `id`, `variationId`, `position`, `rotation`.
- **Never persisted at all** in this layer: `selectedMemeImageUrl`,
  `selectedMemeTitle`, `memeDescription`, the standalone working-cube operators
  (`useMemeStore.operators` / `workingGeometry`), site context, encode/decode
  state. (`savedStates` only stores the assembly export, nothing else.)

**Verdict:** As written, restoring a savedState gives you the bare cube assembly
with **no translation cut and no meme metadata**. You *can* still perform a brand
new boolean cut on the restored cubes fully offline (the cut path itself is
client-side three-bvh-csg — see 5.1 for the one caveat), but you do **not** get
the saved translation back. The gap is a missing restore-of-operators in
`handleLoad`, not a network dependency. The data needed to fix it is already on
disk.

> Not run: I did not load the app in a browser to watch the cut visibly
> disappear. The conclusion is traced from the code path above (handleLoad →
> setPlacedCubes only; Viewport reads overrides from the meme store).

### 3b. Firestore `compositions` layer — restores the cut correctly, but needs network/auth

One paragraph, as requested: `src/lib/projects/composition.ts` is the *opposite*
of the savedStates layer — `restoreComposition` **does** replay every saved
`OperatorRecord` through `applyLLMOperator` (`rebuildAssemblyGeometry` /
`rebuildStandaloneGeometry`) to rebuild `cubeGeometryOverrides` and the standalone
`workingGeometry`, and it restores meme metadata, site context, encode/decode,
and evolution state. So functionally it is the layer that would bring a
post-translation state back *with the cut present*. But it is a Firestore
document layer, gated by Firebase auth, fetched over the network. With wifi off
and a cold cache, the Firestore read (and very likely auth itself) fails before
restore is attempted; Firestore's IndexedDB offline persistence is not configured
here for this read path. **Not run** (no Firebase auth/network in this
container) — but the architecture makes it the wrong horse for an offline demo
regardless. Its value is as a *reference*: it already contains the exact
operator-replay logic that `handleLoad` is missing.

---

## 4. "Choice among memes" offline — the three injection seams

**4.1 Meme browsing.** `src/components/meme/ArchthesisBrowser.tsx:40` fetches
`/api/fetch-memes?…` and renders `<img src={meme.imageUrl}>`
(`ArchthesisBrowser.tsx:146,210`). Offline, **both** break: the `/api/fetch-memes`
call 404s (no server under `vite preview`), and even with a cached list the
`imageUrl`s are Firebase Storage URLs (the API reads them from Firestore;
`api/fetch-memes.ts:19,50`) that won't load with wifi off.
- **Injection seam for a bundled local meme set:** the `fetchMemes` callback in
  `ArchthesisBrowser.tsx` (the `await fetch('/api/fetch-memes…')` at line 40) is
  the single seam. Replace/short-circuit that one fetch with a local fixture
  array shaped like the existing `/api/fetch-memes` response
  (`src/types/archthesis.ts` defines that shape), and point each fixture's
  `imageUrl` at a bundled `public/` asset instead of Firebase Storage. The rest
  of the browser UI (grid, search debounce, selection) renders unchanged off that
  array. *(Describing the seam only; not implemented.)*

**4.2 Translation.** Live two-pass translation requires `/api/translate-meme`,
which on the server calls OpenRouter/Anthropic (`api/translate-meme.ts:248`,
`process.env.OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY`). **There is no offline
path** — `vite preview` serves no `/api`, and the route needs external LLM
network even when served.
- **Injection seam for a pre-generated translation JSON:** in
  `src/store/useMemeStore.ts`, the translate action calls
  `translateMemeTwoPass(...)` (the `fetch('/api/translate-meme')` lives in
  `src/lib/api/translateMeme.ts`). Substitute a cached
  `TwoPassTranslationResult` for that one awaited call; everything downstream
  (`applyLLMOperator`, the `OperatorRecord` build, `cubeGeometryOverrides`
  update, CutterTweakPanel, revert) runs unchanged.
- **The flow can look live.** The store already drives a phased animation
  independent of the network: it sets `translationPhase: 'reading'`, then after
  the (now cached) result sets `translationPhase: 'geometry'` and
  `await`s a hard-coded `setTimeout(…, 500)` before applying the cut
  (`useMemeStore.ts` ~lines 220, 273). `OperatorResultPanel.tsx:90,99` renders
  off `translationPhase`. So a cached result can be played through the same two
  phases and read as a live translation.

**4.3 N coexisting saved states.** Confirmed in code: `savedStates.ts` keeps an
array under one localStorage key, `MAX_STATES = 20`, newest-first, oldest pruned
(`[newState, ...states].slice(0, MAX_STATES)`). `SavedStatesPanel.tsx` lists all
of them with per-row **Load** / **Delete** buttons, so a presenter can pick among
up to 20 states quickly mid-demo. **Caveat that matters:** per 3a, "Load" today
restores only the bare assembly, not the translation cut — so "20 quick slots"
is real, but each slot currently loads back *without* its cut until `handleLoad`
is taught to replay operators.

---

## 5. Offline hardening inventory

**5.1 DRACO decoder — CONFIRMED the highest-risk item.**
- `src/lib/cube/csgUtils.ts:52` sets the decoder path to
  `https://www.gstatic.com/draco/versioned/decoders/1.5.6/` — a Google CDN.
- **The live cut path absolutely touches it.** `USE_PRECOMPUTED_MODELS = true`
  (`csgUtils.ts:34`), so all geometry loads via `loadVariationFromGLB` →
  `gltfLoader.loadAsync` with the DRACO loader attached. The restore-and-cut path
  (`composition.ts` rebuild, and the standalone working-cube init) all route
  through `getVariationGeometryAsync` → `loadVariationFromGLB`.
- **The GLBs are DRACO-compressed** — verified by grepping the binaries:
  `public/models/v-00/01/02.glb` all contain the
  `KHR_draco_mesh_compression` marker. So the decoder is genuinely needed to
  parse them.
- **The decoder is NOT shipped or cached locally** — verified in the built
  bundle: the gstatic URL appears verbatim in `dist/assets/index-*.js`, **no**
  `*draco*` or `*.wasm` files exist anywhere in `dist/`, and **`gstatic` does not
  appear in `dist/sw.js`** (the SW precaches local assets only, no
  `runtimeCaching`). So from a cold cache with wifi off, the decoder fetch will
  fail.
- **Mitigating wrinkle (reasoned, not observed):** `loadVariationFromGLB` wraps
  the load in try/catch and, on failure, falls back to
  `generateVariationGeometry` (runtime CSG, no network). If a failed decoder
  fetch causes `loadAsync` to reject, the app would fall back to CSG geometry —
  unshelled/solid, visually degraded, but the cut could still proceed. I did not
  run a browser to confirm the fallback fires cleanly vs. hanging. Also, a laptop
  that visited the build online first may have the decoder in HTTP cache, masking
  the problem in rehearsal and surfacing it only on a truly cold machine. **This
  is the single most likely silent killer and should be hardened by self-hosting
  the decoder** (ship the ~1 MB decoder under `public/` and
  `dracoLoader.setDecoderPath('/draco/')` so the SW precaches it).

**5.2 GLB models / local thumbnails — CONFIRMED SAFE.** `public/models/v-*.glb`
and `public/thumbnails/v-*.png` are bundled and (verified) all precached by the
SW. Nothing in the restore-and-cut geometry path fetches a model remotely (the
only remote touch in that path is the DRACO decoder, item 5.1). Note these
`thumbnails/v-*.png` are **cube-variation** thumbnails, distinct from meme
thumbnails (5.4).

**5.3 Site context — CONFIRMED SAFE for the offline session, with a setup
prerequisite.** `src/lib/storage/siteContext.ts` reads/writes localStorage key
`cuboid:activeSiteContext` only; `getActiveSiteContext()` is a pure localStorage
read with no fetch. A preloaded site context survives into the offline session.
The translation *display* path reads it synchronously
(`translateMeme.ts:translateMemeTwoPass` injects `getActiveSiteContext()`), no
render-time network. **Prerequisite:** the context must have been authored/saved
into localStorage on that browser profile before going offline (it is not bundled
as a fixture).

**5.4 Meme images in the live segment — CONFIRMED a hardening item, but the
exposure depends on which save layer is used.**
- The meme image is rendered by **`MemeInputPanel.tsx:142` (`<img
  src={selectedMemeImageUrl}>`)** and in **`ArchthesisBrowser.tsx:146,210`**.
  These URLs are Firebase Storage URLs (origin Firestore `imageUrl`,
  `api/fetch-memes.ts`).
- `OperatorResultPanel` and the operator history render **no** meme image
  (verified: no `<img>` / imageUrl / fetch in that component) — so the
  *post-translation* panels are safe.
- **savedStates path:** `selectedMemeImageUrl` is **not persisted** (5/3a), so
  after a savedStates load `MemeInputPanel` shows no image and makes no fetch — no
  offline error, but also no meme thumbnail.
- **composition path:** `selectedMemeImageUrl` **is** restored, so
  `MemeInputPanel` would emit `<img src={firebasestorage-url}>` and show a broken
  image offline.
- **Hardening item:** if the demo shows the meme image during the live segment,
  the bundled-fixture meme set (4.1) must point `imageUrl` /
  `selectedMemeImageUrl` at a bundled `public/` asset, not a Firebase Storage URL.

---

## 6. Reasoned-but-not-run (explicitly NOT observed)

These are inferences from code/build artifacts; none were exercised in a live
offline browser:

1. **The savedStates cut visibly vanishing on load** — traced from
   `handleLoad`→`setPlacedCubes` + `Viewport3D` reading empty overrides; not seen
   in a running app.
2. **DRACO offline behavior** — that the gstatic fetch rejects offline and
   whether the CSG try/catch fallback then fires cleanly (vs. hangs, vs. is
   masked by HTTP cache from a prior online visit). Not run in a browser.
3. **Firestore/auth failing offline (3b)** — no Firebase credentials/network here;
   the offline-failure claim is architectural inference.
4. **`vercel dev` / `vercel env pull`** — not run; no Vercel auth/network in this
   container. The "two-pass translation needs `/api/translate-meme`" claim is
   from reading `api/translate-meme.ts` (it calls OpenRouter/Anthropic with env
   keys), not from a live call.
5. **SW update-check behavior offline** under `autoUpdate` — that it fails
   silently and serves the cached build. Reasoned from the workbox config.
6. **Whether `vite preview` of a previously-visited build loads fully from SW
   cache with the OS network off** — the precache manifest proves the *intent*
   (224 entries incl. shell + 70 GLBs + thumbnails); I did not boot it offline to
   confirm the SW serves them with no server running.

---

## 7. One-line bottom line (for the path decision, not a recommendation)

The offline-capable layer (localStorage `savedStates`) currently **loses the
translation cut on restore** because `handleLoad` only restores cube placement;
the layer that **restores the cut correctly** (`composition.ts`) is the
network/auth-bound Firestore one. The cleanest offline story reuses
`composition.ts`'s operator-replay logic on the localStorage load path, and must
also neutralize three remote touches: the **DRACO decoder CDN** (highest risk),
the **`/api/translate-meme`** call (pre-generated JSON), and **Firebase Storage
meme images** (bundled fixtures). The where-the-meme-choice-happens decision is
yours to make next; this report stops here per the gate.
