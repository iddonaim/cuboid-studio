import Drawing from 'dxf-writer';
import { CanvasTile } from '../../store/useDecodeStore';
import { getSnapPoints } from './snapPoints';
import { TILE_SIZE, transformWorldPoint } from './snapUtils';
import { variation2dPath } from './variation2dPath';

const LAYER = 'DECODE';

interface Point2D {
  x: number;
  y: number;
}

function parseViewBox(svg: SVGSVGElement): { w: number; h: number } {
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/\s+/).map(Number);
    if (parts.length === 4) return { w: parts[2], h: parts[3] };
  }
  const w = parseFloat(svg.getAttribute('width') ?? '120');
  const h = parseFloat(svg.getAttribute('height') ?? '120');
  return { w: w || 120, h: h || 120 };
}

function parseSvgGeometry(svgText: string): {
  lines: [Point2D, Point2D][];
  circles: { center: Point2D; r: number }[];
} {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement as unknown as SVGSVGElement;
  const { w, h } = parseViewBox(svg);
  const sx = TILE_SIZE / w;
  const sy = TILE_SIZE / h;

  const scale = (x: number, y: number): Point2D => ({ x: x * sx, y: y * sy });

  const lines: [Point2D, Point2D][] = [];
  const circles: { center: Point2D; r: number }[] = [];

  for (const el of Array.from(svg.querySelectorAll('line'))) {
    lines.push([
      scale(
        parseFloat(el.getAttribute('x1') ?? '0'),
        parseFloat(el.getAttribute('y1') ?? '0'),
      ),
      scale(
        parseFloat(el.getAttribute('x2') ?? '0'),
        parseFloat(el.getAttribute('y2') ?? '0'),
      ),
    ]);
  }

  for (const el of Array.from(svg.querySelectorAll('circle'))) {
    circles.push({
      center: scale(
        parseFloat(el.getAttribute('cx') ?? '0'),
        parseFloat(el.getAttribute('cy') ?? '0'),
      ),
      r: parseFloat(el.getAttribute('r') ?? '0') * ((sx + sy) / 2),
    });
  }

  for (const el of Array.from(svg.querySelectorAll('rect'))) {
    const x = parseFloat(el.getAttribute('x') ?? '0');
    const y = parseFloat(el.getAttribute('y') ?? '0');
    const rw = parseFloat(el.getAttribute('width') ?? '0');
    const rh = parseFloat(el.getAttribute('height') ?? '0');
    const p1 = scale(x, y);
    const p2 = scale(x + rw, y);
    const p3 = scale(x + rw, y + rh);
    const p4 = scale(x, y + rh);
    lines.push([p1, p2], [p2, p3], [p3, p4], [p4, p1]);
  }

  return { lines, circles };
}

function exportSnapPointFallback(drawing: Drawing, tiles: CanvasTile[]): void {
  for (const tile of tiles) {
    for (const sp of getSnapPoints(tile.variationId)) {
      const world = transformWorldPoint(
        { x: sp.x * TILE_SIZE, y: sp.y * TILE_SIZE },
        tile,
      );
      drawing.drawPoint(world.x, world.y);
    }
  }
}

async function fetchSvgText(variationId: string): Promise<string> {
  const res = await fetch(variation2dPath(variationId));
  if (!res.ok) throw new Error(`Failed to load ${variationId}`);
  return res.text();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadDecodeCompositionDxf(tiles: CanvasTile[]): Promise<void> {
  const drawing = new Drawing();
  drawing.setUnits('Unitless');
  drawing.addLayer(LAYER, Drawing.ACI.RED, 'CONTINUOUS');
  drawing.setActiveLayer(LAYER);

  let geometryCount = 0;

  try {
    for (const tile of tiles) {
      const svgText = await fetchSvgText(tile.variationId);
      const { lines, circles } = parseSvgGeometry(svgText);

      for (const [a, b] of lines) {
        const wa = transformWorldPoint(a, tile);
        const wb = transformWorldPoint(b, tile);
        drawing.drawLine(wa.x, wa.y, wb.x, wb.y);
        geometryCount++;
      }

      for (const { center, r } of circles) {
        const wc = transformWorldPoint(center, tile);
        drawing.drawCircle(wc.x, wc.y, r);
        geometryCount++;
      }
    }

    if (geometryCount === 0) {
      exportSnapPointFallback(drawing, tiles);
    }
  } catch {
    exportSnapPointFallback(drawing, tiles);
  }

  downloadBlob(
    new Blob([drawing.toDxfString()], { type: 'application/dxf' }),
    'decode-composition.dxf',
  );
}
