import { describe, it, expect } from 'vitest';
import { remixDecisions } from './remixDecisions';
import { processRemixResult } from '../../store/useEncodingStore';
import type { EncodedCube } from '../api/encodeSpace';
import type { PlacedCube } from '../cube/types';
import type { OperatorRecord } from '../operators/types';
import { CUBE_SIZE, GRID_STRIDE } from '../cube/constants';

const GROUND = CUBE_SIZE / 2;

const at = (cell: [number, number, number]): [number, number, number] => [
  cell[0] * GRID_STRIDE,
  GROUND + cell[1] * GRID_STRIDE,
  cell[2] * GRID_STRIDE,
];

const seedCube = (id: string, variationId: string, cell: [number, number, number]): PlacedCube => ({
  id,
  variationId,
  position: at(cell),
  rotation: { x: 0, y: 0 },
});

const modelCube = (
  variationId: string,
  cell: [number, number, number],
  extra: Partial<EncodedCube> = {},
): EncodedCube => ({
  variationId,
  position: at(cell),
  rotation: { x: 0, y: 0 },
  ...extra,
});

const ops = (n: number): OperatorRecord[] =>
  Array.from({ length: n }, (_, i) => ({ id: `op-${i}` }) as OperatorRecord);

describe('remixDecisions', () => {
  // The seed the model is handed: three cubes, two of them carrying cuts.
  const seed = [
    seedCube('s-a', 'v-01', [0, 0, 0]),
    seedCube('s-b', 'v-02', [1, 0, 0]),
    seedCube('s-c', 'v-03', [2, 0, 0]),
  ];
  const seedOperators = { 's-a': ops(2), 's-c': ops(3) };

  it('reads keep / transplant / add / discard off a processed result', () => {
    const result = processRemixResult(
      [
        modelCube('v-01', [0, 0, 0]),                            // keep s-a
        modelCube('v-40', [1, 0, 0], { inheritOperators: true }), // transplant s-b
        modelCube('v-55', [0, 1, 0]),                            // add
        // s-c omitted entirely → discarded
      ],
      seed,
    );

    const d = remixDecisions(result, seed, seedOperators);
    expect(d.carried.map(c => c.id)).toEqual(['s-a']);
    expect(d.transplanted).toHaveLength(1);
    expect(d.transplanted[0].inheritFromSeedId).toBe('s-b');
    expect(d.added.map(c => c.variationId)).toEqual(['v-55']);
    expect(d.discarded.map(c => c.id)).toEqual(['s-c']);
    // s-c carried 3 cuts, and they go with it.
    expect(d.discardedOperatorCount).toBe(3);
  });

  it('every seed cube lands in exactly one bucket', () => {
    const result = processRemixResult(
      [
        modelCube('v-01', [0, 0, 0]),
        modelCube('v-40', [1, 0, 0], { inheritOperators: true }),
        modelCube('v-55', [0, 1, 0]),
      ],
      seed,
    );
    const d = remixDecisions(result, seed, seedOperators);

    const accountedSeed =
      d.carried.length + d.transplanted.length + d.discarded.length;
    expect(accountedSeed).toBe(seed.length);
    // ...and every result cube is classified too.
    expect(d.carried.length + d.transplanted.length + d.added.length).toBe(result.length);
  });

  it('keeping everything discards nothing', () => {
    const result = processRemixResult(
      seed.map(c => modelCube(c.variationId, [seed.indexOf(c), 0, 0])),
      seed,
    );
    const d = remixDecisions(result, seed, seedOperators);
    expect(d.carried).toHaveLength(3);
    expect(d.discarded).toEqual([]);
    expect(d.discardedOperatorCount).toBe(0);
  });

  it('keeping nothing discards the whole seed and all its cuts', () => {
    const result = processRemixResult([modelCube('v-60', [9, 0, 9])], seed);
    const d = remixDecisions(result, seed, seedOperators);
    expect(d.carried).toEqual([]);
    expect(d.transplanted).toEqual([]);
    expect(d.added).toHaveLength(1);
    expect(d.discarded.map(c => c.id)).toEqual(['s-a', 's-b', 's-c']);
    expect(d.discardedOperatorCount).toBe(5); // 2 from s-a + 3 from s-c
  });

  it('a replacement that did not ask to inherit discards the cube it displaced', () => {
    // Same cell, different variation, no inheritOperators → the seed cube's
    // cuts are gone even though something stands where it stood.
    const result = processRemixResult([modelCube('v-40', [0, 0, 0])], seed);
    const d = remixDecisions(result, seed, seedOperators);
    expect(d.added).toHaveLength(1);
    expect(d.discarded.map(c => c.id)).toEqual(['s-a', 's-b', 's-c']);
    expect(d.discardedOperatorCount).toBe(5);
  });

  it('counts no lost cuts when the seed carried none', () => {
    const result = processRemixResult([modelCube('v-99', [5, 0, 5])], seed);
    expect(remixDecisions(result, seed, {}).discardedOperatorCount).toBe(0);
  });

  it('an empty seed makes everything an addition', () => {
    const result = processRemixResult([modelCube('v-01', [0, 0, 0])], []);
    const d = remixDecisions(result, [], {});
    expect(d.added).toHaveLength(1);
    expect(d.carried).toEqual([]);
    expect(d.discarded).toEqual([]);
  });
});
