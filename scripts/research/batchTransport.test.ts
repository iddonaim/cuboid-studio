/**
 * Batch-transport behavior — no Firestore, no real network (fetch patched
 * where a sync fallback fires). Covers:
 *   - batch-route pricing math against hand-computed figures (discount ×
 *     caching multipliers, the 1024-token cache minimum, per-model
 *     write-once totals);
 *   - the replay caller: result replay, errored results, sync delegation of
 *     retries (image dropped exactly like the sync caller), sync-fill;
 *   - the declared additions for batch-collected records;
 *   - E2 and E3 units end to end through the REAL executors: capture yields
 *     the same request the sync path would send, replay yields a record
 *     shape-identical to a sync run's (the "same records, same failure
 *     handling" property), prefill cells and failure cells included.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CallerOpts } from '../../api/translate-meme';
import type { EvolveStepPayload, TranslationPayload, TranslationRecord } from '../../src/research/types';
import { validateEnvelope, validatePayload } from '../../src/research/validate';
import { buildAnthropicMessageParams } from './lib/anthropicBatch';
import {
  makeE2BatchUnit,
  makeE3BatchUnit,
  makeReplayCaller,
  withBatchTransportDeclared,
  type ReplayEntry,
} from './lib/batchTransport';
import { parseBatchConfig } from './lib/config';
import { loadCorpusFromFile, type Corpus } from './lib/corpus';
import {
  batchRouteTotals,
  estimateBatchRoute,
  estimateCellCost,
} from './lib/costs';
import { buildStepTranslationRequests, hashEvolveState, parseFrozenEvolveState } from './lib/evolveState';
import { runEvolveStep, type EvolveStepContext } from './lib/evolveStep';
import { expandMatrix, type MatrixCell } from './lib/matrix';
import { captureRegime } from './lib/regime';
import { runTranslationCell, type TranslationCellContext } from './lib/translationCell';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TOY_BATCH = path.join(REPO_ROOT, 'scripts/research/examples/e2-toy.batch.json');
const TOY_CORPUS = path.join(REPO_ROOT, 'scripts/research/examples/e2-toy.corpus.json');
const TOY_E3_BATCH = path.join(REPO_ROOT, 'scripts/research/examples/e3-toy.batch.json');
const TOY_STATE = path.join(REPO_ROOT, 'scripts/research/examples/e3-toy.state.json');

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Same valid two-pass fixtures as harness.test.ts.
const validPass1 = {
  pass: 1,
  rhetorical_moves: ['irony'],
  cultural_tensions: [{ description: 'residents priced out', friction_type: 'external' }],
  functional_affects: ['indignation'],
  site_resonance: 'touches the contested market edge',
  meme_summary: 'an ironic meme about displacement',
};
const validPass2 = {
  pass: 2,
  operator: 'reassignment',
  targets: ['adjacency'],
  magnitude: 0.4,
  decay: 0.2,
  cutter: { type: 'box', proportions: [0.8, 0.1, 0.9], position: [0.3, 0.5, 0.4], rotation: [0, 15, 0] },
  confidence_vector: { rhetorical_clarity: 0.9, site_resonance: 0.7, affective_coherence: 0.8, operational_specificity: 0.5 },
  reasoning: 'displacement maps to reassignment',
};
const validTwoPassText = JSON.stringify([validPass1, validPass2]);

function succeededEntry(text: string): ReplayEntry {
  return { kind: 'result', result: { type: 'succeeded', message: { content: [{ type: 'text', text }], stop_reason: 'end_turn' } } };
}

// ---------------------------------------------------------------------------
// Pricing math
// ---------------------------------------------------------------------------

describe('batch-route pricing (discount × caching, hand-computed)', () => {
  // claude-sonnet-4-6: $3/MTok in, $15/MTok out. system 8000 chars → 2000
  // tokens (cacheable ≥ 1024); user 400 chars → 100 tokens; no image; cell a
  // → 1200 output tokens.
  const inputs = {
    modelId: 'claude-sonnet-4-6',
    systemPromptChars: 8000,
    userMessageChars: 400,
    hasImage: false,
    cellType: 'a' as const,
  };

  it('1h TTL: worst = ½·2×·system + ½·rest; best marginal = ½·0.1×·system + ½·rest', () => {
    const est = estimateBatchRoute({ ...inputs, cacheTtl: '1h' });
    expect(est.cacheable).toBe(true);
    expect(est.tokens_system).toBe(2000);
    expect(est.usd_sync).toBeCloseTo(0.0243, 6); // (2100·$3 + 1200·$15)/1e6
    expect(est.usd_batch_worst).toBeCloseTo(0.5 * 2 * 0.006 + 0.5 * (0.0003 + 0.018), 6); // 0.01515
    expect(est.usd_batch_best_marginal).toBeCloseTo(0.5 * 0.1 * 0.006 + 0.5 * (0.0003 + 0.018), 6); // 0.00945
    // The batch worst case never exceeds the sync price (1h write ×2 halved = ×1).
    expect(est.usd_batch_worst).toBeLessThanOrEqual(est.usd_sync);
  });

  it('5m TTL: write multiplier 1.25 instead of 2', () => {
    const est = estimateBatchRoute({ ...inputs, cacheTtl: '5m' });
    expect(est.usd_batch_worst).toBeCloseTo(0.5 * 1.25 * 0.006 + 0.5 * (0.0003 + 0.018), 6); // 0.01290
  });

  it('below the 1024-token cache minimum: flat 50% of sync, no cache premium', () => {
    const est = estimateBatchRoute({ ...inputs, systemPromptChars: 4000, cacheTtl: '1h' }); // 1000 tok
    expect(est.cacheable).toBe(false);
    const sync = estimateCellCost({ ...inputs, systemPromptChars: 4000 });
    expect(est.usd_batch_worst).toBeCloseTo(sync.usd / 2, 9);
    expect(est.usd_batch_best_marginal).toBeCloseTo(sync.usd / 2, 9);
  });

  it('totals: one cache write per model, later calls priced as reads', () => {
    const est = estimateBatchRoute({ ...inputs, cacheTtl: '1h' });
    const sameModel = batchRouteTotals([
      { modelId: 'm1', est },
      { modelId: 'm1', est },
      { modelId: 'm1', est },
    ]);
    expect(sameModel.usd_batch_worst).toBeCloseTo(3 * est.usd_batch_worst, 9);
    expect(sameModel.usd_batch_best).toBeCloseTo(est.usd_batch_worst + 2 * est.usd_batch_best_marginal, 9);

    const twoModels = batchRouteTotals([
      { modelId: 'm1', est },
      { modelId: 'm1', est },
      { modelId: 'm2', est },
    ]);
    expect(twoModels.usd_batch_best).toBeCloseTo(2 * est.usd_batch_worst + est.usd_batch_best_marginal, 9);
  });
});

// ---------------------------------------------------------------------------
// Replay caller
// ---------------------------------------------------------------------------

function replayOpts(overrides: Partial<CallerOpts> = {}): CallerOpts {
  return {
    apiKey: '',
    userMessage: 'user message',
    memeImageUrl: null,
    systemPrompt: 'system prompt',
    selectedModel: 'anthropic/claude-sonnet-4.6',
    passMode: 'two_pass',
    ...overrides,
  };
}

describe('makeReplayCaller', () => {
  it('replays a succeeded result for the initial call without any network', async () => {
    globalThis.fetch = (async () => {
      throw new Error('no network expected');
    }) as typeof fetch;
    const caller = makeReplayCaller(succeededEntry('replayed text'), replayOpts(), 'key');
    expect(await caller()).toBe('replayed text');
  });

  it('throws an errored result verbatim (recorded as a transport failure, like a sync API error)', async () => {
    const entry: ReplayEntry = {
      kind: 'result',
      result: { type: 'errored', error: { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } } },
    };
    const caller = makeReplayCaller(entry, replayOpts(), 'key');
    await expect(caller()).rejects.toThrow(/Batch API result error.*invalid_request_error/);
  });

  it('delegates retries to the real sync caller, dropping the image exactly as the sync retry does', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url !== 'https://api.anthropic.com/v1/messages') throw new Error(`unexpected fetch: ${url}`);
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'retry answer' }], stop_reason: 'end_turn' }), { status: 200 });
    }) as typeof fetch;

    const caller = makeReplayCaller(
      succeededEntry('first answer'),
      replayOpts({ memeImageUrl: 'https://firebasestorage.googleapis.com/v0/b/example/o/x.png' }),
      'key',
    );
    expect(await caller()).toBe('first answer'); // no fetch
    expect(await caller('please return valid JSON')).toBe('retry answer');
    expect(bodies).toHaveLength(1); // no image download — retries never carry the image
    const messages = bodies[0].messages as Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
    expect(messages[0].content).toEqual([{ type: 'text', text: 'please return valid JSON' }]);
  });

  it('sync-fill runs the full initial call through the real caller', async () => {
    let called = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url !== 'https://api.anthropic.com/v1/messages') throw new Error(`unexpected fetch: ${url}`);
      called++;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'filled' }], stop_reason: 'end_turn' }), { status: 200 });
    }) as typeof fetch;
    const caller = makeReplayCaller({ kind: 'sync-fill' }, replayOpts(), 'key');
    expect(await caller()).toBe('filled');
    expect(called).toBe(1);
  });
});

describe('withBatchTransportDeclared', () => {
  it('appends one fixed and one stochastic line, preserving the sync lines', () => {
    const declared = { fixed: ['f1'], varied: [], stochastic: ['s1'], measured: ['m1'] };
    const out = withBatchTransportDeclared(declared);
    expect(out.fixed.slice(0, 1)).toEqual(['f1']);
    expect(out.fixed[1]).toMatch(/anthropic message batches api/);
    expect(out.stochastic.slice(0, 1)).toEqual(['s1']);
    expect(out.stochastic[1]).toMatch(/batch scheduling/);
    expect(out.measured).toEqual(['m1']);
    expect(declared.fixed).toEqual(['f1']); // input untouched
  });
});

// ---------------------------------------------------------------------------
// E2 unit: capture → replay through the real cell executor
// ---------------------------------------------------------------------------

async function e2Fixtures(): Promise<{
  cells: MatrixCell[];
  ctx: TranslationCellContext;
  corpus: Corpus;
}> {
  const config = parseBatchConfig(fs.readFileSync(TOY_BATCH, 'utf-8'), TOY_BATCH);
  const corpus = await loadCorpusFromFile(fs.readFileSync(TOY_CORPUS, 'utf-8'), TOY_CORPUS);
  const { regime, twoPassPromptText } = await captureRegime(REPO_ROOT);
  const ctx: TranslationCellContext = {
    config,
    regime,
    twoPassPromptText,
    siteContext: null,
    siteContextHash: null,
    appCommit: 'test-commit',
    anthropicKey: null,
    openRouterKey: null,
    resolveFrozenSource: async () => ({ recordId: 'frozen-source-record', pass1Raw: JSON.stringify(validPass1) }),
    prefillSupport: new Map([['anthropic/claude-sonnet-4.6', true]]),
  };
  return { cells: expandMatrix(config, corpus), ctx, corpus };
}

const toyEstimate = estimateBatchRoute({
  modelId: 'anthropic/claude-sonnet-4.6',
  systemPromptChars: 8000,
  userMessageChars: 400,
  hasImage: true,
  cellType: 'a',
  cacheTtl: '1h',
});

describe('E2 batch unit (real executor)', () => {
  it('capture yields exactly the request the sync transport would have sent, and writes nothing', async () => {
    const { cells, ctx } = await e2Fixtures();
    const cellA = cells.find((c) => c.cellType === 'a')!;
    const unit = makeE2BatchUnit(cellA, ctx, 'key', toyEstimate);
    const captured = await unit.capture();
    expect(captured).toHaveLength(1);
    expect(captured[0].callKey).toBe('call');
    const opts = captured[0].opts;
    expect(opts.passMode).toBe('two_pass');
    expect(opts.selectedModel).toBe('anthropic/claude-sonnet-4.6');
    expect(opts.assistantPrefill).toBeUndefined();
    expect(opts.systemPrompt).toContain('{site_context}'); // null site context leaves the placeholder, like the app
    // The captured opts build a valid batch request body.
    const params = buildAnthropicMessageParams(opts, null);
    expect(params.model).toBe('claude-sonnet-4-6');
  });

  it('replayed record is shape-identical to a sync record for the same response', async () => {
    const { cells, ctx } = await e2Fixtures();
    const cellA = cells.find((c) => c.cellType === 'a')!;

    const syncCtx: TranslationCellContext = { ...ctx, transportOverride: () => async () => validTwoPassText };
    const syncRecord = (await runTranslationCell(syncCtx, cellA)).record;

    const unit = makeE2BatchUnit(cellA, ctx, 'key', toyEstimate);
    const { record } = await unit.executeWithReplay(new Map([['call', succeededEntry(validTwoPassText)]]));
    const payload = record.payload as TranslationPayload;
    const syncPayload = syncRecord.payload as TranslationPayload;

    expect(payload.parse_status).toBe('ok');
    expect(payload.raw_response).toBe(syncPayload.raw_response);
    expect(payload.pass1).toEqual(syncPayload.pass1);
    expect(payload.pass2).toEqual(syncPayload.pass2);
    expect(payload.attempts.map((a) => a.role)).toEqual(syncPayload.attempts.map((a) => a.role));
    expect(record.model).toEqual(syncRecord.model);
    // The ONLY declared difference is the two appended transport lines.
    expect(record.declared).toEqual(withBatchTransportDeclared(syncRecord.declared));
    // Schema-valid end to end.
    expect(validateEnvelope(record)).toBeNull();
    expect(validatePayload(record.kind, record.payload)).toBeNull();
  });

  it('cell (c): capture carries the frozen prefill; replay records prefill provenance', async () => {
    const { cells, ctx } = await e2Fixtures();
    const cellC = cells.find((c) => c.cellType === 'c')!;
    const unit = makeE2BatchUnit(cellC, ctx, 'key', toyEstimate);

    const captured = await unit.capture();
    const expectedPrefill = '[' + JSON.stringify(validPass1) + ',';
    expect(captured[0].opts.assistantPrefill).toBe(expectedPrefill);

    // The batch result holds the CONTINUATION (as the API returns for a
    // prefilled request); the recording caller reassembles the full text.
    const continuation = JSON.stringify(validPass2) + ']';
    const { record } = await unit.executeWithReplay(new Map([['call', succeededEntry(continuation)]]));
    const payload = record.payload as TranslationPayload;
    expect(payload.parse_status).toBe('ok');
    expect(payload.prefill).toBe(true);
    expect(payload.pass1_input_mode).toBe('frozen:frozen-source-record');
    expect(payload.raw_response).toBe(expectedPrefill + continuation);
  });

  it('an errored batch result becomes a transport-failure record — failures are data, never dropped', async () => {
    const { cells, ctx } = await e2Fixtures();
    const cellA = cells.find((c) => c.cellType === 'a')!;
    const unit = makeE2BatchUnit(cellA, ctx, 'key', toyEstimate);
    const entry: ReplayEntry = { kind: 'result', result: { type: 'errored', error: { type: 'api_error', message: 'overloaded' } } };
    const { record } = await unit.executeWithReplay(new Map([['call', entry]]));
    const payload = record.payload as TranslationPayload;
    expect(payload.parse_status).toBe('failed');
    expect(payload.failure?.stage).toBe('transport');
    expect(payload.attempts).toHaveLength(1);
    expect(payload.attempts[0].error).toMatch(/Batch API result error/);
    expect(validatePayload(record.kind, record.payload)).toBeNull();
  });

  it('a malformed batch response goes through the SAME parse-retry pipeline, retrying synchronously', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url !== 'https://api.anthropic.com/v1/messages') throw new Error(`unexpected fetch: ${url}`);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: validTwoPassText }], stop_reason: 'end_turn' }), { status: 200 });
    }) as typeof fetch;

    const { cells, ctx } = await e2Fixtures();
    const cellA = cells.find((c) => c.cellType === 'a')!;
    const unit = makeE2BatchUnit(cellA, ctx, 'key', toyEstimate);
    const { record } = await unit.executeWithReplay(new Map([['call', succeededEntry('not json at all')]]));
    const payload = record.payload as TranslationPayload;
    expect(payload.attempts.map((a) => a.role)).toEqual(['initial', 'parse_retry']);
    expect(payload.attempts[0].raw_response).toBe('not json at all');
    expect(payload.parse_status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// E3 unit: capture → replay through the real step executor
// ---------------------------------------------------------------------------

function validResponse(candidateIndex: number): string {
  const pass1 = { ...validPass1, meme_summary: `summary ${candidateIndex}` };
  const pass2 = { ...validPass2, magnitude: 0.2 + 0.2 * candidateIndex };
  return JSON.stringify([pass1, pass2]);
}

async function e3Fixtures(): Promise<{ ctx: EvolveStepContext; candidateCount: number }> {
  const config = parseBatchConfig(fs.readFileSync(TOY_E3_BATCH, 'utf-8'), TOY_E3_BATCH);
  const corpus = await loadCorpusFromFile(fs.readFileSync(TOY_CORPUS, 'utf-8'), TOY_CORPUS);
  const state = parseFrozenEvolveState(fs.readFileSync(TOY_STATE, 'utf-8'), TOY_STATE);
  const { regime, twoPassPromptText } = await captureRegime(REPO_ROOT);
  const requests = buildStepTranslationRequests(state, corpus);
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
    requests,
  };
  return { ctx, candidateCount: requests.length };
}

describe('E3 batch unit (real executor)', () => {
  it('capture yields one call per candidate; replay reproduces the sync record shape', async () => {
    const { ctx, candidateCount } = await e3Fixtures();
    const model = ctx.config.models[0];
    const ests = ctx.requests.map(() => toyEstimate);
    const unit = makeE3BatchUnit(model, 0, 'e3-doc', ctx, 'key', ests);

    const captured = await unit.capture();
    expect(captured.map((c) => c.callKey)).toEqual(ctx.requests.map((r) => `cand${r.candidate_index}`));
    expect(captured).toHaveLength(candidateCount);

    const syncCtx: EvolveStepContext = {
      ...ctx,
      transportOverride: (request) => async () => validResponse(request.candidate_index),
    };
    const syncRecord = (await runEvolveStep(syncCtx, model, 0)).record;

    const entries = new Map<string, ReplayEntry>(
      ctx.requests.map((r) => [`cand${r.candidate_index}`, succeededEntry(validResponse(r.candidate_index))]),
    );
    const { record } = await unit.executeWithReplay(entries);
    const payload = record.payload as EvolveStepPayload;
    const syncPayload = syncRecord.payload as EvolveStepPayload;

    expect(payload.parse_status).toBe('ok');
    expect(payload.candidate_set.map((c) => c.response.raw)).toEqual(syncPayload.candidate_set.map((c) => c.response.raw));
    expect(payload.ranking_scores).toEqual(syncPayload.ranking_scores);
    expect(payload.selected_candidate).toBe(syncPayload.selected_candidate);
    expect(record.declared).toEqual(withBatchTransportDeclared(syncRecord.declared));
    expect(validateEnvelope(record)).toBeNull();
    expect(validatePayload(record.kind, record.payload)).toBeNull();
  });

  it('sync-fills an expired candidate slot while replaying the paid ones', async () => {
    let filled = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://firebasestorage.googleapis.com/')) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      if (url !== 'https://api.anthropic.com/v1/messages') throw new Error(`unexpected fetch: ${url}`);
      filled++;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: validResponse(1) }], stop_reason: 'end_turn' }), { status: 200 });
    }) as typeof fetch;

    const { ctx } = await e3Fixtures();
    const model = ctx.config.models[0];
    const unit = makeE3BatchUnit(model, 0, 'e3-doc', ctx, 'key', ctx.requests.map(() => toyEstimate));
    const entries = new Map<string, ReplayEntry>(
      ctx.requests.map((r) => [
        `cand${r.candidate_index}`,
        r.candidate_index === 1 ? { kind: 'sync-fill' } : succeededEntry(validResponse(r.candidate_index)),
      ]),
    );
    const { record } = await unit.executeWithReplay(entries);
    const payload = record.payload as EvolveStepPayload;
    expect(filled).toBe(1);
    expect(payload.parse_status).toBe('ok');
    expect(Object.keys(payload.ranking_scores)).toHaveLength(ctx.requests.length);
  });
});
