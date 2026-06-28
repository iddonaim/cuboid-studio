import React, { useMemo } from 'react';
import { GRID_STRIDE, CUBE_SIZE } from '../../lib/cube/constants';
import type { GridExtent } from '../../lib/viewport/spatialGridExtent';

export const SpatialGrid: React.FC<{ extent: GridExtent }> = ({ extent }) => {
  const { minCellX, maxCellX, minCellZ, maxCellZ, levels } = extent;

  const gridLines = useMemo(() => {
    const positions: number[] = [];
    const xMinEdge = minCellX * GRID_STRIDE - CUBE_SIZE / 2;
    const xMaxEdge = maxCellX * GRID_STRIDE + CUBE_SIZE / 2;
    const zMinEdge = minCellZ * GRID_STRIDE - CUBE_SIZE / 2;
    const zMaxEdge = maxCellZ * GRID_STRIDE + CUBE_SIZE / 2;

    for (let y = 0; y <= levels; y++) {
      const yPos = y * GRID_STRIDE;

      for (let z = minCellZ; z <= maxCellZ; z++) {
        const zEdge = z * GRID_STRIDE - CUBE_SIZE / 2;
        positions.push(xMinEdge, yPos, zEdge);
        positions.push(xMaxEdge, yPos, zEdge);
      }

      for (let x = minCellX; x <= maxCellX; x++) {
        const xEdge = x * GRID_STRIDE - CUBE_SIZE / 2;
        positions.push(xEdge, yPos, zMinEdge);
        positions.push(xEdge, yPos, zMaxEdge);
      }
    }

    for (let x = minCellX; x <= maxCellX; x++) {
      for (let z = minCellZ; z <= maxCellZ; z++) {
        const xEdge = x * GRID_STRIDE - CUBE_SIZE / 2;
        const zEdge = z * GRID_STRIDE - CUBE_SIZE / 2;
        positions.push(xEdge, 0, zEdge);
        positions.push(xEdge, levels * GRID_STRIDE, zEdge);
      }
    }

    return new Float32Array(positions);
  }, [minCellX, maxCellX, minCellZ, maxCellZ, levels]);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={gridLines.length / 3}
          array={gridLines}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#94a3b8" transparent opacity={0.4} />
    </lineSegments>
  );
};
