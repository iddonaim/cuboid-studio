import React, { useMemo } from 'react';
import { GRID_STRIDE, CUBE_SIZE } from '../../lib/cube/constants';

export const SpatialGrid: React.FC<{ size?: number; levels?: number }> = ({ size = 5, levels = 3 }) => {
  const gridLines = useMemo(() => {
    const positions: number[] = [];
    const halfSize = Math.floor(size / 2);

    for (let y = 0; y <= levels; y++) {
      const yPos = y * GRID_STRIDE;

      for (let z = -halfSize; z <= halfSize; z++) {
        const zEdge = z * GRID_STRIDE - CUBE_SIZE / 2;
        positions.push(-halfSize * GRID_STRIDE - CUBE_SIZE / 2, yPos, zEdge);
        positions.push(halfSize * GRID_STRIDE + CUBE_SIZE / 2, yPos, zEdge);
      }

      for (let x = -halfSize; x <= halfSize; x++) {
        const xEdge = x * GRID_STRIDE - CUBE_SIZE / 2;
        positions.push(xEdge, yPos, -halfSize * GRID_STRIDE - CUBE_SIZE / 2);
        positions.push(xEdge, yPos, halfSize * GRID_STRIDE + CUBE_SIZE / 2);
      }
    }

    for (let x = -halfSize; x <= halfSize; x++) {
      for (let z = -halfSize; z <= halfSize; z++) {
        const xEdge = x * GRID_STRIDE - CUBE_SIZE / 2;
        const zEdge = z * GRID_STRIDE - CUBE_SIZE / 2;
        positions.push(xEdge, 0, zEdge);
        positions.push(xEdge, levels * GRID_STRIDE, zEdge);
      }
    }

    return new Float32Array(positions);
  }, [size, levels]);

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
