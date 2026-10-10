/**
 * E3 step-mode tests — no network, no Firestore, no model calls.
 *
 * Covers: strict frozen-state parsing; state-hash determinism; pool-hash
 * verification; deterministic ranking + criterion selection through the real
 * generation lib; a full step replicate through the app's own
 * parseAndRoute/validator with a scripted transport (record validates,
 * failures stay data); and the E3 config/doc-id plumbing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidOntology } from '../../src/research/ontology';
import { validateEnvelope, validatePayload } from '../../src/research/validate';
import { prepareResearchRecord } from '../../src/research/writeResearchRecord';
import { parseBatchConfig } from './lib/config';
import { loadCorpusFromFile, type Corpus } from './lib/corpus';
import {
  buildStepTranslationRequests,
  hashEvolveState,
  parseFrozenEvolveState,
  scoreStepCandidate,
  selectCandidateByCriterion,
  stateBaseline,
  type FrozenEvolveState,
} from './lib/evolveState';
import { estimateStepCost, runEvolveStep, stepDocId, type EvolveStepContext } from './lib/evolveStep';
import { captureRegime } from './lib/regime';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TOY_STATE = path.join(REPO_ROOT, 'scripts/research/examples/e3-toy.state.json');
const TOY_BATCH = path.join(REPO_ROOT, 'scripts/research/examples/e3-toy.batch.json');
const TOY_CORPUS = path.join(REPO_ROOT, 'scripts/research/examples/e2-toy.corpus.json');

function loadState(mutate?: (s: FrozenEvolveState) => void): FrozenEvolveState {
  const state = JSON.parse(fs.readFileSync(TOY_STATE, 'utf-8')) as FrozenEvolveState;
  mutate?.(state);
  return state;
}

function parseMutated(mutate: (s: FrozenEvolveState) => void): FrozenEvolveState {
  return parseFrozenEvolveState(JSON.stringify(loadState(mutate)), 'mutated');
}

async function loadToyCorpus(): Promise<Corpus> {
  return loadCorpusFromFile(fs.readFileSync(TOY_CORPUS, 'utf-8'), TOY_CORPUS);
}

// Valid two-pass responses, parameterized so candidates score differently.
function validResponse(candidateIndex: number): string {
  const pass1 = {
    pass: 1,
    rhetorical_moves: ['irony'],
    cultural_tensions: [{ description: `tension ${candidateIndex}`, friction_type: 'external' }],
    functional_affects: ['indignation'],
    site_resonance: `resonance ${candidateIndex}`,
    meme_summary: `summary ${candidateIndex}`,
  };
  const cutterTypes = ['box', 'sphere', 'cylinder'] as const;
  const pass2 = {
    pass: 2,
    operator: ['reassignment', 'erosion', 'amplification'][candidateIndex % 3],
    targets: ['adjacency'],
    target_reasoning: 'acts on adjacency',
    magnitude: 0.2 + 0.3 * candidateIndex,
    decay: 0.1,
    cutter: {
      type: cutterTypes[candidateIndex % 3],
      proportions: [0.5 + 0.1 * candidateIndex, 0.4, 0.6],
      position: [0.1 * candidateIndex, -0.2, 0.3],
      rotation: [0, 15 * candidateIndex, 0],
      geometry_reasoning: `cutter ${candidateIndex}`,
    },
    confidence_vector: {
      rhetorical_clarity: 0.9,
      site_resonance: 0.7,
      affective_coherence: 0.8,
      operational_specificity: 0.5,
    },
    confidence_note: 'toy',
    reasoning: `reasoning ${candidateIndex}`,
  };
  return JSON.stringify([pass1, pass2], null, 2);
}

async function makeStepContext(
  overrides: Partial<EvolveStepContext>,
): Promise<{ ctx: EvolveStepContext; corpus: Corpus }> {
  const config = parseBatchConfig(fs.readFileSync(TOY_BATCH, 'utf-8'), TOY_BATCH);
  const corpus = await loadToyCorpus();
  const state = parseFrozenEvolveState(fs.readFileSync(TOY_STATE, 'utf-8'), TOY_STATE);
  const { regime, twoPassPromptText } = await captureRegime(REPO_ROOT);
  const ctx: EvolveStepContext = {
    config,
    regime,
    twoPassPromptText,
    siteContext: null,
    siteContextHash: null,
    appCommit: 'test-commit',
    anthropicKey: null,
    openRouterKey: null,
    state,
    stateHash: await hashEvolveState(state),
    requests: buildStepTranslationRequests(state, corpus),
    ...overrides,
  };
  return { ctx, corpus };
}

describe('parseFrozenEvolveState', () => {
  it('accepts the toy state', () => {
    const state = parseFrozenEvolveState(fs.readFileSync(TOY_STATE, 'utf-8'), TOY_STATE);
    expect(state.assignments).toHaveLength(3);
    expect(state.composition.cube_operators['cube-a']).toHaveLength(1);
  });

  it('rejects a rotation outside 0-3', () => {
    expect(() => parseMutated((s) => { s.composition.placed_cubes[0].rotation.y = 4; })).toThrow(/rotation\.y/);
  });

  it('rejects an assignment referencing a meme outside the pool', () => {
    expect(() => parseMutated((s) => { s.assignments[1].meme_id = 'meme-not-in-pool'; })).toThrow(/not in meme_pool/);
  });

  it('rejects non-contiguous candidate indices', () => {
    expect(() => parseMutated((s) => { s.assignments[2].candidate_index = 7; })).toThrow(/candidate_index/);
  });

  it('rejects cube_operators for a cube that is not placed', () => {
    expect(() => parseMutated((s) => {
      s.composition.cube_operators['ghost-cube'] = [];
    })).toThrow(/unknown cube ghost-cube/);
  });

  it('rejects an unimplemented selection criterion — declared must be implemented', () => {
    expect(() => parseMutated((s) => { s.selection_criterion_id = 'coin-flip'; })).toThrow(/not implemented/);
  });
});

describe('state hashing and pool verification', () => {
  it('the state hash is key-order-invariant and content-sensitive', async () => {
    const state = loadState();
    // Reverse top-level key insertion order without touching the content.
    const reordered = Object.fromEntries(Object.entries(state).reverse()) as unknown as FrozenEvolveState;
    expect(await hashEvolveState(reordered)).toBe(await hashEvolveState(state));
    const tampered = loadState((s) => { s.generation_index = 3; });
    expect(await hashEvolveState(tampered)).not.toBe(await hashEvolveState(state));
  });

  it('a meme that changed since capture fails the replay loudly', async () => {
    const corpus = await loadToyCorpus();
    const state = loadState((s) => {
      s.meme_pool[0].content_hash = 'a'.repeat(64);
    });
    expect(() => buildStepTranslationRequests(state, corpus)).toThrow(/content hash mismatch/);
  });

  it('rebuilds one translation request per assignment, in order', async () => {
    const corpus = await loadToyCorpus();
    const state = loadState();
    const requests = buildStepTranslationRequests(state, corpus);
    expect(requests.map((r) => [r.candidate_index, r.meme_id, r.target_cube_id])).toEqual([
      [0, 'meme-toy-0002-legacy', 'cube-b'],
      [1, 'meme-toy-0001-current', 'cube-c'],
      [2, 'meme-toy-0003-minimal', 'cube-a'],
    ]);
    expect(requests[0].memeDescription).toContain('MY LANDLORD');
  });
});

describe('ranking and selection', () => {
  it('selectCandidateByCriterion takes the max, ties to the lowest index', () => {
    expect(selectCandidateByCriterion({ '0': 0.1, '1': 0.5, '2': 0.3 })).toBe('1');
    expect(selectCandidateByCriterion({ '2': 0.4, '0': 0.4 })).toBe('0');
    expect(selectCandidateByCriterion({})).toBeNull();
  });

  it('scoreStepCandidate is deterministic for identical inputs', () => {
    const state = parseFrozenEvolveState(fs.readFileSync(TOY_STATE, 'utf-8'), TOY_STATE);
    const baseline = stateBaseline(state);
    const pass2 = JSON.parse(validResponse(1))[1];
    const args = {
      state,
      baseline,
      candidateIndex: 1,
      targetCubeId: 'cube-c',
      memeDescription: 'a meme',
      pass2,
    };
    const first = scoreStepCandidate(args);
    expect(scoreStepCandidate(args)).toBe(first);
    expect(Number.isFinite(first)).toBe(true);
  });
});

describe('runEvolveStep (scripted transport)', () => {
  it('a clean step: all candidates parse, ranking is real, selection follows the criterion', async () => {
    const { ctx } = await makeStepContext({
      transportOverride: (request) => async () => validResponse(request.candidate_index),
    });
    const { record, called } = await runEvolveStep(ctx, ctx.config.models[0], 0);

    expect(called).toBe(true);
    expect(validateEnvelope({ ...record, payload: undefined })).toBeNull();
    expect(validatePayload('evolve_step', record.payload)).toBeNull();
    expect(record.ontology && isValidOntology(record.ontology)).toBe(true);
    expect(() => prepareResearchRecord(record)).not.toThrow();

    expect(record.payload.parse_status).toBe('ok');
    expect(record.payload.step_input_mode).toBe(`frozen:${ctx.stateHash}`);
    expect(record.payload.parent_state_hash).toBe(ctx.stateHash);
    expect(record.payload.generation_index).toBe(2);
    expect(record.payload.candidate_set).toHaveLength(3);
    for (const [i, candidate] of record.payload.candidate_set.entries()) {
      expect(candidate.response.raw).toBe(validResponse(i));
      expect(candidate.response.parsed).not.toBeNull();
      expect(candidate.attempts).toHaveLength(1);
    }

    // Ranking recomputes identically through the same lib — and the selected
    // candidate is exactly the criterion applied to those scores.
    const baseline = stateBaseline(ctx.state);
    for (const request of ctx.requests) {
      const expected = scoreStepCandidate({
        state: ctx.state,
        baseline,
        candidateIndex: request.candidate_index,
        targetCubeId: request.target_cube_id,
        memeDescription: request.memeDescription,
        pass2: JSON.parse(validResponse(request.candidate_index))[1],
      });
      expect(record.payload.ranking_scores[String(request.candidate_index)]).toBe(expected);
    }
    expect(record.payload.selected_candidate).toBe(
      selectCandidateByCriterion(record.payload.ranking_scores),
    );
  });

  it('a failed candidate stays in the record (raw + attempts) and out of the ranking', async () => {
    const { ctx } = await makeStepContext({
      transportOverride: (request) => async () =>
        request.candidate_index === 1 ? 'not json at all' : validResponse(request.candidate_index),
    });
    const { record } = await runEvolveStep(ctx, ctx.config.models[0], 0);

    expect(record.payload.parse_status).toBe('ok');
    const failed = record.payload.candidate_set[1];
    expect(failed.response.parsed).toBeNull();
    expect(failed.response.raw).toBe('not json at all');
    expect(failed.attempts?.map((a) => a.role)).toEqual(['initial', 'parse_retry']);
    expect(Object.keys(record.payload.ranking_scores).sort()).toEqual(['0', '2']);
    expect(['0', '2']).toContain(record.payload.selected_candidate);
    expect(validatePayload('evolve_step', record.payload)).toBeNull();
  });

  it('all candidates failing yields a failed record with everything preserved', async () => {
    const { ctx } = await makeStepContext({
      transportOverride: () => async () => 'garbage',
    });
    const { record } = await runEvolveStep(ctx, ctx.config.models[0], 0);
    expect(record.payload.parse_status).toBe('failed');
    expect(record.payload.failure?.message).toContain('all 3 candidates failed');
    expect(record.payload.selected_candidate).toBeNull();
    expect(record.payload.candidate_set.every((c) => c.response.raw === 'garbage')).toBe(true);
    expect(validatePayload('evolve_step', record.payload)).toBeNull();
    expect(() => prepareResearchRecord(record)).not.toThrow();
  });

  it('step doc ids are deterministic, Firestore-safe, and state-pinned', async () => {
    const { ctx } = await makeStepContext({});
    const id = stepDocId(ctx.config.batch_id, ctx.stateHash, ctx.config.models[0], 2);
    expect(id).toBe(
      `e3-toy-000__E3__evolve_step__state-${ctx.stateHash.slice(0, 12)}__anthropic_anthropic~claude-sonnet-4-6__r2`,
    );
    expect(id).not.toContain('/');
  });

  it('the step cost estimate covers one full two-pass call per candidate', async () => {
    const { ctx } = await makeStepContext({});
    const estimate = estimateStepCost({
      modelId: ctx.config.models[0].id,
      systemPromptChars: 20_000,
      requests: ctx.requests,
    });
    expect(estimate.usd).toBeGreaterThan(0);
    expect(estimate.tokens_out).toBe(3 * 1200);
  });
});

describe('E3 batch config', () => {
  const base = {
    batch_id: 'b', experiment: 'E3', baseline_tag: 'SCAFFOLD-X',
    corpus: { meme_ids: 'all' },
    models: [{ id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic' }],
    replicates: 2, site_context_file: null, budget_cap_usd: null,
  };

  it('requires e3.state_file', () => {
    expect(() => parseBatchConfig(JSON.stringify(base), 'e3.json')).toThrow(/e3\.state_file/);
  });

  it('rejects E2 cells on an E3 batch', () => {
    const bad = { ...base, cells: ['a'], e3: { state_file: 'x.json' } };
    expect(() => parseBatchConfig(JSON.stringify(bad), 'e3.json')).toThrow(/cells do not apply to E3/);
  });

  it('rejects e3 on an E2 batch', () => {
    const bad = { ...base, experiment: 'E2', cells: ['a'], e3: { state_file: 'x.json' } };
    expect(() => parseBatchConfig(JSON.stringify(bad), 'e2.json')).toThrow(/only to experiment E3/);
  });

  it('accepts the toy E3 config', () => {
    const cfg = parseBatchConfig(fs.readFileSync(TOY_BATCH, 'utf-8'), TOY_BATCH);
    expect(cfg.cells).toEqual([]);
    expect(cfg.e3?.state_file).toBe('scripts/research/examples/e3-toy.state.json');
  });
});
