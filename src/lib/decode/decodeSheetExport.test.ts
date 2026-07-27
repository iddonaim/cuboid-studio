import { describe, it, expect } from 'vitest';
import {
  composeSheetSvg,
  scopeVariationClasses,
  sheetBounds,
} from './decodeSheetExport';
import { TILE_SIZE } from './snapUtils';
import type { CanvasTile } from '../../store/useDecodeStore';

const tile = (
  id: string,
  variationId: string,
  x: number,
  y: number,
  rotation: 0 | 1 | 2 | 3 = 0,
): CanvasTile => ({ id, variationId, x, y, rotation });

/** Shaped like the real files in public/2d: a scoped style block plus marks. */
const variationSvg = (stroke: string) => `<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_2" xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.775 51.39 51.39">
  <defs><style>.cls-1 { fill: red; } .cls-2 { stroke: ${stroke}; }</style></defs>
  <g><path class="cls-1" d="M0 0h10v10H0z"/><path class="cls-2" d="M2 2h6v6H2z"/></g>
</svg>`;

describe('sheetBounds', () => {
  it('is null with nothing drawn', () => {
    expect(sheetBounds([])).toBeNull();
  });

  it('wraps the tiles with padding on every side', () => {
    const b = sheetBounds([tile('a', 'v-01', 0, 0), tile('b', 'v-02', 100, 60)])!;
    expect(b.minX).toBeLessThan(0);
    expect(b.minY).toBeLessThan(0);
    // Spans both tiles plus padding at each end.
    expect(b.width).toBeGreaterThan(100 + TILE_SIZE);
    expect(b.height).toBeGreaterThan(60 + TILE_SIZE);
  });

  it('handles tiles at negative coordinates (a snap can grow up and left)', () => {
    const b = sheetBounds([tile('a', 'v-01', -240, -180)])!;
    expect(b.minX).toBeLessThan(-240);
    expect(b.minY).toBeLessThan(-180);
    expect(b.width).toBeGreaterThan(TILE_SIZE);
  });
});

describe('scopeVariationClasses', () => {
  it('namespaces every class reference, in the style block and on elements', () => {
    const out = scopeVariationClasses(variationSvg('#000'), 'v-07');
    expect(out).toContain('.v-07-cls-1');
    expect(out).toContain('class="v-07-cls-2"');
    // No bare class name survives to collide with another variation.
    expect(/(?<!v-07-)cls-\d/.test(out)).toBe(false);
  });
});

describe('composeSheetSvg', () => {
  const sources = new Map([
    ['v-01', variationSvg('#111')],
    ['v-02', variationSvg('#222')],
  ]);

  it('defines each variation once and references it per tile', () => {
    const tiles = [
      tile('a', 'v-01', 0, 0),
      tile('b', 'v-01', 120, 0),
      tile('c', 'v-02', 240, 0),
    ];
    const svg = composeSheetSvg(tiles, sources, sheetBounds(tiles)!);

    // Two symbols for three tiles — the point of using <use>.
    expect(svg.match(/<symbol /g)).toHaveLength(2);
    expect(svg.match(/<use /g)).toHaveLength(3);
    expect(svg).toContain('id="variation-v-01"');
    expect(svg).toContain('href="#variation-v-01"');
  });

  it('keeps the two variations apart once their classes are combined', () => {
    const tiles = [tile('a', 'v-01', 0, 0), tile('b', 'v-02', 120, 0)];
    const svg = composeSheetSvg(tiles, sources, sheetBounds(tiles)!);
    expect(svg).toContain('.v-01-cls-1');
    expect(svg).toContain('.v-02-cls-1');
    // The collision this whole mechanism exists to prevent.
    expect(/(?<!v-0\d-)cls-\d/.test(svg)).toBe(false);
  });

  it('names each tile group so the drawing arrives as a list, not a blob', () => {
    const tiles = [tile('a', 'v-01', 0, 0), tile('b', 'v-02', 120, 0)];
    const svg = composeSheetSvg(tiles, sources, sheetBounds(tiles)!);
    expect(svg).toContain('id="tile-1-v-01"');
    expect(svg).toContain('id="tile-2-v-02"');
  });

  it('rotates about the tile centre, matching what the canvas draws', () => {
    const tiles = [tile('a', 'v-01', 40, 80, 1)];
    const svg = composeSheetSvg(tiles, sources, sheetBounds(tiles)!);
    expect(svg).toContain(
      `transform="translate(40 80) rotate(90 ${TILE_SIZE / 2} ${TILE_SIZE / 2})"`,
    );
  });

  it('omits the rotate for unrotated tiles', () => {
    const tiles = [tile('a', 'v-01', 10, 20)];
    const svg = composeSheetSvg(tiles, sources, sheetBounds(tiles)!);
    expect(svg).toContain('transform="translate(10 20)"');
  });

  it('has no background element — the export is a cut-out', () => {
    const tiles = [tile('a', 'v-01', 0, 0)];
    const svg = composeSheetSvg(tiles, sources, sheetBounds(tiles)!);
    expect(svg).not.toContain('<rect width="100%"');
    expect(svg).not.toContain('fill="#ffffff"');
  });

  it('frames the drawing via the viewBox, so negative coordinates survive', () => {
    const tiles = [tile('a', 'v-01', -300, -200)];
    const b = sheetBounds(tiles)!;
    const svg = composeSheetSvg(tiles, sources, b);
    expect(svg).toContain(`viewBox="${b.minX} ${b.minY} ${b.width} ${b.height}"`);
    expect(svg).toContain('translate(-300 -200)');
  });
});
