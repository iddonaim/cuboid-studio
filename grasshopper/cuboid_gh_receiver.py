"""
Cuboid Studio — Grasshopper Receiver Component
===============================================

Drop this into a GHPython / Python script component in Grasshopper.
It polls the local bridge server for the latest assembly state and
rebuilds the REAL carved geometry: base cube minus its 4 master
cutters, minus every meme-operator cut, rotated and placed exactly
as in the Cuboid Studio viewport (remapped Y-up -> Z-up for Rhino).

Setup:
    1. Start the bridge server:    python3 cuboid_bridge_server.py
    2. Open Cuboid Studio in browser, click Connect (Export panel)
    3. In Grasshopper, add a Python script component
    4. Copy this script into it
    5. Inputs (add/rename on the left edge):
       - poll (bool toggle) — True to fetch, False to pause
       - port (int) — optional; unconnected uses 9876
    6. Outputs (add/rename on the right edge):
       - boxes — the carved cubes (previews in the viewport by itself)
       - plus any of the data outputs below
    7. Attach a Timer (~1000 ms) to the component body for live updates

Outputs:
    - boxes        : list of Brep   — fully carved cubes: master cutters,
                                      1.6 mm shell with one open face,
                                      then meme operator cuts — upright
                                      in Rhino (Z-up), placed and rotated
    - positions   : list of Point3d — cube centers, Rhino Z-up (they sit
                                      at the centers of the boxes output)
    - variations   : list of str     — variation IDs (e.g. "v-00")
    - rotations_y  : list of int     — Y-axis rotation (0-3)
    - rotations_x  : list of int     — X-axis rotation (0-3)
    - cutter_ids   : DataTree of int — per-cube cutter indices (4 per cube)
    - operators    : DataTree of str — per-cube operator descriptions
    - cube_size    : float           — cube dimension (42 mm)
    - grid_stride  : float           — grid spacing (42.6 mm)
    - cube_count   : int             — total cubes in assembly
    - raw_json     : str             — full JSON for custom parsing

Carving is cached per unique (variation, rotation, operator-history)
combination, so booleans run once per distinct cube form; timer ticks
after that only re-place cached solids.
"""

import json
import math
import Rhino.Geometry as rg
import Grasshopper as gh
from Grasshopper.Kernel.Data import GH_Path

try:
    import scriptcontext
    _CACHE = scriptcontext.sticky
except Exception:
    _CACHE = {}

TOL = 0.01
CUBE = 42.0
HALF = CUBE / 2.0
SHELL = 1.6  # wall thickness (src/lib/cube/constants.ts, golden-ratio homage)

# ─── Master cutters ───────────────────────────────────────────────────
# Ported from src/lib/cube/specifications.ts — keep in sync with the app.
# Cube-local space: corner origin, cube spans (0,0,0)..(42,42,42), Y up.
# Cylinders are centered on the cube (span 21 ± 25.5 along their axis),
# matching the app's runtime CSG in src/lib/cube/csgUtils.ts.
MASTER_CUTTERS = [
    {"type": "sphere", "center": (6.30, 0.00, 13.44), "radius": 16.18034},
    {"type": "sphere", "center": (42.00, 14.40, 29.20), "radius": 9.864601},
    {"type": "sphere", "center": (26.54, 42.00, 40.90), "radius": 13.0},
    {"type": "sphere", "center": (0.00, 24.30, 29.10), "radius": 17.085938},
    {"type": "cylinder", "axis": "Y", "pos": (21.0, 21.0), "radius": 16.18034, "length": 51.0},
    {"type": "cylinder", "axis": "X", "pos": (21.0, 21.0), "radius": 9.864601, "length": 51.0},
    {"type": "cylinder", "axis": "Y", "pos": (40.20, 21.0), "radius": 13.0, "length": 51.0},
    {"type": "sphere", "center": (0.00, 37.00, 21.25), "radius": 17.085938},
]


def _master_cutter_brep(spec):
    if spec["type"] == "sphere":
        return rg.Sphere(rg.Point3d(*spec["center"]), spec["radius"]).ToBrep()
    r, length = spec["radius"], spec["length"]
    a, b = spec["pos"]
    start = HALF - length / 2.0
    if spec["axis"] == "Y":
        plane = rg.Plane(rg.Point3d(a, start, b), rg.Vector3d(0, 1, 0))
    else:  # X
        plane = rg.Plane(rg.Point3d(start, a, b), rg.Vector3d(1, 0, 0))
    return rg.Cylinder(rg.Circle(plane, r), length).ToBrep(True, True)


# ─── Meme-operator cutters ────────────────────────────────────────────
# Mirror of src/lib/operators/applyOperator.ts: proportions x 42 for
# sizes, normalized [-1,1] -> [0,42] for position, Euler XYZ degrees.

def _box_brep(sx, sy, sz):
    plane = rg.Plane(rg.Point3d.Origin, rg.Vector3d(1, 0, 0), rg.Vector3d(0, 1, 0))
    return rg.Box(
        plane,
        rg.Interval(-sx / 2.0, sx / 2.0),
        rg.Interval(-sy / 2.0, sy / 2.0),
        rg.Interval(-sz / 2.0, sz / 2.0),
    ).ToBrep()


def _taper_brep(p0, p1):
    # 4-sided frustum, base side p0*42 narrowing to half at the top,
    # axis along local Y (like the app's rotated 4-segment cylinder).
    s_base, s_top, h = p0 * CUBE, p0 * CUBE * 0.5, p1 * CUBE

    def rect(side, y):
        plane = rg.Plane(rg.Point3d(0, y, 0), rg.Vector3d(1, 0, 0), rg.Vector3d(0, 0, 1))
        half = side / 2.0
        r = rg.Rectangle3d(plane, rg.Interval(-half, half), rg.Interval(-half, half))
        return r.ToNurbsCurve()

    lofted = rg.Brep.CreateFromLoft(
        [rect(s_base, -h / 2.0), rect(s_top, h / 2.0)],
        rg.Point3d.Unset, rg.Point3d.Unset, rg.LoftType.Straight, False,
    )
    if lofted:
        capped = lofted[0].CapPlanarHoles(TOL)
        return capped if capped else lofted[0]
    return _box_brep(s_base, h, s_base)


def _operator_cutter_brep(cutter):
    p = [max(0.01, min(float(v), 2.0)) for v in cutter.get("proportions", [0.3, 0.3, 0.3])]
    ctype = cutter.get("type", "box")

    if ctype == "sphere":
        brep = rg.Sphere(rg.Point3d.Origin, p[0] * HALF).ToBrep()
    elif ctype == "cylinder":
        h = p[1] * CUBE
        plane = rg.Plane(rg.Point3d(0, -h / 2.0, 0), rg.Vector3d(0, 1, 0))
        brep = rg.Cylinder(rg.Circle(plane, p[0] * HALF), h).ToBrep(True, True)
    elif ctype == "plane":
        brep = _box_brep(p[0] * CUBE, 0.5, p[2] * CUBE)
    elif ctype == "taper":
        brep = _taper_brep(p[0], p[1])
    elif ctype == "box":
        brep = _box_brep(p[0] * CUBE, p[1] * CUBE, p[2] * CUBE)
    else:
        s = CUBE * 0.3
        brep = _box_brep(s, s, s)

    # Position: normalized [-1, 1] -> cube-local [0, 42]
    pos = [((max(-1.0, min(float(v), 1.0))) + 1.0) * HALF
           for v in cutter.get("position", [0, 0, 0])]
    rot = [math.radians(float(v)) for v in cutter.get("rotation", [0, 0, 0])]

    # Euler XYZ then translate — same as three.js applyMatrix4 in the app
    xform = rg.Transform.Translation(rg.Vector3d(pos[0], pos[1], pos[2]))
    xform *= rg.Transform.Rotation(rot[0], rg.Vector3d.XAxis, rg.Point3d.Origin)
    xform *= rg.Transform.Rotation(rot[1], rg.Vector3d.YAxis, rg.Point3d.Origin)
    xform *= rg.Transform.Rotation(rot[2], rg.Vector3d.ZAxis, rg.Point3d.Origin)
    brep.Transform(xform)
    return brep


# ─── Carving ──────────────────────────────────────────────────────────

def _subtract(breps, cutter):
    """Subtract one cutter from every piece; keep pieces on failure."""
    out = []
    for b in breps:
        result = rg.Brep.CreateBooleanDifference([b], [cutter], TOL)
        if result:
            out.extend(result)
        else:
            out.append(b)  # failed boolean: keep uncut rather than vanish
    return out


def _shell(breps):
    """Hollow each solid to a 1.6 mm wall, opening the largest flat face.

    Mirrors the app's displayed geometry (pre-shelled GLB models): walls
    of SHELL thickness with one face left open — the one with the
    largest flat surface area. Shelling can fail on gnarly solids; a
    failure keeps the solid piece rather than dropping it.
    """
    out = []
    for b in breps:
        # Group planar faces by their plane (normal + offset), sum areas
        groups = {}
        for i in range(b.Faces.Count):
            face = b.Faces[i]
            rc, plane = face.TryGetPlane(TOL)
            if not rc:
                continue
            n = plane.Normal
            n.Unitize()
            d = n.X * plane.Origin.X + n.Y * plane.Origin.Y + n.Z * plane.Origin.Z
            key = (round(n.X, 3), round(n.Y, 3), round(n.Z, 3), round(d, 1))
            amp = rg.AreaMassProperties.Compute(face)
            area = amp.Area if amp else 0.0
            indices, total = groups.get(key, ([], 0.0))
            groups[key] = (indices + [i], total + area)
        shelled = None
        if groups:
            open_faces = max(groups.values(), key=lambda g: g[1])[0]
            shelled = rg.Brep.CreateShell(b, open_faces, SHELL, TOL)
        out.append(shelled if shelled else b)
    return out


def _carve(cutter_indices, op_cutters):
    """Carved cube in cube-local space, centered at the origin."""
    base_plane = rg.Plane(rg.Point3d.Origin, rg.Vector3d(1, 0, 0), rg.Vector3d(0, 1, 0))
    base = rg.Box(base_plane, rg.Interval(0, CUBE), rg.Interval(0, CUBE),
                  rg.Interval(0, CUBE)).ToBrep()
    breps = [base]
    for idx in cutter_indices:
        if 0 <= idx < len(MASTER_CUTTERS):
            breps = _subtract(breps, _master_cutter_brep(MASTER_CUTTERS[idx]))
    # Shell BEFORE operator cuts — the app applies meme cutters to the
    # already-shelled variation geometry, so a meme cut goes through walls.
    breps = _shell(breps)
    for cutter in op_cutters:
        breps = _subtract(breps, _operator_cutter_brep(cutter))
    center = rg.Transform.Translation(rg.Vector3d(-HALF, -HALF, -HALF))
    for b in breps:
        b.Transform(center)
    return breps


def _carved_for(cube):
    """Cache-aware carve, keyed on everything that shapes this cube."""
    cutter_indices = cube.get("cutterIndices", [])
    op_cutters = [op.get("cutter", {}) for op in cube.get("operators", [])]
    key = "cuboid_carve_v2:" + json.dumps([cutter_indices, op_cutters], sort_keys=True)
    if key not in _CACHE:
        _CACHE[key] = _carve(cutter_indices, op_cutters)
    return _CACHE[key]


# App is Y-up, Rhino is Z-up: +90 deg about world X maps (x,y,z)->(x,-z,y),
# a proper rotation (no mirroring), so assemblies stand upright unmirrored.
MAP_TO_RHINO = rg.Transform.Rotation(math.pi / 2.0, rg.Vector3d.XAxis, rg.Point3d.Origin)


def _placement(cube):
    """Full placement transform in app space, then remap to Rhino Z-up."""
    pos = cube.get("position", [0, 0, 0])
    rot = cube.get("rotation", {"x": 0, "y": 0})
    xform = MAP_TO_RHINO * rg.Transform.Translation(rg.Vector3d(pos[0], pos[1], pos[2]))
    xform *= rg.Transform.Rotation(rot.get("x", 0) * math.pi / 2.0,
                                   rg.Vector3d.XAxis, rg.Point3d.Origin)
    xform *= rg.Transform.Rotation(rot.get("y", 0) * math.pi / 2.0,
                                   rg.Vector3d.YAxis, rg.Point3d.Origin)
    return xform


# ─── Inputs ───────────────────────────────────────────────────────────

# Default port (same as the bridge server). GH sliders often deliver
# floats ("9876.0") and panels deliver strings — urllib rejects both as
# a nonnumeric port, so coerce whatever arrives into an int.
if port is None:
    port = 9876
port = int(float(port))

# ─── Fetch from bridge server ─────────────────────────────────────────

raw_json = ""
cube_count = 0
cube_size = CUBE
grid_stride = 42.6

# Output lists
positions = []
boxes = []
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
        cube_size = grid.get("cubeSize", CUBE)
        grid_stride = grid.get("gridStride", 42.6)
        cube_count = data.get("cubeCount", 0)

        cubes = data.get("cubes", [])
        carve_failures = 0

        for i, cube in enumerate(cubes):
            # Cube center, remapped to Rhino Z-up like the carved solids —
            # each point sits at its cube's center. Raw app coordinates
            # remain available via raw_json.
            pos = cube.get("position", [0, 0, 0])
            positions.append(rg.Point3d(pos[0], -pos[2], pos[1]))

            # Carved solid, placed and remapped upright for Rhino
            try:
                place = _placement(cube)
                for b in _carved_for(cube):
                    dup = b.DuplicateBrep()
                    dup.Transform(place)
                    boxes.append(dup)
            except Exception as e:
                carve_failures += 1
                print("Carve failed for cube {}: {}".format(i, e))

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

        msg = "Loaded {} cubes from bridge ({} carved solids)".format(
            cube_count, len(boxes))
        if carve_failures:
            msg += " — {} cube(s) failed to carve".format(carve_failures)
        print(msg)

    except Exception as e:
        print("JSON parse error: {}".format(e))
else:
    if poll:
        print("No assembly yet — is the bridge server running and "
              "Cuboid Studio connected? (bridge answers but holds no "
              "data until the browser pushes)")
    else:
        print("Polling paused")

cutter_ids = cutter_tree
operators = operator_tree
