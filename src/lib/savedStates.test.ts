import { describe, it, expect } from 'vitest';
import { buildAssemblyExport } from './export/assemblyExport';
import { savedStateToPlacedCubes, savedStateToOperators, SavedState } from './savedStates';
import type { PlacedCube } from './cube/types';
import type { OperatorRecord } from './operators/types';

const cube = (id: string, variationId: string): PlacedCube => ({
  id,
  variationId,
  position: [0, 21, 0],
  rotation: { x: 0, y: 0 },
});

const record = (id: string): OperatorRecord => ({
  id,
  source: 'meme',
  operator: 'erosion',
  targets: ['threshold'],
  magnitude: 0.4,
  decay: 0.1,
  createdAt: '2026-07-01T00:00:00.000Z',
  memeDescription: 'a cat wedged in a fence',
  reasoning: 'porosity',
  cutter: {
    type: 'sphere',
    proportions: [1, 1, 1],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  },
} as OperatorRecord);

function savedStateFrom(
  cubes: PlacedCube[],
  cubeOperators: Record<string, OperatorRecord[]>,
): SavedState {
  return {
    id: 'save-1',
    name: 'Assembly 1',
    savedAt: '2026-07-01T00:00:00.000Z',
    cubeCount: cubes.length,
    data: buildAssemblyExport(cubes, cubeOperators),
  };
}

describe('saved-state rehydration', () => {
  it('round-trips the per-cube cuts a save carries, keyed by cube id', () => {
    const cubes = [cube('a', 'v-01'), cube('b', 'v-02')];
    const state = savedStateFrom(cubes, { a: [record('op-1'), record('op-2')] });

    const operators = savedStateToOperators(state);
    expect(Object.keys(operators)).toEqual(['a']);
    expect(operators.a).toHaveLength(2);
    expect(operators.a[0].id).toBe('op-1');
    expect(operators.a[0].operator).toBe('erosion');
    expect(operators.a[0].cutter.type).toBe('sphere');
    expect(operators.a[0].magnitude).toBeCloseTo(0.4);
  });

  it('cubes and operators share ids, so rebuilt geometry lands on the right cube', () => {
    const cubes = [cube('a', 'v-01'), cube('b', 'v-02')];
    const state = savedStateFrom(cubes, { b: [record('op-1')] });

    const placed = savedStateToPlacedCubes(state);
    const operators = savedStateToOperators(state);
    for (const id of Object.keys(operators)) {
      expect(placed.some(c => c.id === id)).toBe(true);
    }
    expect(placed.map(c => c.id)).toEqual(['a', 'b']);
  });

  it('an assembly with no cuts rehydrates to an empty operator map', () => {
    const state = savedStateFrom([cube('a', 'v-01')], {});
    expect(savedStateToOperators(state)).toEqual({});
  });
});
