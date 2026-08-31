/**
 * Candidate-generation logic for Evolution mode, extracted from
 * useEvolutionStore.generateCandidates() as pure functions.
 *
 * Why it lives here and not in the store: the Phase 0 research harness needs
 * to reconstruct an Evolve generation-step's translation requests from a
 * frozen state WITHOUT importing UI code paths (Zustand stores, demo-mode
 * modules) — ruling R2 of the Step 3 rulings, refactor approved 2026-08-30.
 *
 * Behavior-preserving by construction: the logic is moved verbatim from the
 * store; the store now calls these with its live state and the default
 * `Math.random`. The only new capability is the injectable random source
 * (`rng`), which defaults to `Math.random` — identical behavior when not
 * supplied, seedable determinism for research replay when it is.
 */

import type { ArchthesisMeme, CuboidMemeInput } from '../../types/archthesis';
import type { OperatorRecord } from '../operators/types';
import type { PlacedCube } from '../cube/types';
import { mapMemeToCuboidInput } from '../meme-mapper';
import {
  computeCompressibility,
  compressionProgress,
  type CompressibilityScore,
} from './compressibility';

/** Uniform random source in [0, 1) — Math.random-compatible. */
export type Rng = () => number;

export type TargetCubeStrategy = 'random' | 'least-compressed' | 'adaptive';

// ---------------------------------------------------------------------------
// Target cube selection strategies (moved verbatim from useEvolutionStore.ts)
// ---------------------------------------------------------------------------

export function pickTargetCubes(
  cubeIds: string[],
  cubeOperators: Record<string, OperatorRecord[]>,
  count: number,
  strategy: TargetCubeStrategy,
  placedCubes: PlacedCube[],
  rng: Rng = Math.random,
): string[] {
  if (cubeIds.length === 0) return [];
  const n = Math.min(count, cubeIds.length);

  switch (strategy) {
    case 'least-compressed': {
      // Score each cube by its operator count (fewer = less compressed = more interesting to target)
      const scored = cubeIds.map(id => ({
        id,
        opCount: (cubeOperators[id] || []).length,
      }));
      scored.sort((a, b) => a.opCount - b.opCount);

      // Take the least-operated cubes, with some randomness within ties
      const result: string[] = [];
      let i = 0;
      while (result.length < n && i < scored.length) {
        const tieGroup = [scored[i]];
        while (i + 1 < scored.length && scored[i + 1].opCount === scored[i].opCount) {
          i++;
          tieGroup.push(scored[i]);
        }
        // Shuffle the tie group
        for (let j = tieGroup.length - 1; j > 0; j--) {
          const k = Math.floor(rng() * (j + 1));
          [tieGroup[j], tieGroup[k]] = [tieGroup[k], tieGroup[j]];
        }
        for (const item of tieGroup) {
          if (result.length < n) result.push(item.id);
        }
        i++;
      }
      return result;
    }

    case 'adaptive': {
      // Hybrid: 50% least-compressed, 50% random
      const half = Math.ceil(n / 2);
      const leastCompressed = pickTargetCubes(cubeIds, cubeOperators, half, 'least-compressed', placedCubes, rng);
      const remaining = cubeIds.filter(id => !leastCompressed.includes(id));
      const randomPicks = pickTargetCubes(remaining, cubeOperators, n - half, 'random', placedCubes, rng);
      return [...leastCompressed, ...randomPicks];
    }

    case 'random':
    default: {
      const shuffled = [...cubeIds];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }
      return shuffled.slice(0, n);
    }
  }
}

// ---------------------------------------------------------------------------
// Generation planning: targets + sampled memes → resolved assignments
// ---------------------------------------------------------------------------

/**
 * Pool filtering as the store did it inline: an optional case-insensitive
 * tag-substring filter, falling back to the FULL pool when the filter
 * matches nothing (an over-narrow filter degrades rather than empties a
 * generation).
 */
export function filterMemePool(
  memePool: ArchthesisMeme[],
  memePoolFilter: string | null,
): ArchthesisMeme[] {
  const filteredPool = memePoolFilter
    ? memePool.filter(m => m.tags.some(t =>
        t.toLowerCase().includes(memePoolFilter.toLowerCase())
      ))
    : memePool;
  return filteredPool.length > 0 ? filteredPool : memePool;
}

/** One resolved candidate slot: which meme runs against which target cube. */
export interface GenerationAssignment {
  index: number;
  targetCubeId: string;
  meme: ArchthesisMeme;
  /** The translation request fields the meme maps to. */
  input: CuboidMemeInput;
}

export interface PlanGenerationArgs {
  placedCubes: PlacedCube[];
  cubeOperators: Record<string, OperatorRecord[]>;
  populationSize: number;
  targetCubeStrategy: TargetCubeStrategy;
  memePool: ArchthesisMeme[];
  memePoolFilter: string | null;
  rng?: Rng;
}

/**
 * Resolves a generation's assignments exactly as the store's live path did:
 * pick target cubes per strategy, then sample one meme per target uniformly
 * from the (filtered) pool, in target order.
 */
export function planGeneration(args: PlanGenerationArgs): GenerationAssignment[] {
  const rng = args.rng ?? Math.random;

  const targetCubeIds = pickTargetCubes(
    args.placedCubes.map(c => c.id),
    args.cubeOperators,
    args.populationSize,
    args.targetCubeStrategy,
    args.placedCubes,
    rng,
  );

  const pool = filterMemePool(args.memePool, args.memePoolFilter);

  return targetCubeIds.map((cubeId, idx) => {
    const meme = pool[Math.floor(rng() * pool.length)];
    return {
      index: idx,
      targetCubeId: cubeId,
      meme,
      input: mapMemeToCuboidInput(meme),
    };
  });
}

// ---------------------------------------------------------------------------
// Candidate scoring: simulate the cut, measure compression progress
// ---------------------------------------------------------------------------

/** The subset of a two-pass result the simulation consumes. */
export interface CandidateCutterConfig {
  operator: OperatorRecord['operator'];
  targets: OperatorRecord['targets'];
  magnitude: number;
  decay: number;
  reasoning: string;
  cutter: OperatorRecord['cutter'];
}

/**
 * The simulated operator record the store appended inline (`evo-sim-<idx>`),
 * used only to measure what applying the candidate would do to the score.
 * `nowIso` is injectable for deterministic replay; defaults to now, exactly
 * as the inline code did.
 */
export function buildSimulatedOperatorRecord(args: {
  index: number;
  cutterConfig: CandidateCutterConfig;
  memeDescription: string;
  nowIso?: string;
}): OperatorRecord {
  return {
    id: `evo-sim-${args.index}`,
    source: 'meme' as const,
    operator: args.cutterConfig.operator,
    targets: args.cutterConfig.targets,
    magnitude: args.cutterConfig.magnitude,
    decay: args.cutterConfig.decay,
    createdAt: args.nowIso ?? new Date().toISOString(),
    memeDescription: args.memeDescription,
    reasoning: args.cutterConfig.reasoning,
    cutter: args.cutterConfig.cutter,
  };
}

/**
 * Simulates applying one candidate to its target cube and returns the
 * compression progress relative to the baseline — the ranking fitness.
 */
export function scoreCandidateProgress(args: {
  placedCubes: PlacedCube[];
  cubeOperators: Record<string, OperatorRecord[]>;
  baseline: CompressibilityScore;
  targetCubeId: string;
  simulatedRecord: OperatorRecord;
}): number {
  const simulatedOperators = {
    ...args.cubeOperators,
    [args.targetCubeId]: [
      ...(args.cubeOperators[args.targetCubeId] || []),
      args.simulatedRecord,
    ],
  };
  const afterScore = computeCompressibility(args.placedCubes, simulatedOperators);
  return compressionProgress(args.baseline, afterScore);
}
