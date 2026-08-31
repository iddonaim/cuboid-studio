/**
 * In-app frozen-state capture (approved 2026-08-31): assembles a
 * FrozenEvolveState from the running app's Evolve moment, hashing every
 * frozen input exactly the way the harness verifies it — the site context
 * as the injected prompt string, the lexicon and meme contents with the
 * shared research hashing, the state itself with hashEvolveState.
 *
 * Pure assembly: store reading, raw-doc fetching, and file downloads live in
 * src/lib/evolution/exportFrozenState.ts. Before returning, the built state
 * is self-checked through parseFrozenEvolveState — the same strict parser
 * the harness runs — so an exported file is accepted-by-construction.
 *
 * Scope choices (minimal, per the ruling):
 *   - assignments = the current generation's candidates, in their ranked
 *     order (the resolved set is what replay needs; original sampling order
 *     is not recoverable post-ranking and does not enter any measurement);
 *   - meme_pool = the distinct memes those candidates reference (what the
 *     step's requests are built from), not the full sampling pool.
 */

import type { PlacedCube } from '../lib/cube/types';
import type { OperatorRecord } from '../lib/operators/types';
import {
  hashEvolveState,
  parseFrozenEvolveState,
  SUPPORTED_SELECTION_CRITERION,
  type FrozenEvolveState,
} from './evolveState';
import { hashLexicon, sha256HexOfString } from './hashing';

export interface CaptureInputs {
  placedCubes: PlacedCube[];
  cubeOperators: Record<string, OperatorRecord[]>;
  /** The current generation's candidates, ranked order. */
  candidates: Array<{ memeId: string; targetCubeId: string }>;
  generationIndex: number;
  config: {
    populationSize: number;
    targetCubeStrategy: string;
    memePoolFilter: string | null;
  };
  /** Wire-truth content hash per referenced meme id (from raw doc fields). */
  memeContentHashes: Record<string, string>;
  /** The active site context object, or null. Hashed as the exact string the
   *  prompt carries (JSON.stringify(…, null, 2) — the handler's injection
   *  format, and what run.ts recomputes from the exported file). */
  siteContext: object | null;
  /** The active translation lexicon (the built-in default when none is). */
  translationLexicon: unknown;
  capturedAt: string;
}

export interface CapturedEvolveState {
  state: FrozenEvolveState;
  stateHash: string;
  /** Exact bytes for the companion site-context file (null when no site). */
  siteContextFileText: string | null;
}

export async function buildFrozenEvolveState(inputs: CaptureInputs): Promise<CapturedEvolveState> {
  if (inputs.candidates.length === 0) {
    throw new Error('nothing to capture: generate candidates first — the frozen state pins a resolved generation');
  }

  const siteContextFileText = inputs.siteContext
    ? JSON.stringify(inputs.siteContext, null, 2)
    : null;

  const memeIds = [...new Set(inputs.candidates.map((c) => c.memeId))];
  for (const id of memeIds) {
    if (!inputs.memeContentHashes[id]) {
      throw new Error(`missing content hash for meme ${id}`);
    }
  }

  const state: FrozenEvolveState = {
    captured_at: inputs.capturedAt,
    generation_index: inputs.generationIndex,
    composition: {
      placed_cubes: inputs.placedCubes.map((cube) => ({
        id: cube.id,
        variationId: cube.variationId,
        position: cube.position,
        rotation: { x: cube.rotation.x, y: cube.rotation.y },
        operator_count: (inputs.cubeOperators[cube.id] ?? []).length,
      })),
      // JSON round-trip strips any undefined the store may carry — the state
      // must be exactly what its file will say (the hash covers the file).
      cube_operators: JSON.parse(JSON.stringify(inputs.cubeOperators)) as Record<string, OperatorRecord[]>,
    },
    meme_pool: memeIds.map((id) => ({ id, content_hash: inputs.memeContentHashes[id] })),
    config: {
      population_size: inputs.config.populationSize,
      target_cube_strategy: inputs.config.targetCubeStrategy,
      meme_pool_filter: inputs.config.memePoolFilter,
    },
    assignments: inputs.candidates.map((candidate, index) => ({
      candidate_index: index,
      meme_id: candidate.memeId,
      target_cube_id: candidate.targetCubeId,
    })),
    site_context_hash: siteContextFileText !== null ? await sha256HexOfString(siteContextFileText) : null,
    translation_lexicon_hash: await hashLexicon(inputs.translationLexicon),
    selection_criterion_id: SUPPORTED_SELECTION_CRITERION,
  };

  // Self-check through the harness's own strict parser: a state this
  // function returns is a state the replay will accept. (This is also where
  // a stale candidate — one targeting a cube no longer in the assembly —
  // fails with a precise message.)
  const parsed = parseFrozenEvolveState(JSON.stringify(state), 'captured state');

  return {
    state: parsed,
    stateHash: await hashEvolveState(parsed),
    siteContextFileText,
  };
}
