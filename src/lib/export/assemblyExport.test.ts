import { describe, it, expect } from 'vitest';
import { buildAssemblyExport } from './assemblyExport';
import { PlacedCube } from '../cube/types';

const cube = (id: string, position: [number, number, number]): PlacedCube => ({
  id,
  variationId: 'v-00',
  position,
  rotation: { x: 0, y: 0 },
} as PlacedCube);

describe('buildAssemblyExport', () => {
  it('exports positions, rotations and grid metadata', () => {
    const out = buildAssemblyExport([cube('a', [0, 0, 0]), cube('b', [42.6, 0, 0])], {});
    expect(out.cubeCount).toBe(2);
    expect(out.grid.gridStride).toBeCloseTo(42.6);
    expect(out.cubes[1].gridIndex).toEqual([1, 0, 0]);
    expect(out.cubes[0].rotationDegrees).toEqual({ x: 0, y: 0 });
    expect(out.bounds.min[0]).toBeCloseTo(-21);
    expect(out.bounds.max[0]).toBeCloseTo(42.6 + 21);
  });

  it('serialises an empty assembly with finite bounds (delete-last-cube push)', () => {
    const out = buildAssemblyExport([], {});
    expect(out.cubeCount).toBe(0);
    expect(out.cubes).toEqual([]);
    // Must survive JSON round-trip — Infinity would become null
    const roundTrip = JSON.parse(JSON.stringify(out));
    expect(roundTrip.bounds.min).toEqual([0, 0, 0]);
    expect(roundTrip.bounds.max).toEqual([0, 0, 0]);
  });
});
