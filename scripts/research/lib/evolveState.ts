/**
 * E3 frozen-state support (ruling R2: step mode is state replay, not a
 * prompt change).
 *
 * A frozen Evolve state pins everything a single generation-step's model
 * requests are built from: the composition (cubes AND their full operator
 * history — ranking scores are compression progress over the composition's
 * cut fingerprints, so the history is load-bearing), the meme pool (by id +
 * content hash), the per-candidate assignments (which meme against which
 * target cube — resolved, so replay carries no sampling randomness), the
 * site context and lexicon identities, and the selection criterion. Its hash
 * is the `step_input_mode: "frozen:<state_hash>"` reference.
 *
 * Step-mode replay is wired (scripts/research/lib/evolveStep.ts — Iddo's go,
 * 2026-08-31), built on the pure generation lib the R2 refactor extracted
 * (src/lib/evolution/generation.ts, cuboid-studio#155).
 *
 * Still deliberately absent, noted in the build report: capturing a
 * FrozenEvolveState from the running app (no export UI exists — states are
 * authored by hand for now), and full CAMPAIGN replay (multi-generation,
 * with the app's sampling).
 */

import { mapMemeToCuboidInput } from '../../../src/lib/meme-mapper.js';
import {
  buildSimulatedOperatorRecord,
  scoreCandidateProgress,
} from '../../../src/lib/evolution/generation.js';
import {
  computeCompressibility,
  type CompressibilityScore,
} from '../../../src/lib/evolution/compressibility.js';
import type { PlacedCube } from '../../../src/lib/cube/types';
import type { Rotation } from '../../../src/lib/cube/connectionRules';
import type { OperatorRecord, TranslationPass2 } from '../../../src/lib/operators/types';
import { sha256HexOfCanonicalJson } from '../../../src/research/hashing.js';
import type { Corpus } from './corpus';

export interface FrozenEvolveStateCube {
  id: string;
  variationId: string;
  position: [number, number, number];
  rotation: { x: number; y: number };
  operator_count: number;
}

export interface FrozenEvolveAssignment {
  candidate_index: number;
  meme_id: string;
  target_cube_id: string;
}

export interface FrozenEvolveState {
  captured_at: string;
  generation_index: number;
  composition: {
    placed_cubes: FrozenEvolveStateCube[];
    /**
     * Full per-cube operator history at capture time, keyed by cube id
     * ({} for a fresh assembly). Required for replay: `operator_count`
     * alone cannot reproduce the ranking scores. Covered by the state hash
     * like everything else.
     */
    cube_operators: Record<string, OperatorRecord[]>;
  };
  meme_pool: Array<{ id: string; content_hash: string }>;
  config: {
    population_size: number;
    target_cube_strategy: string;
    meme_pool_filter: string | null;
  };
  /** Resolved meme × target assignments — replay repeats these exactly. */
  assignments: FrozenEvolveAssignment[];
  site_context_hash: string | null;
  translation_lexicon_hash: string;
  selection_criterion_id: string;
}

/** The one selection criterion the replay implements: highest compression
 *  progress wins — the app's own ranking order, made an explicit criterion. */
export const SUPPORTED_SELECTION_CRITERION = 'max-compression-progress';

/** The hash `step_input_mode: "frozen:<state_hash>"` refers to. */
export async function hashEvolveState(state: FrozenEvolveState): Promise<string> {
  return sha256HexOfCanonicalJson(state);
}

/**
 * Strict parser for a frozen-state JSON file. Everything a replay depends on
 * is checked up front with a precise error — a malformed state must fail
 * before any model spend, not surface as a NaN inside a record.
 */
export function parseFrozenEvolveState(json: string, filePath: string): FrozenEvolveState {
  const fail = (msg: string): never => {
    throw new Error(`frozen state ${filePath}: ${msg}`);
  };
  let state: FrozenEvolveState;
  try {
    state = JSON.parse(json) as FrozenEvolveState;
  } catch (err) {
    return fail(`not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }

  if (!state.captured_at || Number.isNaN(Date.parse(state.captured_at))) fail('captured_at must be an ISO date');
  if (!Number.isInteger(state.generation_index) || state.generation_index < 0) {
    fail('generation_index must be a non-negative integer');
  }

  const cubes = state.composition?.placed_cubes;
  if (!Array.isArray(cubes) || cubes.length === 0) fail('composition.placed_cubes must be a non-empty array');
  const cubeIds = new Set<string>();
  for (const cube of cubes) {
    if (!cube.id || typeof cube.id !== 'string') fail('every placed cube needs an id');
    if (cubeIds.has(cube.id)) fail(`duplicate cube id ${cube.id}`);
    cubeIds.add(cube.id);
    if (typeof cube.variationId !== 'string' || !/^v-\d+$/.test(cube.variationId)) {
      fail(`cube ${cube.id}: variationId must look like v-NN`);
    }
    if (!Array.isArray(cube.position) || cube.position.length !== 3 || cube.position.some((v) => !Number.isFinite(v))) {
      fail(`cube ${cube.id}: position must be [number, number, number]`);
    }
    for (const axis of ['x', 'y'] as const) {
      if (![0, 1, 2, 3].includes(cube.rotation?.[axis] as number)) {
        fail(`cube ${cube.id}: rotation.${axis} must be 0-3`);
      }
    }
  }

  const operators = state.composition?.cube_operators;
  if (!operators || typeof operators !== 'object' || Array.isArray(operators)) {
    fail('composition.cube_operators must be an object (cube id → operator records; {} for a fresh assembly)');
  }
  for (const [cubeId, records] of Object.entries(operators)) {
    if (!cubeIds.has(cubeId)) fail(`cube_operators references unknown cube ${cubeId}`);
    if (!Array.isArray(records)) fail(`cube_operators.${cubeId} must be an array`);
  }

  if (!Array.isArray(state.meme_pool) || state.meme_pool.length === 0) fail('meme_pool must be a non-empty array');
  const poolIds = new Set<string>();
  for (const entry of state.meme_pool) {
    if (!entry.id || typeof entry.id !== 'string') fail('every pool entry needs an id');
    if (!/^[0-9a-f]{64}$/.test(entry.content_hash ?? '')) fail(`pool meme ${entry.id}: content_hash must be sha256 hex`);
    poolIds.add(entry.id);
  }

  if (!Array.isArray(state.assignments) || state.assignments.length === 0) fail('assignments must be a non-empty array');
  state.assignments.forEach((a, i) => {
    if (a.candidate_index !== i) fail(`assignments[${i}].candidate_index must be ${i} (contiguous, in order)`);
    if (!poolIds.has(a.meme_id)) fail(`assignments[${i}] references meme ${a.meme_id} not in meme_pool`);
    if (!cubeIds.has(a.target_cube_id)) fail(`assignments[${i}] targets unknown cube ${a.target_cube_id}`);
  });

  if (state.site_context_hash !== null && !/^[0-9a-f]{64}$/.test(state.site_context_hash ?? '')) {
    fail('site_context_hash must be sha256 hex or null');
  }
  if (!/^[0-9a-f]{64}$/.test(state.translation_lexicon_hash ?? '')) {
    fail('translation_lexicon_hash must be sha256 hex');
  }
  if (state.selection_criterion_id !== SUPPORTED_SELECTION_CRITERION) {
    fail(
      `selection_criterion_id "${state.selection_criterion_id}" is not implemented — the replay supports only ` +
      `"${SUPPORTED_SELECTION_CRITERION}" (a declared criterion must be implemented before it can be replayed)`,
    );
  }

  return state;
}

/** The state's cubes in the app's PlacedCube shape (validated by the parser). */
export function toPlacedCubes(state: FrozenEvolveState): PlacedCube[] {
  return state.composition.placed_cubes.map((cube) => ({
    id: cube.id,
    variationId: cube.variationId,
    position: cube.position,
    rotation: { x: cube.rotation.x, y: cube.rotation.y } as Rotation,
  }));
}

export interface StepTranslationRequest {
  candidate_index: number;
  target_cube_id: string;
  meme_id: string;
  memeDescription: string;
  locationTag: string | null;
  engagementLevel: number;
  memeImageUrl: string | null;
}

/**
 * Rebuilds the exact translation request payloads a frozen state's step
 * makes, one per assignment. The corpus supplies the meme documents; each
 * pool entry's content hash is checked so a meme that changed since capture
 * fails loudly instead of silently replaying different content.
 */
export function buildStepTranslationRequests(
  state: FrozenEvolveState,
  corpus: Corpus,
): StepTranslationRequest[] {
  const byId = new Map(corpus.memes.map((m) => [m.id, m]));

  for (const poolEntry of state.meme_pool) {
    const meme = byId.get(poolEntry.id);
    if (!meme) throw new Error(`frozen state pool meme ${poolEntry.id} not in corpus`);
    if (meme.content_hash !== poolEntry.content_hash) {
      throw new Error(
        `frozen state pool meme ${poolEntry.id} content hash mismatch — ` +
        `stored ${poolEntry.content_hash}, corpus ${meme.content_hash}; the meme changed since capture`,
      );
    }
  }

  return state.assignments.map((assignment) => {
    const meme = byId.get(assignment.meme_id);
    if (!meme) throw new Error(`frozen state assignment meme ${assignment.meme_id} not in corpus`);
    const input = mapMemeToCuboidInput(meme.meme);
    return {
      candidate_index: assignment.candidate_index,
      target_cube_id: assignment.target_cube_id,
      meme_id: assignment.meme_id,
      memeDescription: input.memeDescription,
      locationTag: input.locationTag,
      engagementLevel: input.engagementLevel,
      memeImageUrl: meme.meme.imageUrl || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Deterministic ranking + selection (the generation lib, frozen inputs)
// ---------------------------------------------------------------------------

/** Baseline score of the frozen composition — computed once per step. */
export function stateBaseline(state: FrozenEvolveState): CompressibilityScore {
  return computeCompressibility(toPlacedCubes(state), state.composition.cube_operators);
}

/**
 * Scores one candidate exactly as the app's Evolve loop does: simulate the
 * proposed cut on its target cube and measure compression progress against
 * the frozen baseline. Deterministic given the model response — the sim
 * record's timestamp is pinned to the state's captured_at.
 */
export function scoreStepCandidate(args: {
  state: FrozenEvolveState;
  baseline: CompressibilityScore;
  candidateIndex: number;
  targetCubeId: string;
  memeDescription: string;
  pass2: TranslationPass2;
}): number {
  return scoreCandidateProgress({
    placedCubes: toPlacedCubes(args.state),
    cubeOperators: args.state.composition.cube_operators,
    baseline: args.baseline,
    targetCubeId: args.targetCubeId,
    simulatedRecord: buildSimulatedOperatorRecord({
      index: args.candidateIndex,
      cutterConfig: {
        operator: args.pass2.operator,
        targets: args.pass2.targets,
        magnitude: args.pass2.magnitude,
        decay: args.pass2.decay,
        reasoning: args.pass2.reasoning,
        cutter: args.pass2.cutter,
      },
      memeDescription: args.memeDescription,
      nowIso: args.state.captured_at,
    }),
  });
}

/**
 * Applies the state's selection criterion (max-compression-progress) to the
 * ranking scores. Keys are candidate indices as strings; ties break to the
 * lowest index (stable). Null when nothing scored.
 */
export function selectCandidateByCriterion(rankingScores: Record<string, number>): string | null {
  let best: string | null = null;
  for (const [key, score] of Object.entries(rankingScores)) {
    if (
      best === null ||
      score > rankingScores[best] ||
      (score === rankingScores[best] && Number(key) < Number(best))
    ) {
      best = key;
    }
  }
  return best;
}
