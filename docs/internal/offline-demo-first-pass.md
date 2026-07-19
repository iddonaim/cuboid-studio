# Offline demo — first pass (whole circle from saved compositions)

**Date:** 2026-07-19 · **Branch:** `offline-demo-first-pass`
**Supersedes the A-vs-B open decision** in the presentation planning docs and
extends `presentation-offline-investigation.md` (2026-06-09) to the new demo
scope: the WHOLE circle (map → encode → memes → decode) walked live in-app,
offline, from Iddo's real full-circle compositions.

---

## The verdict (Step 0 gate, answered)

**Content: the saved Firebase compositions are the right input.** Verified in
code: `restoreComposition` replays every operator record to rebuild the cut
geometry, and restores the encode reading + lexicon snapshot, photo thumbnails
(embedded data URLs), site context snapshot, meme metadata, evolution and
decode state. Nothing about the circle's content needs faking.

**Transport: Firebase itself cannot carry the demo offline.** Firestore has no
offline persistence configured here, rules are owner-scoped (auth needed), meme
images live on Firebase Storage, and map tiles come from Esri/OSM CDNs. Cold
start with wifi off, none of that resolves.

**So the path is a hybrid of the old Path A and Path B:** the real composition
documents are exported VERBATIM from Firestore into an in-repo bundle
(`public/demo/`), and a demo mode feeds them through the exact same
`restoreComposition` code path. Saved-state content, fixture transport.

(Good news found on the way: the DRACO decoder — the June recon's highest-risk
item — was already self-hosted under `public/draco/` and `.wasm` added to the
service-worker precache. That risk is closed.)

## What this pass built

Demo mode activates with `?demo` in the URL (or a `VITE_OFFLINE_DEMO=1` build).
It changes ONLY data transport; every downstream code path is untouched.

- `src/lib/demo/` — flag detection, bundle types, bundle loader, export logic.
- **Boot:** the app opens straight on the sites map, no sign-in required.
- **Map:** pins and compositions come from `public/demo/bundle.json`; tiles
  render exclusively from pre-seeded `public/demo/tiles/` (deterministic —
  rehearsal looks exactly like the talk, wifi on or off).
- **Restore:** meme-image URLs are rewritten to bundled local copies before
  `restoreComposition` runs, so the restored session never references
  Firebase Storage.
- **Meme browsing:** the Archthesis browser grid serves a bundled snapshot of
  the meme list (search/tags/sort work client-side) instead of
  `/api/fetch-memes`.
- **"Live" translation:** `translateMemeTwoPass` replays the real two-pass
  result harvested from the exported compositions (keyed by meme description).
  The store's phased reading→geometry animation runs unchanged, so the beat
  reads as live. An un-canned meme throws a clear presenter-readable error.
- **Everything under `public/demo/` is service-worker precached** (json/png/jpg
  are already in the PWA glob), so a build visited once online carries the
  whole demo offline thereafter.

**Verified here (real browser, all external requests killed at the routing
layer):** `e2e/offline-demo.spec.ts` boots `?demo`, plots the bundled pin,
opens the site card, and completes a full composition restore — operator
replay, GLB load, local DRACO decode — landing in Encode with zero network.
Full e2e suite (9), unit tests (147), typecheck and production build all pass.

## Authoring the real bundle (Iddo's part, once, online)

1. Open the deployed app signed in, with `?demoExport` in the URL → click
   **Export demo bundle** (bottom-left) → downloads `demo-bundle-raw.json`.
2. `node scripts/build-demo-bundle.mjs demo-bundle-raw.json` — downloads every
   meme image into `public/demo/memes/`, writes `public/demo/bundle.json`.
3. `node scripts/seed-demo-tiles.mjs` — seeds OSM tiles around the exported
   site pins (wide context z8–11, tight per-site z12–17, throttled per OSM
   policy; `--dry-run` prints the tile count first).
4. Commit `public/demo/` and build. Load the build once online; then the
   airplane-mode test below.

## What remains (honest list)

- **The acceptance test** — actual presentation laptop, wifi off, cold start,
  real bundle. Still the only test that counts. Not yet run (needs the real
  bundle, which needs step 1 above).
- **Hero composition lock** — the export takes every composition on every pin;
  fine for a first pass, but the talk should decide which one carries it.
- The **Analysis map sub-view** is a remote iframe (Railway) — dead offline by
  design; demo mode pins the "My sites" view. Don't switch to Analysis live.
- `@google/model-viewer` (AR mode) and font-awesome icons load from CDNs —
  offline, AR breaks and icons render empty. Cosmetic; vendor later if wanted.
- Evolution-mode's single-pass `translateMeme` (v1) is not canned — only the
  two-pass path is. Evolution generation is not an offline demo beat.
- Site placement/geocode UI still calls `/api/geocode` — don't place new sites
  during the demo (read-only use).
