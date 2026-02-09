"""
Cuboid Studio — Grasshopper Receiver Component
===============================================

Drop this into a GHPython component in Grasshopper.
It polls the local bridge server for the latest assembly
state and outputs structured data trees for parametric use.

Setup:
    1. Start the bridge server:    python cuboid_bridge_server.py
    2. Open Cuboid Studio in browser
    3. In Grasshopper, add a GHPython component
    4. Copy this script into it
    5. Set inputs:
       - poll (bool toggle) — True to fetch, False to pause
       - port (int slider) — default 9877 (HTTP port = bridge WS port + 1)
    6. Connect a Timer component (e.g. 1000ms) to trigger polling

Outputs:
    - positions   : list of Point3d — cube center positions
    - variations   : list of str     — variation IDs (e.g. "v-00")
    - rotations_y  : list of int     — Y-axis rotation (0-3)
    - rotations_x  : list of int     — X-axis rotation (0-3)
    - cutter_ids   : DataTree of int — per-cube cutter indices (4 per cube)
    - operators    : DataTree of str — per-cube operator descriptions
    - cube_size    : float           — cube dimension (42 mm)
    - grid_stride  : float           — grid spacing (42.6 mm)
    - cube_count   : int             — total cubes in assembly
    - raw_json     : str             — full JSON for custom parsing

How it works:
    This component makes an HTTP GET request to the bridge server's
    /state endpoint. The bridge server holds the latest assembly state
    pushed from the Cuboid Studio browser tab via WebSocket.

    The data flow is:
        Browser → (WebSocket) → Bridge Server → (HTTP) → This component

    Alternatively, if you don't want to run the bridge server, you can
    read from a JSON file exported via the "Download JSON" button in
    Cuboid Studio. Set poll=False and use a Read File component instead.
"""

import json
import Rhino.Geometry as rg
import Grasshopper as gh
from Grasshopper.Kernel.Data import GH_Path

# Default HTTP port (bridge server WS port + 1)
if port is None:
    port = 9877

# ─── Fetch from bridge server ─────────────────────────────────────────

raw_json = ""
cube_count = 0
cube_size = 42.0
grid_stride = 42.6

# Output lists
positions = []
variations = []
rotations_y = []
rotations_x = []

# Output data trees
cutter_tree = gh.DataTree[object]()
operator_tree = gh.DataTree[object]()

if poll:
    try:
        import urllib2  # IronPython 2 (Rhino 7)
        url = "http://localhost:{}/state".format(port)
        response = urllib2.urlopen(url, timeout=2)
        raw_json = response.read()
    except ImportError:
        try:
            # Python 3 (Rhino 8+)
            import urllib.request
            url = "http://localhost:{}/state".format(port)
            response = urllib.request.urlopen(url, timeout=2)
            raw_json = response.read().decode("utf-8")
        except Exception as e:
            print("HTTP error: {}".format(e))
            raw_json = ""
    except Exception as e:
        print("HTTP error: {}".format(e))
        raw_json = ""

if raw_json:
    try:
        data = json.loads(raw_json)

        # Grid metadata
        grid = data.get("grid", {})
        cube_size = grid.get("cubeSize", 42.0)
        grid_stride = grid.get("gridStride", 42.6)
        cube_count = data.get("cubeCount", 0)

        cubes = data.get("cubes", [])

        for i, cube in enumerate(cubes):
            # Position as Rhino Point3d
            pos = cube.get("position", [0, 0, 0])
            positions.append(rg.Point3d(pos[0], pos[1], pos[2]))

            # Variation ID
            variations.append(cube.get("variationId", ""))

            # Rotation
            rot = cube.get("rotation", {"x": 0, "y": 0})
            rotations_y.append(rot.get("y", 0))
            rotations_x.append(rot.get("x", 0))

            # Cutter indices (branch per cube)
            path = GH_Path(i)
            for cid in cube.get("cutterIndices", []):
                cutter_tree.Add(cid, path)

            # Operator descriptions (branch per cube)
            ops = cube.get("operators", [])
            if ops:
                for op in ops:
                    desc = "{} ({}) — {}".format(
                        op.get("operator", "?"),
                        op.get("cutter", {}).get("type", "?"),
                        op.get("memeDescription", "")[:60]
                    )
                    operator_tree.Add(desc, path)
            else:
                operator_tree.Add("(no operators)", path)

        print("Loaded {} cubes from bridge".format(cube_count))

    except Exception as e:
        print("JSON parse error: {}".format(e))
else:
    if poll:
        print("No data from bridge (is the server running?)")
    else:
        print("Polling paused")
