/**
 * Decode sheet export — vector SVG and transparent PNG
 * ====================================================
 *
 * DXF carries geometry but flattens everything else: no layers, no groups, no
 * named symbols. These two exports are the ones you can actually take into a
 * drawing program.
 *
 * **SVG** inlines the variation drawings as real vectors rather than linking
 * or rasterising them, so the sheet opens as editable artwork. Each variation
 * becomes one `<symbol>` and each placed tile a `<use>` inside a named `<g>` —
 * so a composition of twenty tiles drawn from four variations is four symbol
 * definitions and twenty light references, and the tiles arrive as a named,
 * selectable list rather than one welded blob.
 *
 * The catch that forces the machinery below: every variation file defines its
 * own `.cls-1`, `.cls-2`… in a `<style>` block. Concatenate two of them into
 * one document and the last definition wins for all of them, silently
 * repainting half the drawing. Class names are therefore rewritten per
 * variation before anything is combined.
 *
 * **PNG** comes off the live Konva stage with only the drafting chrome hidden
 * — grid, selection highlight, the interactive snap dots and the registration
 * handles — on a transparent background, matching the 3D capture's cut-out
 * convention. (The tile artwork carries its own connection marks, so hiding
 * the interactive dots loses nothing.)
 *
 * **Both exports carry the underlay stack.** A registered plan or capture is
 * part of the drawing, not chrome: what leaves Decode is what the sheet shows.
 * Hidden layers stay out, and so does anything you only see while editing.
 * SVG embeds each underlay as its own `<image>` inside a named `<g>`, so the
 * layers arrive separable rather than baked into the tile artwork.
 *
 * DXF is the exception and stays geometry-only — the format has no way to
 * carry a raster image, so there is nothing to include.
 */

import type { CanvasTile, DecodeUnderlay } from '../../store/useDecodeStore';
import { TILE_SIZE } from './snapUtils';
import { variation2dPath } from './variation2dPath';

/** Blank margin around the drawing, in canvas world units. */
const EXPORT_PADDING = TILE_SIZE * 0.25;

export interface SheetBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** On-canvas size of an underlay, in world units. */
function underlaySize(layer: DecodeUnderlay): { width: number; height: number } {
  return { width: layer.width * layer.scale, height: layer.height * layer.scale };
}

/**
 * The four world-space corners of a placed underlay.
 *
 * Konva rotates the underlay about its own top-left corner (the node carries
 * no offset), so this mirrors that: rotate the local corners, then translate
 * by the registration. A rotated plan therefore contributes its true extent to
 * the crop instead of an axis-aligned guess that would clip its corners off.
 */
function underlayCorners(layer: DecodeUnderlay): { x: number; y: number }[] {
  const { width, height } = underlaySize(layer);
  const radians = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([x, y]) => ({
    x: layer.offsetX + x * cos - y * sin,
    y: layer.offsetY + x * sin + y * cos,
  }));
}

/** Layers that belong in an export: visible, and with something to draw. */
export function exportableUnderlays(underlays: DecodeUnderlay[]): DecodeUnderlay[] {
  return underlays.filter(u => u.visible && (u.dataUrl ?? u.thumbnailDataUrl));
}

/**
 * Bounding box of everything the sheet draws — placed tiles *and* visible
 * underlays — padded. Null when there is nothing at all to export.
 */
export function sheetBounds(
  tiles: CanvasTile[],
  underlays: DecodeUnderlay[] = [],
): SheetBounds | null {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const tile of tiles) {
    xs.push(tile.x, tile.x + TILE_SIZE);
    ys.push(tile.y, tile.y + TILE_SIZE);
  }

  for (const layer of exportableUnderlays(underlays)) {
    for (const corner of underlayCorners(layer)) {
      xs.push(corner.x);
      ys.push(corner.y);
    }
  }

  if (xs.length === 0) return null;

  const minX = Math.min(...xs) - EXPORT_PADDING;
  const minY = Math.min(...ys) - EXPORT_PADDING;
  const maxX = Math.max(...xs) + EXPORT_PADDING;
  const maxY = Math.max(...ys) + EXPORT_PADDING;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Rewrite a variation's internal class names so several can share a document.
 * `v-12` + `.cls-3` becomes `.v-12-cls-3`, in the style block and on every
 * element that references it.
 */
export function scopeVariationClasses(svgText: string, variationId: string): string {
  return svgText.replace(/cls-(\d+)/g, `${variationId}-cls-$1`);
}

/** Everything between the root <svg …> and </svg>. */
function innerMarkup(svgText: string): string {
  const open = svgText.indexOf('>', svgText.indexOf('<svg'));
  const close = svgText.lastIndexOf('</svg>');
  if (open === -1 || close === -1) return '';
  return svgText.slice(open + 1, close).trim();
}

function viewBoxOf(svgText: string): string {
  return /viewBox="([^"]+)"/.exec(svgText)?.[1] ?? '0 0 100 100';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Fetches each variation drawing once, keyed by id. */
async function loadVariationSources(
  variationIds: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(variationIds));
  const entries = await Promise.all(
    unique.map(async id => {
      const res = await fetchImpl(variation2dPath(id));
      if (!res.ok) throw new Error(`Could not load the drawing for ${id}`);
      return [id, await res.text()] as const;
    }),
  );
  return new Map(entries);
}

/** A label reduced to something legal (and readable) in an `id` attribute. */
function slugifyLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'layer'
  );
}

/**
 * The underlay stack as SVG, one named `<g>` per layer.
 *
 * The image travels inside the file as a base64 data URI, so the sheet stays
 * self-contained — the cost is file size: a full-resolution plan can add
 * megabytes. After a composition restore the full-res URL is gone and the
 * persisted thumbnail stands in, exactly as it does on screen.
 *
 * Index 0 is the top of the stack, so the array is emitted in reverse — the
 * same order the canvas paints it in, and all of it below the tiles.
 */
function composeUnderlays(underlays: DecodeUnderlay[]): string[] {
  return exportableUnderlays(underlays)
    .map((layer, index) => {
      const href = (layer.dataUrl ?? layer.thumbnailDataUrl) as string;
      const { width, height } = underlaySize(layer);
      const rotate = layer.rotation === 0 ? '' : ` rotate(${layer.rotation})`;
      const opacity = layer.opacity >= 1 ? '' : ` opacity="${layer.opacity}"`;
      return `  <g id="underlay-${index + 1}-${escapeXml(slugifyLabel(layer.label))}"${opacity} transform="translate(${layer.offsetX} ${layer.offsetY})${rotate}">
    <image xlink:href="${escapeXml(href)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>
  </g>`;
    })
    .reverse();
}

/**
 * Builds the notation sheet as a self-contained, transparent SVG document.
 * Exported for tests; `downloadDecodeSheetSvg` is the app-facing wrapper.
 */
export function composeSheetSvg(
  tiles: CanvasTile[],
  sources: Map<string, string>,
  bounds: SheetBounds,
  underlays: DecodeUnderlay[] = [],
): string {
  const symbols = Array.from(sources.entries()).map(([id, raw]) => {
    const scoped = scopeVariationClasses(raw, id);
    return `    <symbol id="variation-${escapeXml(id)}" viewBox="${escapeXml(viewBoxOf(scoped))}">
${innerMarkup(scoped)}
    </symbol>`;
  });

  const uses = tiles.map((tile, index) => {
    // Konva rotates a tile about its own centre; mirror that exactly so the
    // export lands on the same geometry the screen shows.
    const rotate =
      tile.rotation === 0
        ? ''
        : ` rotate(${tile.rotation * 90} ${TILE_SIZE / 2} ${TILE_SIZE / 2})`;
    return `  <g id="tile-${index + 1}-${escapeXml(tile.variationId)}" transform="translate(${tile.x} ${tile.y})${rotate}">
    <use href="#variation-${escapeXml(tile.variationId)}" width="${TILE_SIZE}" height="${TILE_SIZE}"/>
  </g>`;
  });

  const layers = composeUnderlays(underlays);

  // xlink:href rather than the SVG2 href: Illustrator and the older drawing
  // programs this sheet is meant to land in still read the linked form, and
  // every browser accepts it. Writing both would double the embedded base64.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}">
  <defs>
${symbols.join('\n')}
  </defs>
${[...layers, ...uses].join('\n')}
</svg>`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadDecodeSheetSvg(
  tiles: CanvasTile[],
  underlays: DecodeUnderlay[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const bounds = sheetBounds(tiles, underlays);
  if (!bounds) return;
  const sources = await loadVariationSources(
    tiles.map(t => t.variationId),
    fetchImpl,
  );
  const svg = composeSheetSvg(tiles, sources, bounds, underlays);
  triggerDownload(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
    `cuboid-decode-sheet-${Date.now()}.svg`,
  );
}

// ── Transparent PNG, off the live stage ──────────────────────────────────
//
// Same shape as the 3D viewport's capture registry: the canvas registers a
// function from inside React, and the export button calls it from outside.

export interface SheetCaptureOptions {
  /** Pixels per canvas world unit. */
  pixelRatio?: number;
}

type SheetCaptureFunction = (options?: SheetCaptureOptions) => string | null;

let sheetCapture: SheetCaptureFunction | null = null;

export function registerSheetCapture(fn: SheetCaptureFunction): void {
  sheetCapture = fn;
}

export function unregisterSheetCapture(): void {
  sheetCapture = null;
}

/** PNG data URL of the drawing, or null when the sheet isn't mounted. */
export function captureSheetPng(options?: SheetCaptureOptions): string | null {
  return sheetCapture?.(options) ?? null;
}

export function downloadDecodeSheetPng(options?: SheetCaptureOptions): boolean {
  const dataURL = captureSheetPng(options);
  if (!dataURL) return false;
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `cuboid-decode-sheet-${Date.now()}.png`;
  a.click();
  return true;
}
