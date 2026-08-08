import { describe, it, expect } from 'vitest';
import {
  composeSheetSvg,
  scopeVariationClasses,
  sheetBounds,
} from './decodeSheetExport';
import { TILE_SIZE } from './snapUtils';
import type { CanvasTile, DecodeUnderlay } from '../../store/useDecodeStore';

const tile = (
  id: string,
  variationId: string,
  x: number,
  y: number,
  rotation: 0 | 1 | 2 | 3 = 0,
): CanvasTile => ({ id, variationId, x, y, rotation });

const underlay = (over: Partial<DecodeUnderlay> = {}): DecodeUnderlay => ({
  id: 'u1',
  source: 'plan',
  label: 'Ground floor plan',
  visible: true,
  opacity: 1,
  dataUrl: 'data:image/png;base64,AAAA',
  thumbnailDataUrl: 'data:image/jpeg;base64,BBBB',
  imageHash: 'deadbeef',
  width: 100,
  height: 50,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scale: 1,
  ...over,
});

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

  it('frames an underlay that reaches past the tiles, rather than slicing it', () => {
    const tiles = [tile('a', 'v-01', 0, 0)];
    const plan = underlay({ width: 900, height: 700, offsetX: -400, offsetY: -300 });
    const b = sheetBounds(tiles, [plan])!;
    expect(b.minX).toBeLessThan(-400);
    expect(b.minY).toBeLessThan(-300);
    expect(b.minX + b.width).toBeGreaterThan(500);
    expect(b.minY + b.height).toBeGreaterThan(400);
  });

  it('exports an underlay on its own, with no tiles placed', () => {
    const b = sheetBounds([], [underlay({ width: 200, height: 100 })]);
    expect(b).not.toBeNull();
    expect(b!.width).toBeGreaterThan(200);
  });

  it('ignores hidden layers', () => {
    const tiles = [tile('a', 'v-01', 0, 0)];
    const hidden = underlay({ visible: false, width: 5000, height: 5000 });
    expect(sheetBounds(tiles, [hidden])).toEqual(sheetBounds(tiles));
    expect(sheetBounds([], [hidden])).toBeNull();
  });

  it('measures a rotated underlay by its true extent, not its unrotated box', () => {
    // 100×50 turned 90° occupies x∈[-50,0], y∈[0,100] about its own corner.
    const b = sheetBounds([], [underlay({ rotation: 90 })])!;
    expect(b.minX).toBeCloseTo(-50 - TILE_SIZE * 0.25);
    expect(b.width).toBeCloseTo(50 + TILE_SIZE * 0.5);
    expect(b.height).toBeCloseTo(100 + TILE_SIZE * 0.5);
  });

  it('is still null with nothing drawn and nothing registered', () => {
    expect(sheetBounds([], [])).toBeNull();
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

  describe('underlay layers', () => {
    const tiles = [tile('a', 'v-01', 0, 0)];
    const compose = (layers: DecodeUnderlay[]) =>
      composeSheetSvg(tiles, sources, sheetBounds(tiles, layers)!, layers);

    it('embeds each visible layer as its own named group, at its registration', () => {
      const svg = compose([
        underlay({ offsetX: -60, offsetY: 20, width: 300, height: 200, scale: 0.5 }),
      ]);
      expect(svg).toContain('id="underlay-1-ground-floor-plan"');
      expect(svg).toContain('transform="translate(-60 20)"');
      expect(svg).toContain('width="150" height="100"');
      expect(svg).toContain('xlink:href="data:image/png;base64,AAAA"');
      expect(svg).toContain('xmlns:xlink=');
    });

    it('draws layers beneath the tiles', () => {
      const svg = compose([underlay()]);
      expect(svg.indexOf('<image')).toBeLessThan(svg.indexOf('<use '));
    });

    it('paints the stack bottom-up — index 0 is the top layer', () => {
      const svg = compose([
        underlay({ id: 'u1', label: 'Top' }),
        underlay({ id: 'u2', label: 'Bottom' }),
      ]);
      // Numbered as the list reads, emitted in reverse so the top layer wins.
      expect(svg.indexOf('id="underlay-2-bottom"')).toBeLessThan(
        svg.indexOf('id="underlay-1-top"'),
      );
    });

    it('leaves hidden layers out entirely', () => {
      const svg = compose([underlay({ visible: false })]);
      expect(svg).not.toContain('<image');
    });

    it('carries rotation and partial opacity through', () => {
      const svg = compose([underlay({ rotation: 30, opacity: 0.4 })]);
      expect(svg).toContain('opacity="0.4"');
      expect(svg).toContain('rotate(30)');
    });

    it('falls back to the thumbnail when the full-res URL is gone', () => {
      const svg = compose([underlay({ dataUrl: null })]);
      expect(svg).toContain('xlink:href="data:image/jpeg;base64,BBBB"');
    });

    it('is unchanged when no layers are registered', () => {
      expect(compose([])).not.toContain('<image');
    });
  });
});
