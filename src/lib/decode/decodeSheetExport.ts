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
 * **PNG** comes off the live Konva stage with the drafting chrome hidden —
 * grid, plan underlay, selection highlight and the interactive snap dots — on
 * a transparent background, matching the 3D capture's cut-out convention.
 * (The tile artwork carries its own connection marks, so hiding the
 * interactive dots loses nothing.)
 */

import type { CanvasTile } from '../../store/useDecodeStore';
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

/** Bounding box of the placed tiles, padded. Null when nothing is drawn. */
export function sheetBounds(tiles: CanvasTile[]): SheetBounds | null {
  if (tiles.length === 0) return null;
  const minX = Math.min(...tiles.map(t => t.x)) - EXPORT_PADDING;
  const minY = Math.min(...tiles.map(t => t.y)) - EXPORT_PADDING;
  const maxX = Math.max(...tiles.map(t => t.x)) + TILE_SIZE + EXPORT_PADDING;
  const maxY = Math.max(...tiles.map(t => t.y)) + TILE_SIZE + EXPORT_PADDING;
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

/**
 * Builds the notation sheet as a self-contained, transparent SVG document.
 * Exported for tests; `downloadDecodeSheetSvg` is the app-facing wrapper.
 */
export function composeSheetSvg(
  tiles: CanvasTile[],
  sources: Map<string, string>,
  bounds: SheetBounds,
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}">
  <defs>
${symbols.join('\n')}
  </defs>
${uses.join('\n')}
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
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const bounds = sheetBounds(tiles);
  if (!bounds) return;
  const sources = await loadVariationSources(
    tiles.map(t => t.variationId),
    fetchImpl,
  );
  const svg = composeSheetSvg(tiles, sources, bounds);
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
