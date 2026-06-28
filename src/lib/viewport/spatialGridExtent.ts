import { GRID_STRIDE } from '../cube/constants';

export interface GridExtent {
  minCellX: number;
  maxCellX: number;
  minCellZ: number;
  maxCellZ: number;
  levels: number;
}

/** Empty cells of breathing room kept between the assembly and the grid's edge. */
const MARGIN_CELLS = 2;

/** Smallest footprint shown even for an empty/single-cube scene (matches the old fixed default). */
const MIN_HALF_CELLS = 3;
const MIN_LEVELS = 3;

/** Grid footprint sized to always fully enclose the given cube positions, so the grid never runs out under a long composition. */
export function gridExtentFromPositions(
  positions: ReadonlyArray<readonly [number, number, number]>,
): GridExtent {
  if (positions.length === 0) {
    return {
      minCellX: -MIN_HALF_CELLS,
      maxCellX: MIN_HALF_CELLS,
      minCellZ: -MIN_HALF_CELLS,
      maxCellZ: MIN_HALF_CELLS,
      levels: MIN_LEVELS,
    };
  }

  const cellXs = positions.map(p => Math.round(p[0] / GRID_STRIDE));
  const cellYs = positions.map(p => Math.round(p[1] / GRID_STRIDE));
  const cellZs = positions.map(p => Math.round(p[2] / GRID_STRIDE));

  return {
    minCellX: Math.min(-MIN_HALF_CELLS, Math.min(...cellXs) - MARGIN_CELLS),
    maxCellX: Math.max(MIN_HALF_CELLS, Math.max(...cellXs) + MARGIN_CELLS),
    minCellZ: Math.min(-MIN_HALF_CELLS, Math.min(...cellZs) - MARGIN_CELLS),
    maxCellZ: Math.max(MIN_HALF_CELLS, Math.max(...cellZs) + MARGIN_CELLS),
    levels: Math.max(MIN_LEVELS, Math.max(...cellYs) + MARGIN_CELLS),
  };
}
