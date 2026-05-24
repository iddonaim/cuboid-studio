import snapPointsData from './snapPoints.json';

export interface SnapPoint {
  x: number;
  y: number;
}

export const SNAP_POINTS = snapPointsData as Record<string, SnapPoint[]>;

export function getSnapPoints(variationId: string): SnapPoint[] {
  return SNAP_POINTS[variationId] ?? [];
}
