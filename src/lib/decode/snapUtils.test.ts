import { describe, it, expect } from 'vitest';
import {
  TILE_SIZE,
  rotatePoint,
  transformWorldPoint,
  worldSnapPoints,
  findClosestSnap,
  type Point2D,
} from './snapUtils';
import { getSnapPoints } from './snapPoints';
import type { CanvasTile } from '../../store/useDecodeStore';

function makeTile(overrides: Partial<CanvasTile> = {}): CanvasTile {
  return { id: 'tile-1', variationId: 'v-00', x: 0, y: 0, rotation: 0, ...overrides };
}

/** Position a tile so its snap point `pointIndex` lands exactly at `target + offset`. */
function placeTileAtPoint(
  id: string,
  variationId: string,
  pointIndex: number,
  target: Point2D,
  offset: Point2D = { x: 0, y: 0 },
): CanvasTile {
  const raw = getSnapPoints(variationId);
  return makeTile({
    id,
    variationId,
    rotation: 0,
    x: target.x - raw[pointIndex].x * TILE_SIZE + offset.x,
    y: target.y - raw[pointIndex].y * TILE_SIZE + offset.y,
  });
}

describe('rotatePoint', () => {
  const center = { x: 0, y: 0 };

  it('leaves a point unchanged at rotation 0', () => {
    expect(rotatePoint({ x: 1, y: 0 }, center, 0)).toEqual({ x: 1, y: 0 });
  });

  it('rotates a quarter turn (90°) per unit of rotation', () => {
    const r1 = rotatePoint({ x: 1, y: 0 }, center, 1);
    expect(r1.x).toBeCloseTo(0);
    expect(r1.y).toBeCloseTo(1);
  });

  it('rotates a half turn (180°)', () => {
    const r2 = rotatePoint({ x: 1, y: 0 }, center, 2);
    expect(r2.x).toBeCloseTo(-1);
    expect(r2.y).toBeCloseTo(0);
  });

  it('rotates around a non-origin center', () => {
    const r = rotatePoint({ x: 6, y: 5 }, { x: 5, y: 5 }, 1);
    expect(r.x).toBeCloseTo(5);
    expect(r.y).toBeCloseTo(6);
  });
});

describe('transformWorldPoint', () => {
  it('translates by the tile origin at rotation 0', () => {
    const tile = makeTile({ x: 100, y: 200, rotation: 0 });
    expect(transformWorldPoint({ x: 10, y: 20 }, tile)).toEqual({ x: 110, y: 220 });
  });

  it('rotates around the tile-local center before translating', () => {
    const tile = makeTile({ x: 0, y: 0, rotation: 2 }); // 180°
    const localCenter = TILE_SIZE / 2;
    const point = { x: localCenter + 10, y: localCenter }; // 10px right of center
    const result = transformWorldPoint(point, tile);
    expect(result.x).toBeCloseTo(localCenter - 10);
    expect(result.y).toBeCloseTo(localCenter);
  });
});

describe('worldSnapPoints', () => {
  it('scales lexicon snap points by TILE_SIZE and offsets by the tile position', () => {
    const tile = makeTile({ x: 100, y: 200, rotation: 0 });
    const raw = getSnapPoints('v-00');
    expect(raw.length).toBeGreaterThan(0);
    const world = worldSnapPoints(tile);
    expect(world).toHaveLength(raw.length);
    expect(world[0].x).toBeCloseTo(100 + raw[0].x * TILE_SIZE);
    expect(world[0].y).toBeCloseTo(200 + raw[0].y * TILE_SIZE);
  });

  it('rotates points with the tile instead of just translating them', () => {
    const stillTile = makeTile({ x: 0, y: 0, rotation: 0 });
    const rotatedTile = makeTile({ x: 0, y: 0, rotation: 1 });
    const still = worldSnapPoints(stillTile);
    const rotated = worldSnapPoints(rotatedTile);
    // Same variation, same origin — a 90° turn must move at least one point.
    const moved = still.some((p, i) =>
      Math.abs(p.x - rotated[i].x) > 0.01 || Math.abs(p.y - rotated[i].y) > 0.01
    );
    expect(moved).toBe(true);
  });
});

describe('findClosestSnap', () => {
  it('returns null when no points are within SNAP_RADIUS', () => {
    const dragged = makeTile({ id: 'a', x: 0, y: 0 });
    const other = makeTile({ id: 'b', x: 10_000, y: 10_000 });
    expect(findClosestSnap(dragged, [other])).toBeNull();
  });

  it('never matches the dragged tile against itself', () => {
    const dragged = makeTile({ id: 'a', x: 0, y: 0 });
    expect(findClosestSnap(dragged, [dragged])).toBeNull();
  });

  it('matches a point pair within range and reports the offset needed to align them', () => {
    const dragged = makeTile({ id: 'a', x: 0, y: 0, rotation: 0 });
    const draggedPoint = worldSnapPoints(dragged)[0];
    const other = placeTileAtPoint('b', 'v-00', 0, draggedPoint, { x: 5, y: 0 });

    const snap = findClosestSnap(dragged, [other]);
    expect(snap).not.toBeNull();
    expect(snap!.draggedTileId).toBe('a');
    expect(snap!.otherTileId).toBe('b');
    expect(snap!.draggedPointIndex).toBe(0);
    expect(snap!.otherPointIndex).toBe(0);
    expect(snap!.dx).toBeCloseTo(5);
    expect(snap!.dy).toBeCloseTo(0);
  });

  it('picks the closest candidate when multiple points are within range', () => {
    const dragged = makeTile({ id: 'a', x: 0, y: 0, rotation: 0 });
    const draggedPoints = worldSnapPoints(dragged);
    expect(draggedPoints.length).toBeGreaterThanOrEqual(2);

    const near = placeTileAtPoint('near', 'v-00', 0, draggedPoints[0], { x: 2, y: 0 });
    const far = placeTileAtPoint('far', 'v-00', 1, draggedPoints[1], { x: 15, y: 0 });

    const snap = findClosestSnap(dragged, [far, near]);
    expect(snap).not.toBeNull();
    expect(snap!.otherTileId).toBe('near');
  });
});
