import { describe, it, expect } from 'vitest';
import { processRemixResult } from './useEncodingStore';
import type { EncodedCube } from '../lib/api/encodeSpace';
import type { PlacedCube } from '../lib/cube/types';
import { GRID_STRIDE, CUBE_SIZE } from '../lib/cube/constants';

const GROUND = CUBE_SIZE / 2;

function seedCube(id: string, variationId: string, cell: [number, number, number]): PlacedCube {
  return {
    id,
    variationId,
    position: [cell[0] * GRID_STRIDE, GROUND + cell[1] * GRID_STRIDE, cell[2] * GRID_STRIDE],
    rotation: { x: 0, y: 0 },
  };
}

function resultCube(
  variationId: string,
  cell: [number, number, number],
  extra: Partial<EncodedCube> = {},
): EncodedCube {
  return {
    variationId,
    position: [cell[0] * GRID_STRIDE, GROUND + cell[1] * GRID_STRIDE, cell[2] * GRID_STRIDE],
    rotation: { x: 0, y: 0 },
    ...extra,
  };
}

describe('processRemixResult', () => {
  it('kept cube (same cell + variation) inherits the seed cube id', () => {
    const seed = [seedCube('seed-a', 'v-05', [0, 0, 0])];
    const out = processRemixResult([resultCube('v-05', [0, 0, 0])], seed);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('seed-a');
    expect(out[0].inheritFromSeedId).toBe('seed-a');
  });

  it('kept cube keeps its id even when the model rotated it (transform in place)', () => {
    const seed = [seedCube('seed-a', 'v-05', [0, 0, 0])];
    const out = processRemixResult(
      [resultCube('v-05', [0, 0, 0], { rotation: { x: 1, y: 2 } })],
      seed,
    );
    expect(out[0].id).toBe('seed-a');
    expect(out[0].rotation).toEqual({ x: 1, y: 2 });
  });

  it('transplant (same cell, new variation, inheritOperators) gets a new id but records the donor', () => {
    const seed = [seedCube('seed-a', 'v-05', [0, 0, 0])];
    const out = processRemixResult(
      [resultCube('v-40', [0, 0, 0], { inheritOperators: true })],
      seed,
    );
    expect(out[0].id).not.toBe('seed-a');
    expect(out[0].inheritFromSeedId).toBe('seed-a');
  });

  it('replacement without inheritOperators carries nothing forward', () => {
    const seed = [seedCube('seed-a', 'v-05', [0, 0, 0])];
    const out = processRemixResult([resultCube('v-40', [0, 0, 0])], seed);
    expect(out[0].id).not.toBe('seed-a');
    expect(out[0].inheritFromSeedId).toBeUndefined();
  });

  it('cubes on empty cells are new; omitted seed cubes are discarded', () => {
    const seed = [
      seedCube('seed-a', 'v-05', [0, 0, 0]),
      seedCube('seed-b', 'v-06', [1, 0, 0]),
    ];
    // Model keeps seed-a, discards seed-b, adds one new cube elsewhere.
    const out = processRemixResult(
      [resultCube('v-05', [0, 0, 0]), resultCube('v-10', [0, 1, 0])],
      seed,
    );
    expect(out).toHaveLength(2);
    expect(out.map(c => c.id)).toContain('seed-a');
    expect(out.some(c => c.id === 'seed-b' || c.inheritFromSeedId === 'seed-b')).toBe(false);
  });

  it('keeps only the first of two cubes the model placed in one cell', () => {
    const seed: PlacedCube[] = [];
    const out = processRemixResult(
      [resultCube('v-01', [0, 0, 0]), resultCube('v-02', [0, 0, 0])],
      seed,
    );
    expect(out).toHaveLength(1);
    expect(out[0].variationId).toBe('v-01');
  });

  it('grid-snaps sloppy positions before matching seed cells', () => {
    const seed = [seedCube('seed-a', 'v-05', [1, 0, 0])];
    const sloppy: EncodedCube = {
      variationId: 'v-05',
      position: [GRID_STRIDE + 3, GROUND + 2, -1],
      rotation: { x: 0, y: 0 },
    };
    const out = processRemixResult([sloppy], seed);
    expect(out[0].id).toBe('seed-a');
    expect(out[0].position).toEqual([GRID_STRIDE, GROUND, 0]);
  });
});
