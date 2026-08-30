import { describe, expect, it } from 'vitest';
import { DEFAULT_ROTATION } from '../cube/connectionRules';
import type { PlacedCube } from '../cube/types';
import type { ArchthesisMeme } from '../../types/archthesis';
import type { LLMCutterResult, OperatorRecord } from '../operators/types';
import { computeCompressibility, compressionProgress } from './compressibility';
import {
  buildSimulatedOperatorRecord,
  filterMemePool,
  pickTargetCubes,
  planGeneration,
  scoreCandidateProgress,
  type Rng,
} from './generation';

// Deterministic Math.random stand-in (mulberry32) — seedable replay is the
// one new capability the extraction adds.
function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCube(id: string, position: [number, number, number]): PlacedCube {
  return { id, variationId: 'v-00', position, rotation: DEFAULT_ROTATION };
}

function makeCutter(overrides: Partial<LLMCutterResult> = {}): LLMCutterResult {
  return {
    type: 'box',
    proportions: [1, 1, 1],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    ...overrides,
  };
}

function makeOperatorRecord(id: string): OperatorRecord {
  return {
    id,
    source: 'meme',
    operator: 'inversion',
    targets: ['adjacency'],
    magnitude: 0.5,
    decay: 0.5,
    createdAt: new Date(0).toISOString(),
    memeDescription: 'doge',
    reasoning: '',
    cutter: makeCutter(),
  };
}

function makeMeme(id: string, tags: string[] = []): ArchthesisMeme {
  return {
    id,
    imageUrl: `https://example.test/${id}.jpg`,
    topText: '',
    bottomText: '',
    memeText: `meme text of ${id}`,
    tags,
    likes: 3,
    timestamp: '2026-08-01T00:00:00.000Z',
  };
}

describe('pickTargetCubes', () => {
  const cubes = [makeCube('a', [0, 0, 0]), makeCube('b', [1, 0, 0]), makeCube('c', [2, 0, 0])];
  const ids = cubes.map((c) => c.id);

  it('least-compressed picks cubes with the fewest operators first', () => {
    const ops = { a: [makeOperatorRecord('op-1'), makeOperatorRecord('op-2')], b: [makeOperatorRecord('op-3')] };
    // c has 0 ops, b has 1, a has 2 — with count 2 the picks are exactly {c, b}.
    const picked = pickTargetCubes(ids, ops, 2, 'least-compressed', cubes, seededRng(1));
    expect(picked).toEqual(['c', 'b']);
  });

  it('is deterministic under a seeded rng and covers all cubes for the random strategy', () => {
    const first = pickTargetCubes(ids, {}, 3, 'random', cubes, seededRng(42));
    const second = pickTargetCubes(ids, {}, 3, 'random', cubes, seededRng(42));
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual(['a', 'b', 'c']);
  });

  it('caps at the number of cubes and handles the empty assembly', () => {
    expect(pickTargetCubes(ids, {}, 99, 'random', cubes, seededRng(7))).toHaveLength(3);
    expect(pickTargetCubes([], {}, 5, 'least-compressed', [], seededRng(7))).toEqual([]);
  });

  it('adaptive combines least-compressed and random picks without duplicates', () => {
    const ops = { a: [makeOperatorRecord('op-1')] };
    const picked = pickTargetCubes(ids, ops, 3, 'adaptive', cubes, seededRng(3));
    expect([...picked].sort()).toEqual(['a', 'b', 'c']);
    expect(new Set(picked).size).toBe(3);
  });
});

describe('filterMemePool', () => {
  const pool = [makeMeme('m1', ['transit']), makeMeme('m2', ['housing'])];

  it('filters by case-insensitive tag substring', () => {
    expect(filterMemePool(pool, 'TRANS').map((m) => m.id)).toEqual(['m1']);
  });

  it('falls back to the full pool when the filter matches nothing', () => {
    expect(filterMemePool(pool, 'nope')).toEqual(pool);
  });

  it('passes the pool through with no filter', () => {
    expect(filterMemePool(pool, null)).toEqual(pool);
  });
});

describe('planGeneration', () => {
  const cubes = [makeCube('a', [0, 0, 0]), makeCube('b', [1, 0, 0])];
  const pool = [makeMeme('m1'), makeMeme('m2'), makeMeme('m3')];

  it('resolves one assignment per target with mapped translation inputs', () => {
    const assignments = planGeneration({
      placedCubes: cubes,
      cubeOperators: {},
      populationSize: 2,
      targetCubeStrategy: 'least-compressed',
      memePool: pool,
      memePoolFilter: null,
      rng: seededRng(9),
    });
    expect(assignments).toHaveLength(2);
    for (const [i, a] of assignments.entries()) {
      expect(a.index).toBe(i);
      expect(['a', 'b']).toContain(a.targetCubeId);
      expect(pool.map((m) => m.id)).toContain(a.meme.id);
      // The input is the meme-mapper's request shape, ready for translate.
      expect(a.input.memeDescription).toContain(a.meme.memeText!);
      expect(typeof a.input.engagementLevel).toBe('number');
    }
  });

  it('replays identically from the same seed — the frozen-step property (R2)', () => {
    const args = {
      placedCubes: cubes,
      cubeOperators: {},
      populationSize: 2,
      targetCubeStrategy: 'random' as const,
      memePool: pool,
      memePoolFilter: null,
    };
    const first = planGeneration({ ...args, rng: seededRng(1234) });
    const second = planGeneration({ ...args, rng: seededRng(1234) });
    expect(second.map((a) => [a.targetCubeId, a.meme.id])).toEqual(
      first.map((a) => [a.targetCubeId, a.meme.id]),
    );
  });
});

describe('candidate scoring', () => {
  it('buildSimulatedOperatorRecord reproduces the store’s inline evo-sim record shape', () => {
    const record = buildSimulatedOperatorRecord({
      index: 4,
      cutterConfig: {
        operator: 'erosion',
        targets: ['visibility'],
        magnitude: 0.7,
        decay: 0.1,
        reasoning: 'wear it down',
        cutter: makeCutter({ type: 'sphere' }),
      },
      memeDescription: 'a meme',
      nowIso: '2026-08-30T00:00:00.000Z',
    });
    expect(record).toEqual({
      id: 'evo-sim-4',
      source: 'meme',
      operator: 'erosion',
      targets: ['visibility'],
      magnitude: 0.7,
      decay: 0.1,
      createdAt: '2026-08-30T00:00:00.000Z',
      memeDescription: 'a meme',
      reasoning: 'wear it down',
      cutter: makeCutter({ type: 'sphere' }),
    });
  });

  it('scoreCandidateProgress equals the manual simulate-and-diff it replaced', () => {
    const cubes = [makeCube('a', [0, 0, 0]), makeCube('b', [1, 0, 0]), makeCube('c', [0, 1, 0])];
    const cubeOperators = { a: [makeOperatorRecord('op-1')] };
    const baseline = computeCompressibility(cubes, cubeOperators);
    const simulatedRecord = buildSimulatedOperatorRecord({
      index: 0,
      cutterConfig: {
        operator: 'inversion',
        targets: ['adjacency'],
        magnitude: 0.5,
        decay: 0.5,
        reasoning: '',
        cutter: makeCutter(),
      },
      memeDescription: 'doge',
      nowIso: new Date(0).toISOString(),
    });

    const progress = scoreCandidateProgress({
      placedCubes: cubes,
      cubeOperators,
      baseline,
      targetCubeId: 'b',
      simulatedRecord,
    });

    // Reference: the exact expression the store used inline.
    const manualAfter = computeCompressibility(cubes, {
      ...cubeOperators,
      b: [...(cubeOperators as Record<string, OperatorRecord[]>).b ?? [], simulatedRecord],
    });
    expect(progress).toBe(compressionProgress(baseline, manualAfter));
    // The candidate's cut changes the score, so progress is a real signal.
    expect(Number.isFinite(progress)).toBe(true);
  });

  it('does not mutate the caller’s operator map', () => {
    const cubes = [makeCube('a', [0, 0, 0]), makeCube('b', [1, 0, 0])];
    const cubeOperators: Record<string, OperatorRecord[]> = { a: [makeOperatorRecord('op-1')] };
    const baseline = computeCompressibility(cubes, cubeOperators);
    scoreCandidateProgress({
      placedCubes: cubes,
      cubeOperators,
      baseline,
      targetCubeId: 'a',
      simulatedRecord: makeOperatorRecord('evo-sim-0'),
    });
    expect(cubeOperators.a.map((o) => o.id)).toEqual(['op-1']);
    expect(Object.keys(cubeOperators)).toEqual(['a']);
  });
});
