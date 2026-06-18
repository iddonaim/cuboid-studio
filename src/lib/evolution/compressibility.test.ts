import { describe, it, expect } from 'vitest';
import {
  computeCompressibility,
  compressionProgress,
  createSnapshot,
  type CompressibilityScore,
} from './compressibility';
import { GRID_STRIDE } from '../cube/constants';
import { DEFAULT_ROTATION } from '../cube/connectionRules';
import type { PlacedCube } from '../cube/types';
import type { OperatorRecord, LLMCutterResult } from '../operators/types';

function makeCutter(overrides: Partial<LLMCutterResult> = {}): LLMCutterResult {
  return {
    type: 'box',
    proportions: [1, 1, 1],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    ...overrides,
  };
}

function makeOperatorRecord(overrides: Partial<OperatorRecord> = {}): OperatorRecord {
  return {
    id: 'op-1',
    source: 'meme',
    operator: 'inversion',
    targets: ['adjacency'],
    magnitude: 0.5,
    decay: 0.5,
    createdAt: new Date(0).toISOString(),
    memeDescription: 'doge',
    reasoning: '',
    cutter: makeCutter(),
    ...overrides,
  };
}

function makeCube(id: string, position: [number, number, number]): PlacedCube {
  return { id, variationId: 'v-00', position, rotation: DEFAULT_ROTATION };
}

describe('computeCompressibility — fewer than 2 operated cubes', () => {
  it('returns an all-zero score with zero operated cubes', () => {
    const score = computeCompressibility([makeCube('a', [0, 0, 0])], {});
    expect(score).toEqual({
      total: 0,
      geometricClustering: 0,
      spatialRegularity: 0,
      operatorSequence: 0,
      memeCoherence: 0,
    });
  });

  it('returns an all-zero score with exactly 1 operated cube', () => {
    const cubeA = makeCube('a', [0, 0, 0]);
    const cubeB = makeCube('b', [GRID_STRIDE, 0, 0]);
    const score = computeCompressibility([cubeA, cubeB], { a: [makeOperatorRecord()] });
    expect(score).toEqual({
      total: 0,
      geometricClustering: 0,
      spatialRegularity: 0,
      operatorSequence: 0,
      memeCoherence: 0,
    });
  });
});

describe('computeCompressibility — a fully-specified known assembly', () => {
  // Two cubes sharing one identical operator record. The assembly positions are
  // chosen so the cubes line up on exactly one grid axis (X) and no others, and so
  // that no mirror-image partner exists — that isolates each sub-score to a value
  // that can be hand-verified from the documented algorithm rather than guessed.
  const sharedOp = makeOperatorRecord();
  const cubeA = makeCube('a', [0, 0, 0]);
  const cubeB = makeCube('b', [0, GRID_STRIDE, 2 * GRID_STRIDE]);
  const cubeOperators = { a: [sharedOp], b: [sharedOp] };
  const score = computeCompressibility([cubeA, cubeB], cubeOperators);

  it('scores perfect geometric clustering for identical cut fingerprints', () => {
    expect(score.geometricClustering).toBeCloseTo(1);
  });

  it('scores partial spatial regularity: a shared X-row, blended with zero mirror symmetry', () => {
    // 0.6 * (1 row match / 1 axis group) + 0.4 * (0 symmetry matches) = 0.6
    expect(score.spatialRegularity).toBeCloseTo(0.6);
  });

  it('scores operator-sequence repetition for two matching single-operator histories', () => {
    // n=1 repetition 0.5, n=2 repetition 0, n=3 skipped (sequence too short) → avg 0.25
    expect(score.operatorSequence).toBeCloseTo(0.25);
  });

  it('scores full meme coherence for two identical cuts under the same meme', () => {
    expect(score.memeCoherence).toBeCloseTo(1);
  });

  it('blends the four sub-scores by their documented weights (0.3/0.3/0.2/0.2)', () => {
    expect(score.total).toBeCloseTo(0.3 * 1 + 0.3 * 0.6 + 0.2 * 0.25 + 0.2 * 1); // 0.73
  });
});

describe('computeCompressibility — unrelated cubes', () => {
  it('scores zero on every axis when nothing about the two cubes lines up', () => {
    const cubeC = makeCube('c', [0, 0, 0]);
    const cubeD = makeCube('d', [200, 300, 400]); // shares no rounded grid axis with cubeC
    const cubeOperators = {
      c: [makeOperatorRecord({
        operator: 'drift',
        memeDescription: 'meme-c',
        cutter: makeCutter({ type: 'box', proportions: [0, 0, 0] }),
      })],
      d: [makeOperatorRecord({
        operator: 'erosion',
        memeDescription: 'meme-d',
        cutter: makeCutter({ type: 'sphere', proportions: [0, 0, 0] }),
      })],
    };

    const score = computeCompressibility([cubeC, cubeD], cubeOperators);
    expect(score.geometricClustering).toBeCloseTo(0); // orthogonal one-hot cutter-type vectors
    expect(score.spatialRegularity).toBeCloseTo(0); // no shared row, no mirror match
    expect(score.operatorSequence).toBeCloseTo(0); // 'drift','erosion' share no n-gram
    expect(score.memeCoherence).toBe(0); // each meme group has only 1 member
    expect(score.total).toBeCloseTo(0);
  });
});

describe('compressionProgress', () => {
  const before: CompressibilityScore = {
    total: 0.3, geometricClustering: 0, spatialRegularity: 0, operatorSequence: 0, memeCoherence: 0,
  };
  const after: CompressibilityScore = {
    total: 0.5, geometricClustering: 0, spatialRegularity: 0, operatorSequence: 0, memeCoherence: 0,
  };

  it('is positive when the assembly becomes more compressible ("interesting")', () => {
    expect(compressionProgress(before, after)).toBeCloseTo(0.2);
  });

  it('is negative when the assembly becomes less compressible', () => {
    expect(compressionProgress(after, before)).toBeCloseTo(-0.2);
  });

  it('is zero when nothing changes', () => {
    expect(compressionProgress(before, before)).toBe(0);
  });
});

describe('createSnapshot', () => {
  it('carries generation and score through unchanged, and computes delta from the previous total', () => {
    const score: CompressibilityScore = {
      total: 0.42, geometricClustering: 0.1, spatialRegularity: 0.2, operatorSequence: 0.3, memeCoherence: 0.4,
    };
    const snapshot = createSnapshot(3, score, 0.3);
    expect(snapshot.generation).toBe(3);
    expect(snapshot.score).toBe(score);
    expect(snapshot.delta).toBeCloseTo(0.12);
    expect(typeof snapshot.timestamp).toBe('number');
  });
});
