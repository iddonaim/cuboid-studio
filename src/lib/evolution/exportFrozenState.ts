/**
 * The Evolve panel's "Export frozen state" action (approved 2026-08-31 —
 * one export action, no other UI change).
 *
 * Reads the current Evolve moment from the stores, fetches each referenced
 * meme's RAW document fields for wire-truth content hashing (the same
 * decoder + hash the harness uses), assembles a FrozenEvolveState via the
 * shared builder (self-checked through the harness's parser), and downloads:
 *   - evolve-state-g<generation>-<hash12>.json      (the state)
 *   - evolve-state-g<generation>-site-context.json  (when a site is active —
 *     the exact object whose injected string the state's hash pins; point
 *     the batch config's site_context_file at it)
 */

import { useBuilderStore } from '../../store/useBuilderStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { useMemeStore } from '../../store/useMemeStore';
import { useTranslationLexiconStore } from '../../store/useTranslationLexiconStore';
import { getActiveSiteContext } from '../storage/siteContext';
import { buildFrozenEvolveState } from '../../research/captureEvolveState';
import { hashMemeContent } from '../../research/hashing';
import { fetchRawMemeFields } from '../../research/firestoreRest';

function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export interface ExportFrozenStateResult {
  stateFilename: string;
  siteContextFilename: string | null;
}

/** Captures the current Evolve generation as a frozen state and downloads
 *  the file(s). Throws with a plain-language message on anything unusable
 *  (no candidates, a stale target cube, an unfetchable meme). */
export async function exportFrozenEvolveState(): Promise<ExportFrozenStateResult> {
  const { candidates, generation, config } = useEvolutionStore.getState();
  const placedCubes = useBuilderStore.getState().placedCubes;
  const cubeOperators = useMemeStore.getState().cubeOperators;
  const translationLexicon = useTranslationLexiconStore.getState().getActiveTranslationLexicon();
  const siteContext = getActiveSiteContext();

  // Wire-truth hashes: raw stored fields, fetched per referenced meme.
  const memeIds = [...new Set(candidates.map((c) => c.memeId))];
  const memeContentHashes: Record<string, string> = {};
  for (const id of memeIds) {
    const rawFields = await fetchRawMemeFields(id);
    memeContentHashes[id] = (await hashMemeContent(rawFields)).hash;
  }

  const captured = await buildFrozenEvolveState({
    placedCubes,
    cubeOperators,
    candidates: candidates.map((c) => ({ memeId: c.memeId, targetCubeId: c.targetCubeId })),
    generationIndex: generation,
    config: {
      populationSize: config.populationSize,
      targetCubeStrategy: config.targetCubeStrategy,
      memePoolFilter: config.memePoolFilter,
    },
    memeContentHashes,
    siteContext,
    translationLexicon,
    capturedAt: new Date().toISOString(),
  });

  const stateFilename = `evolve-state-g${generation}-${captured.stateHash.slice(0, 12)}.json`;
  downloadJson(stateFilename, JSON.stringify(captured.state, null, 2));

  let siteContextFilename: string | null = null;
  if (captured.siteContextFileText !== null) {
    siteContextFilename = `evolve-state-g${generation}-site-context.json`;
    downloadJson(siteContextFilename, captured.siteContextFileText);
  }

  return { stateFilename, siteContextFilename };
}
