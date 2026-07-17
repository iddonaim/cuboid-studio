# Cuboid Studio — Grasshopper Live-Link

Connect Cuboid Studio (browser) to Rhino/Grasshopper for parametric reconstruction.

## Architecture

```
 Browser (Cuboid Studio)          Local machine            Grasshopper
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│                     │     │                      │     │                  │
│  Assembly state  ───┼POST─▶  Bridge Server    ◀──┼─GET──┤  GH Python comp  │
│  (positions,        │     │  (cuboid_bridge_     │     │  (cuboid_gh_     │
│   variations,       │     │   server.py)         │     │   receiver.py)   │
│   rotations,        │     │                      │     │                  │
│   operators)        │     │  Port 9876 (HTTP)    │     │  Polls /state    │
│                     │     │  stdlib only         │     │  every N seconds │
└─────────────────────┘     └──────────────────────┘     └──────────────────┘
```

## Quick Start

> **No repo needed:** both scripts in this folder can be downloaded straight
> from the app — in the sidebar's **Export & Grasshopper** section, open the
> setup guide (the **Setup Guide & Downloads** button while disconnected, or
> the small **setup guide** link once connected) for the files plus a
> step-by-step walkthrough. The in-app guide is the canonical walkthrough;
> the notes below are the condensed repo-side version.

### 1. Start the bridge server

No installation needed — the server uses only the Python standard library
(Python 3.7+):

```bash
cd grasshopper
python3 cuboid_bridge_server.py   # Windows: py cuboid_bridge_server.py
```

You should see:
```
[Bridge] Listening on http://localhost:9876
```

### 2. Connect from Cuboid Studio

In the browser sidebar, find the **Export** section at the bottom.
Click **Connect** next to "GH Live-Link". The dot turns green when connected.

Every time you place, move, or modify a cube, the assembly state is pushed
to the bridge server automatically.

> Note: if you use the deployed (HTTPS) Cuboid Studio, connecting to the
> local bridge works in Chrome, Edge and Firefox — they treat `localhost`
> as trusted. Safari blocks HTTPS→localhost requests; use Chrome for the
> live-link, or run Cuboid Studio locally.

### 3. Set up Grasshopper

1. Add a **GHPython** component to your canvas
2. Copy the contents of `cuboid_gh_receiver.py` into it
3. Set inputs:
   - `poll` (boolean toggle) — True to fetch, False to pause
   - `port` (integer slider — set the slider's rounding to whole numbers) —
     9876 (same port as the bridge server), or leave unconnected for the default
4. Connect a **Timer** component (e.g. 1000ms interval) to trigger polling

### Outputs from the GH component

| Output | Type | Description |
|--------|------|-------------|
| `boxes` | List<Brep> | Fully carved cubes (master cutters + meme operator cuts), placed, rotated, and remapped upright for Rhino (Z-up) |
| `positions` | List<Point3d> | Cube centers in mm, remapped to Rhino Z-up (coincide with `boxes` centers) |
| `variations` | List<string> | Variation IDs ("v-00" to "v-69") |
| `rotations_y` | List<int> | Y-axis rotation (0-3 = 0/90/180/270 deg) |
| `rotations_x` | List<int> | X-axis rotation (0-3 = 0/90/180/270 deg) |
| `cutter_ids` | DataTree<int> | Per-cube cutter indices (branch per cube, 4 items each) |
| `operators` | DataTree<string> | Per-cube operator descriptions (branch per cube) |
| `cube_size` | float | 42.0 mm |
| `grid_stride` | float | 42.6 mm |
| `cube_count` | int | Total cubes |
| `raw_json` | string | Full JSON for custom parsing |

## Alternative: File-based workflow

If you prefer not to run the bridge server:

1. In Cuboid Studio, click **Download Assembly JSON**
2. In Grasshopper, use a **Read File** component to load the JSON
3. Parse with a GHPython component (same code as `cuboid_gh_receiver.py`,
   but read from file instead of HTTP)

You can also start the bridge server with `--file` to auto-write:
```bash
python cuboid_bridge_server.py --file ./assembly.json
```
Then use a GH **File Watcher** to detect changes.

## JSON Format

```json
{
  "version": 2,
  "exportedAt": "2026-02-09T12:00:00.000Z",
  "grid": {
    "cubeSize": 42,
    "cubeGap": 0.6,
    "gridStride": 42.6,
    "units": "mm"
  },
  "cubeCount": 5,
  "cubes": [
    {
      "id": "cube-1705973234567",
      "variationId": "v-12",
      "cutterIndices": [0, 2, 4, 6],
      "position": [0, 21, 0],
      "gridIndex": [0, 0, 0],
      "rotation": { "x": 0, "y": 1 },
      "rotationDegrees": { "x": 0, "y": 90 },
      "operators": [
        {
          "operator": "inversion",
          "memeDescription": "distracted boyfriend...",
          "cutter": { "type": "sphere", "proportions": [0.3, 0.4, 0.3], ... }
        }
      ]
    }
  ],
  "bounds": {
    "min": [-21, 0, -21],
    "max": [63.6, 42, 63.6]
  }
}
```

## Reconstructing in Grasshopper

With the outputs from the receiver component, you can:

1. **Place base cubes** — use `positions` + `cube_size` to create boxes
2. **Apply boolean cutters** — use `cutter_ids` to look up master cutter geometries
3. **Rotate** — use `rotations_x/y` with Rotate components (multiply by 90 deg)
4. **Replay operators** — parse `operators` tree to apply meme-driven cuts
5. **Generate fabrication drawings** — unroll, label, nest for CNC/laser

## Coordinate System

- Units: millimeters
- Cube origin: corner (0,0,0), extent to (42,42,42)
- Grid stride: 42.6 mm (42 mm cube + 0.6 mm gap)
- Y axis is vertical (up) in Cuboid Studio viewport
- Rhino default is Z-up — remap Y↔Z if needed
