# Axonometric wireframe views

PNG output of the `?axon` generator route.

For each cube variation, four 45° top-angled axonometric wireframe renders are
produced (lines only, transparent background):

- `v-XX-top-ne.png`
- `v-XX-top-nw.png`
- `v-XX-top-se.png`
- `v-XX-top-sw.png`

## How to (re)generate

### Headless (recommended)

From the project root:

```sh
npm install --no-save puppeteer
npm run dev   # in a second terminal
node scripts/render-axon-views.cjs
```

The script drives the `?axon&auto` route in headless Chromium and writes the
PNGs straight into this folder. Pass `--threshold=N` to override the edge angle
threshold, or `--out=path` to write somewhere else.

### Manual / interactive

1. Run the dev server: `npm run dev`.
2. Open the app at `/?axon`.
3. Click **Generate Axonometric Views**, wait for it to finish (70 cubes × 4
   angles = 280 renders).
4. Click **Download All (zip)** — that gives you `axon-views.zip`.
5. Unzip its contents directly into this folder, then commit.

## Conventions

Geographic: `-Z` is north, `+Z` is south, `+X` is east, `-X` is west. Tilt is
the classic isometric 35.264° from horizontal.

Edge angle threshold defaults to 45° (drops most curved-surface triangulation
seams while preserving real silhouettes/creases). Override with `?threshold=N`
in the URL or `--threshold=N` on the script.
