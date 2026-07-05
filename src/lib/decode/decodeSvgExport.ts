import { PlacedCube } from '../cube/types';
import { variation2dPath } from './variation2dPath';

const COLS = 4;
const CELL_W = 120;
const CELL_H = 140;
const GAP = 10;
const IMG_H = 90;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds a single SVG document with all placed cubes in a 4-column grid.
 * Each cell references the variation drawing via &lt;image href="..."&gt;.
 */
export function buildDecodeGridSvg(
  placedCubes: PlacedCube[],
  operatorCounts: Record<string, number>,
): string {
  const rows = Math.max(1, Math.ceil(placedCubes.length / COLS));
  const width = COLS * CELL_W + (COLS - 1) * GAP;
  const height = rows * CELL_H + (rows - 1) * GAP;

  const cells = placedCubes.map((cube, index) => {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const x = col * (CELL_W + GAP);
    const y = row * (CELL_H + GAP);
    const opCount = operatorCounts[cube.id] ?? 0;
    const href = variation2dPath(cube.variationId);
    const label = escapeXml(cube.variationId);
    const evolvedMarker =
      opCount > 0
        ? `<text x="${x + CELL_W - 6}" y="${y + 14}" text-anchor="end" font-family="system-ui,sans-serif" font-size="9" fill="#BC4A1F">evolved ×${opCount}</text>`
        : '';

    return `
  <g transform="translate(${x},${y})">
    <rect width="${CELL_W}" height="${CELL_H}" fill="#ffffff" stroke="#d9d5ca" stroke-width="1" rx="4"/>
    <image href="${escapeXml(href)}" x="8" y="8" width="${CELL_W - 16}" height="${IMG_H}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${CELL_W / 2}" y="${CELL_H - 12}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#5d5a50">${label}</text>
    ${evolvedMarker}
  </g>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f7f5f0"/>
${cells.join('')}
</svg>`;
}

export function downloadDecodeGridSvg(
  placedCubes: PlacedCube[],
  operatorCounts: Record<string, number>,
): void {
  const svg = buildDecodeGridSvg(placedCubes, operatorCounts);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuboid-decode-2d-${Date.now()}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
