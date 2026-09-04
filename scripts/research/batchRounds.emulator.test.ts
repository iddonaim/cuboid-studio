/**
 * Batch submit/collect rounds end to end: real Firestore (emulator), real
 * executors, real submission docs — only the Anthropic Batch API and the
 * meme-image host are scripted (fetch patched; everything else passes
 * through, so the emulator SDK is untouched).
 *
 * Runs only when the emulator is reachable (npm run test:rules, or
 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test). Proves the operational
 * story the transport was built for:
 *   - E2: submit (a-cells only; c-cells wait on frozen sources) → collect →
 *     submit (c-cells, prefilled from the just-written a-records) → collect,
 *     ending with the full matrix written and a re-run collecting nothing;
 *   - one-open-submission discipline (submit refuses while in flight or
 *     uncollected);
 *   - expired slots defer unbilled and resubmit in the next round;
 *   - request-identity verification refuses to attach results when an input
 *     (image bytes) changed between submit and collect;
 *   - E3 steps batch per candidate call and collect into one step record.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc, type Firestore } from 'firebase/firestore';
import type { EvolveStepPayload, TranslationPayload } from '../../src/research/types';
import type { BatchResultEntry } from './lib/anthropicBatch';
import {
  collectBatchRound,
  makeE2BatchUnit,
  makeE3BatchUnit,
  submissionDocId,
  submitBatchRound,
  type BatchRoundContext,
  type BatchSubmissionDoc,
  type BatchUnit,
} from './lib/batchTransport';
import { parseBatchConfig, type BatchConfig } from './lib/config';
import { loadCorpusFromFile, type Corpus } from './lib/corpus';
import { estimateBatchRoute } from './lib/costs';
import { buildStepTranslationRequests, hashEvolveState, parseFrozenEvolveState } from './lib/evolveState';
import { type EvolveStepContext } from './lib/evolveStep';
import { defaultFrozenSourceDocId, expandMatrix, type MatrixCell } from './lib/matrix';
import { captureRegime } from './lib/regime';
import {
  extractFrozenSource,
  FrozenSourceUnavailableError,
  type TranslationCellContext,
} from './lib/translationCell';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const REPO_ROOT = path.resolve(__dirname, '../..');
const TOY_BATCH = path.join(REPO_ROOT, 'scripts/research/examples/e2-toy.batch.json');
const TOY_E3_BATCH = path.join(REPO_ROOT, 'scripts/research/examples/e3-toy.batch.json');
const TOY_STATE = path.join(REPO_ROOT, 'scripts/research/examples/e3-toy.state.json');
const TOY_CORPUS = path.join(REPO_ROOT, 'scripts/research/examples/e2-toy.corpus.json');

// Fixture responses (match harness.test.ts shapes).
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
const fullTwoPass = JSON.stringify([validPass1, validPass2]);
const continuationFor = JSON.stringify(validPass2) + ']';

// ---------------------------------------------------------------------------
// Scripted Batch API + image host (everything else passes through to the
// real fetch, so the emulator SDK works untouched)
// ---------------------------------------------------------------------------

interface FakeBatch {
  id: string;
  status: 'in_progress' | 'ended';
  requests: Array<{ custom_id: string; params: Record<string, unknown> }>;
  /** Result per request; default: succeeded with a valid response (a
   *  continuation when the request carried an assistant prefill). */
  resultFor: (request: { custom_id: string; params: Record<string, unknown> }) => BatchResultEntry;
}

const fakeBatches = new Map<string, FakeBatch>();
let batchCounter = 0;
let imageBytes = new Uint8Array([1, 2, 3, 4]);

const FAKE_USAGE = { input_tokens: 5100, output_tokens: 1180, cache_creation_input_tokens: 1100, cache_read_input_tokens: 0 };

function defaultResult(request: { params: Record<string, unknown> }): BatchResultEntry {
  const messages = request.params.messages as Array<{ role: string; content: unknown }>;
  const prefilled = messages[messages.length - 1]?.role === 'assistant';
  return {
    type: 'succeeded',
    message: {
      content: [{ type: 'text', text: prefilled ? continuationFor : fullTwoPass }],
      stop_reason: 'end_turn',
      usage: FAKE_USAGE,
    },
  };
}

function lastFakeBatch(): FakeBatch {
  return fakeBatches.get(`msgbatch_fake_${batchCounter}`)!;
}

const realFetch = globalThis.fetch;

function installFakeFetch(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://firebasestorage.googleapis.com/')) {
      return new Response(imageBytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    if (url === 'https://api.anthropic.com/v1/messages/batches' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { requests: FakeBatch['requests'] };
      const id = `msgbatch_fake_${++batchCounter}`;
      fakeBatches.set(id, { id, status: 'in_progress', requests: body.requests, resultFor: defaultResult });
      return Response.json({
        id,
        processing_status: 'in_progress',
        request_counts: { processing: body.requests.length, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
      });
    }
    const batchMatch = url.match(/^https:\/\/api\.anthropic\.com\/v1\/messages\/batches\/([^/]+)(\/results)?$/);
    if (batchMatch) {
      const batch = fakeBatches.get(batchMatch[1]);
      if (!batch) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      if (batchMatch[2]) {
        if (batch.status !== 'ended') return new Response(JSON.stringify({ error: 'not ended' }), { status: 404 });
        const lines = batch.requests.map((r) => JSON.stringify({ custom_id: r.custom_id, result: batch.resultFor(r) }));
        return new Response(lines.join('\n') + '\n', { status: 200 });
      }
      const done = batch.status === 'ended' ? batch.requests.length : 0;
      return Response.json({
        id: batch.id,
        processing_status: batch.status,
        request_counts: {
          processing: batch.requests.length - done,
          succeeded: done,
          errored: 0,
          canceled: 0,
          expired: 0,
        },
      });
    }
    if (url === 'https://api.anthropic.com/v1/messages') {
      // Collect-time sync fallback (retries / sync-fill).
      return Response.json({ content: [{ type: 'text', text: fullTwoPass }], stop_reason: 'end_turn' });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------

describe.skipIf(!emulatorHost)('batch submit/collect rounds (emulator + scripted Batch API)', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, port] = (emulatorHost as string).split(':');
    env = await initializeTestEnvironment({
      projectId: 'rules-test-batch-rounds',
      firestore: {
        host,
        port: Number(port),
        rules: fs.readFileSync(path.join(REPO_ROOT, 'firestore.rules'), 'utf-8'),
      },
    });
    installFakeFetch();
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    fakeBatches.clear();
    batchCounter = 0;
    imageBytes = new Uint8Array([1, 2, 3, 4]);
  });

  const researchDb = () => env.authenticatedContext('research-user', { research: true }).firestore() as unknown as Firestore;

  async function e2Setup(mutate?: (cfg: BatchConfig) => void): Promise<{
    db: Firestore;
    config: BatchConfig;
    corpus: Corpus;
    cells: MatrixCell[];
    units: BatchUnit[];
    roundCtx: BatchRoundContext;
  }> {
    const config = parseBatchConfig(fs.readFileSync(TOY_BATCH, 'utf-8'), TOY_BATCH);
    mutate?.(config);
    const corpus = await loadCorpusFromFile(fs.readFileSync(TOY_CORPUS, 'utf-8'), TOY_CORPUS);
    const { regime, twoPassPromptText } = await captureRegime(REPO_ROOT);
    const db = researchDb();
    const cells = expandMatrix(config, corpus);

    const cellCtx: TranslationCellContext = {
      config,
      regime,
      twoPassPromptText,
      siteContext: null,
      siteContextHash: null,
      appCommit: 'test-commit',
      anthropicKey: 'test-key',
      openRouterKey: null,
      // Same resolution rule as run.ts: the batch's own cell-(a) replicate 0.
      resolveFrozenSource: async (cell) => {
        const sourceDocId = defaultFrozenSourceDocId(config, cell);
        const snap = await getDoc(doc(db, 'research_records', sourceDocId));
        if (!snap.exists()) {
          throw new FrozenSourceUnavailableError(`cell (c) frozen source ${sourceDocId} not found`);
        }
        return extractFrozenSource(sourceDocId, snap.data());
      },
      prefillSupport: new Map(config.models.map((m) => [m.id, true])),
    };

    const units = cells.map((cell) =>
      makeE2BatchUnit(
        cell,
        cellCtx,
        'test-key',
        estimateBatchRoute({
          modelId: cell.model.id,
          systemPromptChars: 8000,
          userMessageChars: 400,
          hasImage: true,
          cellType: cell.cellType,
          cacheTtl: '1h',
        }),
      ),
    );
    const roundCtx: BatchRoundContext = {
      db,
      anthropicKey: 'test-key',
      batchId: config.batch_id,
      operator: 'emulator-test-operator',
      appCommit: 'test-commit',
      cacheTtl: '1h',
      budgetCapUsd: config.budget_cap_usd,
      imageCache: new Map(),
    };
    return { db, config, corpus, cells, units, roundCtx };
  }

  it(
    'E2 full flow: submit(a) → collect → submit(c, prefilled from round 1) → collect; idempotent re-collect',
    { timeout: 120_000 },
    async () => {
      const { db, config, cells, units, roundCtx } = await e2Setup();
      const aCells = cells.filter((c) => c.cellType === 'a');
      const cCells = cells.filter((c) => c.cellType === 'c');

      // Round 1: only the a-cells are submittable (c-cells' frozen sources
      // don't exist yet).
      await submitBatchRound(roundCtx, units);
      const sub1 = (await getDoc(doc(db, 'research_batches', submissionDocId(config.batch_id, 1)))).data() as BatchSubmissionDoc;
      expect(sub1.kind).toBe('batch_submission');
      expect(sub1.operator).toBe('emulator-test-operator');
      expect(sub1.request_count).toBe(aCells.length);
      expect(new Set(sub1.units.map((u) => u.doc_id))).toEqual(new Set(aCells.map((c) => c.docId)));
      for (const unit of sub1.units) expect(unit.params_hash).toMatch(/^[0-9a-f]{64}$/);

      // One open submission at a time: still in progress → refuse.
      await expect(submitBatchRound(roundCtx, units)).rejects.toThrow(/run --collect/);
      lastFakeBatch().status = 'ended';
      // Ended but uncollected → still refuse.
      await expect(submitBatchRound(roundCtx, units)).rejects.toThrow(/collectable results/);

      const collect1 = await collectBatchRound(roundCtx, units);
      expect(collect1.written).toBe(aCells.length);
      expect(collect1.awaiting_submission).toBe(cCells.length);

      const aRecord = (await getDoc(doc(db, 'research_records', aCells[0].docId))).data() as {
        payload: TranslationPayload;
        declared: { fixed: string[] };
        cost_usd_estimate: number;
        usage?: Record<string, unknown>;
      };
      expect(aRecord.payload.parse_status).toBe('ok');
      expect(aRecord.payload.attempts.map((a) => a.role)).toEqual(['initial']);
      expect(aRecord.declared.fixed.some((l) => l.includes('anthropic message batches'))).toBe(true);
      expect(aRecord.cost_usd_estimate).toBeGreaterThan(0);
      // Real billed usage rides along (2026-09-04 approval), coverage explicit.
      expect(aRecord.usage).toEqual({ source: 'anthropic-batch', ...FAKE_USAGE, calls_covered: 1, calls_total: 1 });

      // Round 2: the c-cells go up, prefilled from round 1's records.
      await submitBatchRound(roundCtx, units);
      const sub2 = (await getDoc(doc(db, 'research_batches', submissionDocId(config.batch_id, 2)))).data() as BatchSubmissionDoc;
      expect(sub2.request_count).toBe(cCells.length);
      expect(new Set(sub2.units.map((u) => u.doc_id))).toEqual(new Set(cCells.map((c) => c.docId)));
      const prefills = lastFakeBatch().requests.map((r) => {
        const messages = r.params.messages as Array<{ role: string; content: unknown }>;
        return messages[messages.length - 1];
      });
      for (const last of prefills) {
        expect(last.role).toBe('assistant');
        expect(String(last.content).startsWith('[' + JSON.stringify(validPass1) + ',')).toBe(true);
      }

      lastFakeBatch().status = 'ended';
      const collect2 = await collectBatchRound(roundCtx, units);
      expect(collect2.written).toBe(cCells.length);
      expect(collect2.awaiting_submission).toBe(0);

      const cRecord = (await getDoc(doc(db, 'research_records', cCells[0].docId))).data() as { payload: TranslationPayload };
      expect(cRecord.payload.parse_status).toBe('ok');
      expect(cRecord.payload.prefill).toBe(true);
      expect(cRecord.payload.pass1_input_mode).toMatch(/^frozen:/);
      expect(cRecord.payload.raw_response?.startsWith('[' + JSON.stringify(validPass1) + ',')).toBe(true);

      // Append-only submission docs: nobody can rewrite provenance.
      await assertFails(updateDoc(doc(db, 'research_batches', submissionDocId(config.batch_id, 1)), { operator: 'evil' }));

      // Idempotent: a re-run collects nothing and writes nothing new.
      const collect3 = await collectBatchRound(roundCtx, units);
      expect(collect3.written).toBe(0);
      expect(collect3.skipped_existing).toBe(cells.length);
    },
  );

  it('expired slots defer unbilled and go up again in the next round', { timeout: 60_000 }, async () => {
    const { db, config, units, roundCtx } = await e2Setup((cfg) => {
      cfg.batch_id = 'e2-toy-expired';
      cfg.cells = ['a'];
      cfg.replicates = 1;
    });

    await submitBatchRound(roundCtx, units);
    const batch1 = lastFakeBatch();
    batch1.status = 'ended';
    batch1.resultFor = () => ({ type: 'expired' });

    const collect1 = await collectBatchRound(roundCtx, units);
    expect(collect1.written).toBe(0);
    expect(collect1.deferred_expired).toBe(units.length);

    // The voided calls resubmit — same custom_ids, new submission.
    await submitBatchRound(roundCtx, units);
    const sub1 = (await getDoc(doc(db, 'research_batches', submissionDocId(config.batch_id, 1)))).data() as BatchSubmissionDoc;
    const sub2 = (await getDoc(doc(db, 'research_batches', submissionDocId(config.batch_id, 2)))).data() as BatchSubmissionDoc;
    expect(new Set(sub2.units.map((u) => u.custom_id))).toEqual(new Set(sub1.units.map((u) => u.custom_id)));

    lastFakeBatch().status = 'ended';
    const collect2 = await collectBatchRound(roundCtx, units);
    expect(collect2.written).toBe(units.length);
  });

  it('request-identity mismatch (image bytes moved) refuses to attach results', { timeout: 60_000 }, async () => {
    const { db, units, roundCtx, cells } = await e2Setup((cfg) => {
      cfg.batch_id = 'e2-toy-drift';
      cfg.cells = ['a'];
      cfg.replicates = 1;
    });

    await submitBatchRound(roundCtx, units);
    lastFakeBatch().status = 'ended';

    // The image host now serves different bytes under the same URLs, and the
    // collect runs with a fresh image cache (a later day, a different runner).
    imageBytes = new Uint8Array([9, 9, 9, 9]);
    roundCtx.imageCache = new Map();

    await expect(collectBatchRound(roundCtx, units)).rejects.toThrow(/request-identity mismatch/);
    expect((await getDoc(doc(db, 'research_records', cells[0].docId))).exists()).toBe(false);
  });

  it('E3: one step replicate batches per candidate and collects into one record', { timeout: 60_000 }, async () => {
    const config = parseBatchConfig(fs.readFileSync(TOY_E3_BATCH, 'utf-8'), TOY_E3_BATCH);
    const corpus = await loadCorpusFromFile(fs.readFileSync(TOY_CORPUS, 'utf-8'), TOY_CORPUS);
    const state = parseFrozenEvolveState(fs.readFileSync(TOY_STATE, 'utf-8'), TOY_STATE);
    const { regime, twoPassPromptText } = await captureRegime(REPO_ROOT);
    const db = researchDb();
    const requests = buildStepTranslationRequests(state, corpus);

    const stepCtx: EvolveStepContext = {
      config,
      regime,
      twoPassPromptText,
      siteContext: null,
      siteContextHash: null,
      appCommit: 'test-commit',
      anthropicKey: 'test-key',
      openRouterKey: null,
      state,
      stateHash: await hashEvolveState(state),
      requests,
    };
    const perCall = requests.map((request) =>
      estimateBatchRoute({
        modelId: config.models[0].id,
        systemPromptChars: 8000,
        userMessageChars: 400,
        hasImage: Boolean(request.memeImageUrl),
        cellType: 'a',
        cacheTtl: '1h',
      }),
    );
    const units = [0, 1].map((r) =>
      makeE3BatchUnit(config.models[0], r, `e3-toy-000__step__r${r}`, stepCtx, 'test-key', perCall),
    );
    const roundCtx: BatchRoundContext = {
      db,
      anthropicKey: 'test-key',
      batchId: config.batch_id,
      operator: 'emulator-test-operator',
      appCommit: 'test-commit',
      cacheTtl: '1h',
      budgetCapUsd: config.budget_cap_usd,
      imageCache: new Map(),
    };

    await submitBatchRound(roundCtx, units);
    const sub = (await getDoc(doc(db, 'research_batches', submissionDocId(config.batch_id, 1)))).data() as BatchSubmissionDoc;
    expect(sub.request_count).toBe(units.length * requests.length);
    expect(new Set(sub.units.map((u) => u.call_key))).toEqual(new Set(requests.map((r) => `cand${r.candidate_index}`)));

    lastFakeBatch().status = 'ended';
    const summary = await collectBatchRound(roundCtx, units);
    expect(summary.written).toBe(units.length);

    const record = (await getDoc(doc(db, 'research_records', units[0].docId))).data() as {
      payload: EvolveStepPayload;
      declared: { fixed: string[] };
      usage?: Record<string, unknown>;
    };
    expect(record.payload.parse_status).toBe('ok');
    expect(record.payload.candidate_set).toHaveLength(requests.length);
    expect(Object.keys(record.payload.ranking_scores)).toHaveLength(requests.length);
    expect(record.declared.fixed.some((l) => l.includes('anthropic message batches'))).toBe(true);
    expect(record.usage).toEqual({
      source: 'anthropic-batch',
      input_tokens: FAKE_USAGE.input_tokens * requests.length,
      output_tokens: FAKE_USAGE.output_tokens * requests.length,
      cache_creation_input_tokens: FAKE_USAGE.cache_creation_input_tokens * requests.length,
      cache_read_input_tokens: 0,
      calls_covered: requests.length,
      calls_total: requests.length,
    });
  });
});

// Visible signal (not a failure) when the file is skipped for lack of an emulator.
describe.skipIf(Boolean(emulatorHost))('batch rounds (emulator not running)', () => {
  it('skipped — set FIRESTORE_EMULATOR_HOST or use npm run test:rules', () => {
    expect(true).toBe(true);
  });
});
