/**
 * E3 frozen-state support (ruling R2: step mode is state replay, not a
 * prompt change).
 *
 * A frozen Evolve state pins everything a single generation-step's model
 * requests are built from: the composition summary, the meme pool (by id +
 * content hash), the per-candidate assignments (which meme against which
 * target cube — resolved, so replay carries no sampling randomness), the
 * site context and lexicon identities, and the selection criterion. Its hash
 * is the `step_input_mode: "frozen:<state_hash>"` reference.
 *
 * What this module CAN do headlessly today: hash a state, verify a pool
 * against a loaded corpus, and rebuild the exact translation request payloads
 * from the resolved assignments (mapMemeToCuboidInput is a pure lib).
 *
 * What it deliberately does NOT do (reported per R2, waiting on a ruling):
 * capturing a state from the app, and replaying a full CAMPAIGN step with the
 * app's own sampling/target-picking/ranking. That logic lives inside
 * useEvolutionStore.generateCandidates() — a UI code path (Zustand store,
 * dynamic store imports, Math.random sampling) — and pickTargetCubes is not
 * exported. The exact refactor is listed in the build report; until it lands,
 * the E3 runner stays a stub.
 */

import { mapMemeToCuboidInput } from '../../../src/lib/meme-mapper.js';
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

/** The hash `step_input_mode: "frozen:<state_hash>"` refers to. */
export async function hashEvolveState(state: FrozenEvolveState): Promise<string> {
  return sha256HexOfCanonicalJson(state);
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
