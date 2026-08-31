/**
 * Harness-side E3 frozen-state module. The schema, parser, hash, and
 * deterministic ranking/selection live in src/research/evolveState.ts —
 * shared with the in-app capture (Evolve panel export) so a captured state
 * and a replayed state can never drift apart. This file re-exports all of
 * it and adds the one corpus-coupled piece: rebuilding the step's
 * translation requests with pool-content verification.
 */

import { mapMemeToCuboidInput } from '../../../src/lib/meme-mapper.js';
import type { FrozenEvolveState } from '../../../src/research/evolveState.js';
import type { Corpus } from './corpus';

export * from '../../../src/research/evolveState.js';

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
