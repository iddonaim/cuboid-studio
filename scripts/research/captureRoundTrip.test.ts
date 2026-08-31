/**
 * In-app capture → harness replay round-trip (no network, no UI).
 *
 * Proves the property the capture feature exists for: a state built by
 * src/research/captureEvolveState.ts from app-shaped inputs is accepted by
 * the harness end — parseFrozenEvolveState (run at build time as a
 * self-check), buildStepTranslationRequests against a corpus, and the
 * site-context / lexicon hash checks run.ts performs before any spend.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRANSLATION_LEXICON } from '../../src/prompts/translationLexicon.default';
import { buildFrozenEvolveState, type CaptureInputs } from '../../src/research/captureEvolveState';
import { hashMemeContent, sha256HexOfString } from '../../src/research/hashing';
import { loadCorpusFromFile } from './lib/corpus';
import { buildStepTranslationRequests } from './lib/evolveState';
import { captureRegime } from './lib/regime';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TOY_CORPUS = path.join(REPO_ROOT, 'scripts/research/examples/e2-toy.corpus.json');

const siteContext = {
  site_name: 'Allenby test site',
  generated: '2026-08-30T11:00:00.000Z',
  quantitative: { location: { lat: '32.08', lng: '34.78', address: 'Allenby St' } },
};

async function makeInputs(overrides: Partial<CaptureInputs> = {}): Promise<CaptureInputs> {
  const corpusDocs = JSON.parse(fs.readFileSync(TOY_CORPUS, 'utf-8')) as Array<{
    id: string;
    fields: Record<string, unknown>;
  }>;
  const memeContentHashes: Record<string, string> = {};
  for (const doc of corpusDocs) {
    memeContentHashes[doc.id] = (await hashMemeContent(doc.fields)).hash;
  }
  return {
    placedCubes: [
      { id: 'cube-a', variationId: 'v-00', position: [0, 0, 0], rotation: { x: 0, y: 0 } },
      { id: 'cube-b', variationId: 'v-07', position: [1, 0, 0], rotation: { x: 0, y: 1 } },
    ],
    cubeOperators: {
      'cube-a': [
        {
          id: 'op-1',
          source: 'meme',
          operator: 'inversion',
          targets: ['adjacency'],
          magnitude: 0.5,
          decay: 0.2,
          createdAt: '2026-08-29T09:00:00.000Z',
          memeDescription: 'earlier cut',
          reasoning: '',
          cutter: { type: 'sphere', proportions: [0.6, 0.6, 0.6], position: [0.2, 0.1, -0.3], rotation: [0, 0, 0] },
        },
      ],
    },
    candidates: [
      { memeId: 'meme-toy-0002-legacy', targetCubeId: 'cube-b' },
      { memeId: 'meme-toy-0001-current', targetCubeId: 'cube-a' },
    ],
    generationIndex: 4,
    config: { populationSize: 6, targetCubeStrategy: 'least-compressed', memePoolFilter: null },
    memeContentHashes,
    siteContext,
    translationLexicon: DEFAULT_TRANSLATION_LEXICON,
    capturedAt: '2026-08-31T10:00:00.000Z',
    ...overrides,
  };
}

describe('capture → replay round-trip', () => {
  it('a captured state passes the harness parser, request builder, and hash checks', async () => {
    const inputs = await makeInputs();
    const captured = await buildFrozenEvolveState(inputs);

    // The state carries the app moment faithfully.
    expect(captured.state.generation_index).toBe(4);
    expect(captured.state.composition.placed_cubes.map((c) => c.operator_count)).toEqual([1, 0]);
    expect(captured.state.assignments).toEqual([
      { candidate_index: 0, meme_id: 'meme-toy-0002-legacy', target_cube_id: 'cube-b' },
      { candidate_index: 1, meme_id: 'meme-toy-0001-current', target_cube_id: 'cube-a' },
    ]);
    expect(captured.state.meme_pool.map((m) => m.id).sort()).toEqual([
      'meme-toy-0001-current',
      'meme-toy-0002-legacy',
    ]);

    // The harness rebuilds the step's requests from it (pool hashes verified
    // against the same corpus loader the runner uses).
    const corpus = await loadCorpusFromFile(fs.readFileSync(TOY_CORPUS, 'utf-8'), TOY_CORPUS);
    const requests = buildStepTranslationRequests(captured.state, corpus);
    expect(requests.map((r) => [r.candidate_index, r.meme_id, r.target_cube_id])).toEqual([
      [0, 'meme-toy-0002-legacy', 'cube-b'],
      [1, 'meme-toy-0001-current', 'cube-a'],
    ]);

    // The lexicon hash equals the regime's (default lexicon) — run.ts's
    // lexicon verification passes for a state captured under the default.
    const { regime } = await captureRegime(REPO_ROOT);
    expect(captured.state.translation_lexicon_hash).toBe(regime.translation_lexicon_hash);
  });

  it('the site-context hash pins the exact file the export downloads — run.ts recomputes it identically', async () => {
    const captured = await buildFrozenEvolveState(await makeInputs());
    expect(captured.siteContextFileText).not.toBeNull();
    // run.ts: JSON.parse(file) → JSON.stringify(…, null, 2) → sha256.
    const recomputed = JSON.stringify(JSON.parse(captured.siteContextFileText!), null, 2);
    expect(recomputed).toBe(captured.siteContextFileText);
    expect(captured.state.site_context_hash).toBe(await sha256HexOfString(recomputed));
  });

  it('no active site → null hash and no companion file', async () => {
    const captured = await buildFrozenEvolveState(await makeInputs({ siteContext: null }));
    expect(captured.state.site_context_hash).toBeNull();
    expect(captured.siteContextFileText).toBeNull();
  });

  it('the capture hash is stable for identical inputs', async () => {
    const first = await buildFrozenEvolveState(await makeInputs());
    const second = await buildFrozenEvolveState(await makeInputs());
    expect(second.stateHash).toBe(first.stateHash);
  });

  it('refuses to freeze a candidate whose target cube left the assembly', async () => {
    const inputs = await makeInputs();
    inputs.candidates = [{ memeId: 'meme-toy-0001-current', targetCubeId: 'gone-cube' }];
    await expect(buildFrozenEvolveState(inputs)).rejects.toThrow(/unknown cube gone-cube/);
  });

  it('refuses to capture with no candidates', async () => {
    const inputs = await makeInputs({ candidates: [] });
    await expect(buildFrozenEvolveState(inputs)).rejects.toThrow(/generate candidates first/);
  });
});
