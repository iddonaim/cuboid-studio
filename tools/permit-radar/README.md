# Permit Radar — Tel Aviv

A single-file browser tool: type a Tel Aviv address, get every building-permit
application/permit within a chosen radius (default 100 m) from the
municipality's open GIS, drawn on an interactive 3D model of the surrounding
buildings.

## How to use

1. Download / open `permit-radar.html` in any modern browser (double-click it —
   no server, no install needed).
2. Type an address (or paste coordinates like `32.067, 34.798` from a Google
   Maps link), pick a radius, press **Scan**.
3. Orbit with the mouse. Click a pin or a list card to see the full permit
   record (request number, permit number, dates, description). Green pins have
   a granted permit number; orange pins are applications.
4. For the actual scanned plan drawings ("gramushkas"), the details panel links
   to the municipal engineering archive (handasa.tel-aviv.gov.il) and shows the
   gush/helka to search by — the archive itself requires browsing on the
   municipal site and can't be embedded.

## Where the data comes from (fetched live, in your browser)

| What | Source |
|---|---|
| Geocoding | nominatim.openstreetmap.org |
| Permits ("בקשות והיתרי בניה", layer 772) | gisn.tel-aviv.gov.il ArcGIS REST |
| Parcel gush/helka (layer 524) | gisn.tel-aviv.gov.il ArcGIS REST |
| Building footprints & heights | gisn.tel-aviv.gov.il buildings layer (discovered at runtime), falling back to OpenStreetMap via Overpass |
| 3D rendering | three.js r128 (inlined — the file is self-contained) |

All municipal calls fall back to JSONP (script-tag loading) when the browser
blocks cross-origin `fetch` — notably Safari opening the file locally — so the
tool works there too. Overpass has no JSONP, which is why the municipal layer
is preferred for buildings.

## Caveats

- Tel Aviv only (the permits layer is the municipality's).
- Building heights come from OSM `height`/`building:levels` tags; buildings
  with neither are drawn 10 m tall and flagged as estimated.
- The municipal endpoints are public but not guaranteed stable; the `log`
  button at the top right shows exactly which call failed if a scan comes back
  empty.

## Rebuilding

`permit-radar.html` is generated from an app template with `three.min.js` and
`OrbitControls.js` (three@0.128.0) inlined in place of the
`/*__THREE_MIN_JS__*/` and `/*__ORBIT_CONTROLS_JS__*/` markers. All app code
lives in the final `<script>` block of the file itself.
