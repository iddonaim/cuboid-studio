import { CanvasTile } from '../../store/useDecodeStore';
import { getSnapPoints } from './snapPoints';

export const TILE_SIZE = 120;
export const SNAP_RADIUS = 20;
export const SNAP_POINT_RADIUS = 6;

export interface Point2D {
  x: number;
  y: number;
}

export function rotatePoint(p: Point2D, center: Point2D, rotation: number): Point2D {
  const rad = (rotation * Math.PI) / 2;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function transformWorldPoint(local: Point2D, tile: CanvasTile): Point2D {
  const localCenter = { x: TILE_SIZE / 2, y: TILE_SIZE / 2 };
  const rotated = rotatePoint(local, localCenter, tile.rotation);
  return { x: tile.x + rotated.x, y: tile.y + rotated.y };
}

export function worldSnapPoints(tile: CanvasTile): Point2D[] {
  return getSnapPoints(tile.variationId).map(sp =>
    transformWorldPoint({ x: sp.x * TILE_SIZE, y: sp.y * TILE_SIZE }, tile),
  );
}

export interface ActiveSnap {
  draggedTileId: string;
  draggedPointIndex: number;
  otherTileId: string;
  otherPointIndex: number;
}

export function findClosestSnap(
  dragged: CanvasTile,
  others: CanvasTile[],
): (ActiveSnap & { dx: number; dy: number }) | null {
  const draggedPoints = worldSnapPoints(dragged);
  let best: (ActiveSnap & { dx: number; dy: number; dist: number }) | null = null;

  for (const other of others) {
    if (other.id === dragged.id) continue;
    const otherPoints = worldSnapPoints(other);

    for (let di = 0; di < draggedPoints.length; di++) {
      const dp = draggedPoints[di];
      for (let oi = 0; oi < otherPoints.length; oi++) {
        const op = otherPoints[oi];
        const dx = op.x - dp.x;
        const dy = op.y - dp.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= SNAP_RADIUS && (!best || dist < best.dist)) {
          best = {
            draggedTileId: dragged.id,
            draggedPointIndex: di,
            otherTileId: other.id,
            otherPointIndex: oi,
            dx,
            dy,
            dist,
          };
        }
      }
    }
  }

  if (!best) return null;
  return {
    draggedTileId: best.draggedTileId,
    draggedPointIndex: best.draggedPointIndex,
    otherTileId: best.otherTileId,
    otherPointIndex: best.otherPointIndex,
    dx: best.dx,
    dy: best.dy,
  };
}
