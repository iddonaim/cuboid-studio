/**
 * Batch-transport orchestration (--transport batch / --collect, 2026-09-04).
 *
 * A batch run splits the sync loop's per-cell "call, parse, write" into two
 * commands separated by hours:
 *
 *   SUBMIT (--execute --transport batch): for every pending unit, run the
 *   normal executor with a transport that CAPTURES the request it was about
 *   to send and throws instead of calling (the produced record is discarded,
 *   nothing written) — so the submitted request params are built by the very
 *   code path that will later interpret the response, never by a parallel
 *   reimplementation. All captured calls go up as one Message Batch; an
 *   append-only submission doc in `research_batches` records the Anthropic
 *   batch id and each call's params hash.
 *
 *   COLLECT (--collect): downloads the ended batch's results and runs the
 *   SAME executor again, now with a transport that REPLAYS each call's
 *   stored result for the initial request and delegates any parse/validation
 *   retry to the real sync caller — parseAndRoute, the recording caller, the
 *   validators and the record builder all run exactly as in a sync run, so
 *   records come out shape-identical with identical failure handling.
 *   Before any result is attached, the request params are rebuilt from the
 *   same inputs and hash-compared against the submission doc: a result is
 *   never written onto a request the harness can no longer reproduce.
 *
 * Round semantics: one open submission at a time. Expired/canceled slots
 * (the API bills nothing for them) void back to "pending" and go into the
 * next submit round; an E2 cell (c) whose frozen Pass-1 source is written by
 * an earlier round's collect becomes submittable in the next round — so a
 * full E2 batch is typically submit → collect → submit → collect.
 *
 * State lives in Firestore, not on the machine: submission docs are
 * create-only documents (`<batch_id>__submission__NNN`) under the same
 * append-only rules as the batch record, so a collect can run from a
 * different machine (the GitHub Action) than the submit. Doc ids are
 * sequential, so discovery is plain gets — no queries needed.
 */

import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { makeAnthropicCaller, type CallerOpts } from '../../../api/translate-meme.js';
import {
  RESEARCH_BATCHES_COLLECTION,
  type DeclaredInfo,
  type EvolveStepPayload,
  type ResearchRecord,
  type TranslationPayload,
  type UsageInfo,
} from '../../../src/research/types.js';
import { researchRecordExists, writeResearchRecord } from '../../../src/research/writeResearchRecord.js';
import {
  batchCustomId,
  buildAnthropicMessageParams,
  createMessageBatch,
  extractBatchResultText,
  fetchImageForBatch,
  fetchMessageBatchResults,
  getMessageBatch,
  hashMessageParams,
  withSystemCacheControl,
  type BatchResultEntry,
  type CacheTtl,
  type ImageCache,
  type MessageBatchStatus,
} from './anthropicBatch.js';
import { batchRouteTotals, renderBatchPricingLines, type BatchRouteEstimate } from './costs.js';
import type { BatchModelConfig } from './config.js';
import { declaredForStep, runEvolveStep, type EvolveStepContext } from './evolveStep.js';
import type { MatrixCell } from './matrix.js';
import { FrozenSourceUnavailableError, runTranslationCell, type TranslationCellContext } from './translationCell.js';

// ---------------------------------------------------------------------------
// Declared additions for batch-collected records
// ---------------------------------------------------------------------------

/**
 * The pre-registration deltas an honest batch-mode record carries. Sync
 * records are untouched — these lines are appended only on the batch route.
 */
export function withBatchTransportDeclared(declared: DeclaredInfo): DeclaredInfo {
  return {
    ...declared,
    fixed: [
      ...declared.fixed,
      'transport: anthropic message batches api (request content identical to the sync transport; cache_control(ephemeral) breakpoint on the shared system prompt — billing metadata, not prompt content)',
    ],
    stochastic: [
      ...declared.stochastic,
      'batch scheduling: attempt 1 ran asynchronously in the batch service — recorded timing_ms measures collect-time replay, not model latency; prompt-cache hits are best-effort; parse/validation retries (and calls whose batch slot expired) run synchronously at collect time',
    ],
    measured: [
      ...declared.measured,
      'usage: real token counts as billed, summed over batch-replayed calls (sync retries and sync-filled slots report none — coverage recorded as usage.calls_covered/calls_total; 2026-09-04 approval)',
    ],
  };
}

// ---------------------------------------------------------------------------
// Real usage capture (2026-09-04 approval: optional, additive)
// ---------------------------------------------------------------------------

/** Every transport call the finished record actually made (attempts include
 *  the pipeline's retries; evolve_step counts across candidates). */
function transportCallCount(record: ResearchRecord): number {
  if (record.kind === 'translation') return (record.payload as TranslationPayload).attempts.length;
  if (record.kind === 'evolve_step') {
    return (record.payload as EvolveStepPayload).candidate_set.reduce((n, c) => n + (c.attempts?.length ?? 0), 0);
  }
  return 0;
}

/**
 * Sums the API-reported usage of the record's batch-replayed calls. Only
 * succeeded batch results carry a usage object (errored/expired/canceled
 * slots billed nothing; sync retries and sync-fills go through the app's
 * caller, which discards usage — app code, unchanged). A succeeded result
 * that later failed parsing still counts: its tokens were billed. Returns
 * null when no call reported usage — the record then omits the block.
 */
export function batchUsageForRecord(
  entries: Map<string, ReplayEntry>,
  record: ResearchRecord,
): UsageInfo | null {
  let covered = 0;
  let input = 0;
  let output = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  for (const entry of entries.values()) {
    if (entry.kind !== 'result' || entry.result.type !== 'succeeded') continue;
    const usage = (entry.result.message as { usage?: Record<string, unknown> } | null | undefined)?.usage;
    if (!usage || typeof usage.input_tokens !== 'number' || typeof usage.output_tokens !== 'number') continue;
    covered++;
    input += usage.input_tokens;
    output += usage.output_tokens;
    cacheWrite += typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
    cacheRead += typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
  }
  if (covered === 0) return null;
  return {
    source: 'anthropic-batch',
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: cacheWrite,
    cache_read_input_tokens: cacheRead,
    calls_covered: covered,
    calls_total: transportCallCount(record),
  };
}

// ---------------------------------------------------------------------------
// Capture transport (submit phase)
// ---------------------------------------------------------------------------

const CAPTURE_SIGNAL_MESSAGE = 'batch-transport capture: request params captured; no model call made';

/** Thrown by the capture transport instead of calling the network. The
 *  executor records it as a failed attempt in a record the submit phase
 *  discards — nothing is written during capture. */
export class SubmitCaptureSignal extends Error {
  constructor() {
    super(CAPTURE_SIGNAL_MESSAGE);
  }
}

/** The capture transport: parseAndRoute's initial call throws immediately
 *  (its outer catch turns that into a 500 — exactly one transport
 *  invocation per call, so exactly one capture). */
export function captureThrowingCaller(): (retryMessage?: string) => Promise<string> {
  return async () => {
    throw new SubmitCaptureSignal();
  };
}

/** parseAndRoute logs every transport error via console.error — during a
 *  capture pass that would print one misleading "Translation error" per
 *  cell. Drop exactly those lines (recognized by the signal message),
 *  pass everything else through. */
export async function withCaptureConsoleQuiet<T>(fn: () => Promise<T>): Promise<T> {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (args.some((a) => a instanceof Error && a.message === CAPTURE_SIGNAL_MESSAGE)) return;
    originalError(...args);
  };
  try {
    return await fn();
  } finally {
    console.error = originalError;
  }
}

// ---------------------------------------------------------------------------
// Replay transport (collect phase)
// ---------------------------------------------------------------------------

export type ReplayEntry =
  /** A stored batch result: replayed for the initial call. */
  | { kind: 'result'; result: BatchResultEntry }
  /** An expired/canceled slot inside an otherwise-usable unit (E3): the
   *  call runs synchronously now — the API billed nothing for the slot. */
  | { kind: 'sync-fill' };

/**
 * The replay transport for one call. Initial invocation (no retryMessage):
 * return the batch result's text — or throw the same-shaped errors the sync
 * caller would have thrown (max_tokens cutoff, missing text block, API
 * error), which the recording caller stores verbatim. Retries (parseAndRoute
 * always passes a retry message) go to the real sync caller; the image is
 * dropped from retries exactly as makeAnthropicCaller does.
 */
export function makeReplayCaller(
  entry: ReplayEntry,
  opts: CallerOpts,
  anthropicKey: string,
): (retryMessage?: string) => Promise<string> {
  let syncDelegate: ((retryMessage?: string) => Promise<string>) | null = null;
  return async (retryMessage?: string) => {
    if (retryMessage === undefined) {
      if (entry.kind === 'sync-fill') {
        const transport = await makeAnthropicCaller({ ...opts, apiKey: anthropicKey });
        return transport();
      }
      if (entry.result.type === 'succeeded') return extractBatchResultText(entry.result.message);
      // errored — canceled/expired never reach the executor (unit-level
      // handling in collectBatchRound), so this is a real API error result.
      throw new Error(`Anthropic Batch API result error: ${JSON.stringify(entry.result.error ?? entry.result)}`);
    }
    if (!syncDelegate) {
      // Retries never carry the image (mirrors the sync caller's
      // `imageBase64 && !retryMessage`), so skip the pointless download.
      syncDelegate = await makeAnthropicCaller({ ...opts, apiKey: anthropicKey, memeImageUrl: null });
    }
    return syncDelegate(retryMessage);
  };
}

// ---------------------------------------------------------------------------
// Submission docs (append-only, in research_batches)
// ---------------------------------------------------------------------------

export const BATCH_SUBMISSION_KIND = 'batch_submission';

export interface BatchSubmissionUnit {
  custom_id: string;
  doc_id: string;
  /** "call" (E2 cell) or "cand<i>" (one E3 step candidate). */
  call_key: string;
  /** sha256 of the exact submitted request params (cache_control included). */
  params_hash: string;
}

export interface BatchSubmissionDoc {
  kind: typeof BATCH_SUBMISSION_KIND;
  batch_id: string;
  submission_index: number;
  transport: 'anthropic-batch';
  anthropic_batch_id: string;
  cache_ttl: CacheTtl;
  created_at: string;
  /** Who launched this round (--operator). */
  operator: string;
  app_commit: string;
  request_count: number;
  est_usd_sync: number;
  est_usd_batch_worst: number;
  est_usd_batch_best: number;
  units: BatchSubmissionUnit[];
}

export function submissionDocId(batchId: string, index: number): string {
  return `${batchId}__submission__${String(index).padStart(3, '0')}`;
}

/** Sequential ids make discovery plain gets: read 001, 002, … until one is
 *  missing. Malformed docs fail loudly — they are provenance. */
export async function listSubmissionDocs(db: Firestore, batchId: string): Promise<BatchSubmissionDoc[]> {
  const docs: BatchSubmissionDoc[] = [];
  for (let index = 1; index <= 999; index++) {
    const snap = await getDoc(doc(db, RESEARCH_BATCHES_COLLECTION, submissionDocId(batchId, index)));
    if (!snap.exists()) break;
    const data = snap.data() as BatchSubmissionDoc;
    if (data.kind !== BATCH_SUBMISSION_KIND || typeof data.anthropic_batch_id !== 'string' || !Array.isArray(data.units)) {
      throw new Error(`submission doc ${submissionDocId(batchId, index)} is malformed — refusing to reason about batch state from it`);
    }
    docs.push(data);
  }
  return docs;
}

export async function writeSubmissionDoc(db: Firestore, sub: BatchSubmissionDoc): Promise<void> {
  const ref = doc(db, RESEARCH_BATCHES_COLLECTION, submissionDocId(sub.batch_id, sub.submission_index));
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error(`submission doc ${submissionDocId(sub.batch_id, sub.submission_index)} already exists — refusing to overwrite (append-only)`);
  }
  await setDoc(ref, JSON.parse(JSON.stringify(sub)));
}

// ---------------------------------------------------------------------------
// The unit abstraction + the E2/E3 executor adapters
// ---------------------------------------------------------------------------

export interface CapturedCall {
  callKey: string;
  opts: CallerOpts;
}

export interface BatchUnit {
  docId: string;
  modelId: string;
  /** Per-CALL batch-route estimates, callKey-aligned (E2: one entry;
   *  E3: one per candidate). */
  callEstimates: Array<{ callKey: string; est: BatchRouteEstimate }>;
  /** Runs the executor with the capture transport and returns the calls it
   *  was about to make. Throws FrozenSourceUnavailableError to defer. */
  capture(): Promise<CapturedCall[]>;
  /** Runs the executor with replay transports and returns the record to
   *  write (batch declared-lines applied by the adapter). */
  executeWithReplay(entries: Map<string, ReplayEntry>): Promise<{ record: ResearchRecord }>;
}

function unitWorstUsd(unit: BatchUnit): number {
  return unit.callEstimates.reduce((sum, c) => sum + c.est.usd_batch_worst, 0);
}

/** One E2 cell as a batch unit: capture and replay both run the REAL cell
 *  executor — the transport seam is the only difference from a sync run. */
export function makeE2BatchUnit(
  cell: MatrixCell,
  baseCtx: TranslationCellContext,
  anthropicKey: string,
  est: BatchRouteEstimate,
): BatchUnit {
  return {
    docId: cell.docId,
    modelId: cell.model.id,
    callEstimates: [{ callKey: 'call', est }],
    async capture() {
      const captured: CapturedCall[] = [];
      const ctx: TranslationCellContext = {
        ...baseCtx,
        transportOverride: (_cell, opts) => {
          captured.push({ callKey: 'call', opts });
          return captureThrowingCaller();
        },
      };
      await runTranslationCell(ctx, cell); // record discarded — capture only
      return captured;
    },
    async executeWithReplay(entries) {
      const entry = entries.get('call');
      if (!entry) throw new Error(`no replay entry for ${cell.docId}`);
      const ctx: TranslationCellContext = {
        ...baseCtx,
        transportOverride: (_cell, opts) => makeReplayCaller(entry, opts, anthropicKey),
      };
      const result = await runTranslationCell(ctx, { ...cell, declared: withBatchTransportDeclared(cell.declared) });
      return { record: result.record };
    },
  };
}

/** One E3 step replicate as a batch unit: each candidate is one batch call
 *  (callKey "cand<i>"); capture and replay both run the real step executor. */
export function makeE3BatchUnit(
  model: BatchModelConfig,
  replicateIndex: number,
  docId: string,
  baseCtx: EvolveStepContext,
  anthropicKey: string,
  perCallEsts: BatchRouteEstimate[],
): BatchUnit {
  const candidateCount = baseCtx.requests.length;
  return {
    docId,
    modelId: model.id,
    callEstimates: baseCtx.requests.map((request, i) => ({ callKey: `cand${request.candidate_index}`, est: perCallEsts[i] })),
    async capture() {
      const captured: CapturedCall[] = [];
      const ctx: EvolveStepContext = {
        ...baseCtx,
        transportOverride: (request, opts) => {
          captured.push({ callKey: `cand${request.candidate_index}`, opts });
          return captureThrowingCaller();
        },
      };
      await runEvolveStep(ctx, model, replicateIndex); // record discarded — capture only
      if (captured.length !== candidateCount) {
        throw new Error(`E3 capture for ${docId} saw ${captured.length}/${candidateCount} candidate calls`);
      }
      return captured;
    },
    async executeWithReplay(entries) {
      const ctx: EvolveStepContext = {
        ...baseCtx,
        declared: withBatchTransportDeclared(declaredForStep()),
        transportOverride: (request, opts) => {
          const entry = entries.get(`cand${request.candidate_index}`);
          if (!entry) throw new Error(`no replay entry for ${docId} cand${request.candidate_index}`);
          return makeReplayCaller(entry, opts, anthropicKey);
        },
      };
      const result = await runEvolveStep(ctx, model, replicateIndex);
      return { record: result.record };
    },
  };
}

function unitRows(unit: BatchUnit): Array<{ modelId: string; est: BatchRouteEstimate }> {
  return unit.callEstimates.map((c) => ({ modelId: unit.modelId, est: c.est }));
}

// ---------------------------------------------------------------------------
// Prior-submission state
// ---------------------------------------------------------------------------

interface PriorMapping {
  submissionIndex: number;
  custom_id: string;
  params_hash: string;
}

interface PriorState {
  submissions: BatchSubmissionDoc[];
  /** Latest mapping per `<doc_id>::<call_key>` — a call resubmitted after an
   *  expiry is governed by its newest submission; earlier ones are void. */
  latest: Map<string, PriorMapping>;
  status: Map<number, MessageBatchStatus>;
  /** Results per ended submission index. */
  results: Map<number, Map<string, BatchResultEntry>>;
}

export function callId(docId: string, callKey: string): string {
  return `${docId}::${callKey}`;
}

async function loadPriorState(ctx: BatchRoundContext): Promise<PriorState> {
  const submissions = await listSubmissionDocs(ctx.db, ctx.batchId);
  const latest = new Map<string, PriorMapping>();
  const status = new Map<number, MessageBatchStatus>();
  const results = new Map<number, Map<string, BatchResultEntry>>();
  for (const sub of submissions) {
    for (const unit of sub.units) {
      latest.set(callId(unit.doc_id, unit.call_key), {
        submissionIndex: sub.submission_index,
        custom_id: unit.custom_id,
        params_hash: unit.params_hash,
      });
    }
    const s = await getMessageBatch(ctx.anthropicKey, sub.anthropic_batch_id);
    status.set(sub.submission_index, s);
    if (s.processing_status === 'ended') {
      results.set(sub.submission_index, await fetchMessageBatchResults(ctx.anthropicKey, sub.anthropic_batch_id));
    }
  }
  return { submissions, latest, status, results };
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export interface BatchRoundContext {
  db: Firestore;
  anthropicKey: string;
  batchId: string;
  operator: string;
  appCommit: string;
  cacheTtl: CacheTtl;
  budgetCapUsd: number | null;
  imageCache: ImageCache;
}

async function buildSubmittedParams(
  opts: CallerOpts,
  cacheTtl: CacheTtl,
  imageCache: ImageCache,
): Promise<Record<string, unknown>> {
  const image = opts.memeImageUrl ? await fetchImageForBatch(opts.memeImageUrl, imageCache) : null;
  return withSystemCacheControl(buildAnthropicMessageParams(opts, image), cacheTtl);
}

/**
 * SUBMIT: capture every pending unit's calls, price them, refuse over
 * budget, create ONE Message Batch, record it in an append-only submission
 * doc. Refuses while a prior submission still has uncollected work — one
 * open submission at a time keeps "what is in flight" answerable from
 * Firestore alone.
 */
export async function submitBatchRound(ctx: BatchRoundContext, units: BatchUnit[]): Promise<void> {
  const prior = await loadPriorState(ctx);

  // Records already written (any transport) are done regardless of mappings.
  const exists = new Map<string, boolean>();
  for (const unit of units) exists.set(unit.docId, await researchRecordExists(ctx.db, unit.docId));
  const knownDocs = new Set(units.map((u) => u.docId));

  for (const [id, mapping] of prior.latest) {
    const docId = id.split('::')[0];
    if (exists.get(docId)) continue; // collected — closed.
    if (!knownDocs.has(docId)) {
      console.warn(`warning: prior submission ${mapping.submissionIndex} covers ${docId}, which is not in the current matrix — did the config shrink?`);
      continue;
    }
    const s = prior.status.get(mapping.submissionIndex)!;
    if (s.processing_status !== 'ended') {
      throw new Error(
        `submission ${mapping.submissionIndex} (${s.id}) is still ${s.processing_status} ` +
        `(${s.request_counts.processing} processing / ${s.request_counts.succeeded} succeeded) — ` +
        'one submission at a time: run --collect after it ends',
      );
    }
    const result = prior.results.get(mapping.submissionIndex)?.get(mapping.custom_id);
    if (!result) {
      throw new Error(`submission ${mapping.submissionIndex} results are missing custom_id ${mapping.custom_id} — cannot reason about batch state`);
    }
    if (result.type === 'succeeded' || result.type === 'errored') {
      throw new Error(
        `submission ${mapping.submissionIndex} has collectable results not yet written (e.g. ${docId}) — run --collect before submitting another round`,
      );
    }
    // expired / canceled: unbilled, void — the call re-enters this round.
  }

  // Capture pending units.
  const pending: Array<{ unit: BatchUnit; calls: Array<CapturedCall & { customId: string; params: Record<string, unknown>; paramsHash: string }> }> = [];
  let skipped = 0;
  let deferredFrozen = 0;
  for (const unit of units) {
    if (exists.get(unit.docId)) {
      skipped++;
      continue;
    }
    let captured: CapturedCall[];
    try {
      captured = await withCaptureConsoleQuiet(() => unit.capture());
    } catch (err) {
      if (err instanceof FrozenSourceUnavailableError) {
        deferredFrozen++;
        console.warn(`defer (frozen source not written yet — submit again after collecting): ${unit.docId}`);
        continue;
      }
      throw err;
    }
    if (captured.length !== unit.callEstimates.length) {
      throw new Error(
        `capture for ${unit.docId} produced ${captured.length} calls but ${unit.callEstimates.length} were expected — refusing to submit a partial unit`,
      );
    }
    const calls = [];
    for (const call of captured) {
      const params = await buildSubmittedParams(call.opts, ctx.cacheTtl, ctx.imageCache);
      calls.push({
        ...call,
        customId: await batchCustomId(unit.docId, call.callKey),
        params,
        paramsHash: await hashMessageParams(params),
      });
    }
    pending.push({ unit, calls });
  }

  if (pending.length === 0) {
    console.log(
      `nothing to submit: ${skipped} unit(s) already written, ${deferredFrozen} deferred (frozen source pending)` +
      (deferredFrozen > 0 ? ' — run --collect, then submit again' : ''),
    );
    return;
  }

  const totals = batchRouteTotals(pending.flatMap((p) => unitRows(p.unit)));
  for (const line of renderBatchPricingLines(totals, ctx.cacheTtl)) console.log(line);
  if (ctx.budgetCapUsd !== null && totals.usd_batch_worst > ctx.budgetCapUsd) {
    throw new Error(
      `submit round worst-case estimate $${totals.usd_batch_worst.toFixed(4)} exceeds budget cap ` +
      `$${ctx.budgetCapUsd.toFixed(2)} — nothing submitted (raise --budget-cap or shrink the batch)`,
    );
  }

  const requests = pending.flatMap((p) => p.calls.map((c) => ({ custom_id: c.customId, params: c.params })));
  const created = await createMessageBatch(ctx.anthropicKey, requests);
  console.log(`submitted message batch ${created.id}: ${requests.length} request(s), status ${created.processing_status}`);

  const submission: BatchSubmissionDoc = {
    kind: BATCH_SUBMISSION_KIND,
    batch_id: ctx.batchId,
    submission_index: prior.submissions.length + 1,
    transport: 'anthropic-batch',
    anthropic_batch_id: created.id,
    cache_ttl: ctx.cacheTtl,
    created_at: new Date().toISOString(),
    operator: ctx.operator,
    app_commit: ctx.appCommit,
    request_count: requests.length,
    est_usd_sync: totals.usd_sync,
    est_usd_batch_worst: totals.usd_batch_worst,
    est_usd_batch_best: totals.usd_batch_best,
    units: pending.flatMap((p) =>
      p.calls.map((c) => ({
        custom_id: c.customId,
        doc_id: p.unit.docId,
        call_key: c.callKey,
        params_hash: c.paramsHash,
      })),
    ),
  };
  try {
    await writeSubmissionDoc(ctx.db, submission);
  } catch (err) {
    console.error(
      `\nSUBMISSION DOC WRITE FAILED after the batch was created. The batch is real and will be billed when it ` +
      `processes. RECOVERY: once it ends, run --collect with --anthropic-batch-id ${created.id} — collect will ` +
      `verify the batch against this config and write the missing submission doc before collecting.\n`,
    );
    throw err;
  }
  console.log(
    `submission ${submission.submission_index} recorded (${submissionDocId(ctx.batchId, submission.submission_index)}) — ` +
    `run --collect once the batch ends (typically well under 24h)` +
    (deferredFrozen > 0 ? `; ${deferredFrozen} unit(s) wait on this round's records and need another submit after that` : ''),
  );
}

/**
 * Registration recovery for a batch whose submission doc write failed:
 * verifies the ended batch's custom_ids all correspond to this config's
 * pending calls, then writes the missing submission doc. Idempotent.
 */
async function registerUnrecordedSubmission(
  ctx: BatchRoundContext,
  units: BatchUnit[],
  anthropicBatchId: string,
  prior: PriorState,
): Promise<boolean> {
  if (prior.submissions.some((s) => s.anthropic_batch_id === anthropicBatchId)) {
    console.log(`batch ${anthropicBatchId} is already recorded — nothing to register`);
    return false;
  }
  const status = await getMessageBatch(ctx.anthropicKey, anthropicBatchId);
  if (status.processing_status !== 'ended') {
    throw new Error(
      `batch ${anthropicBatchId} is still ${status.processing_status} — registration matches results against the ` +
      'config, so wait until it ends and re-run --collect with the same flag',
    );
  }
  const results = await fetchMessageBatchResults(ctx.anthropicKey, anthropicBatchId);

  const matched: BatchSubmissionUnit[] = [];
  const matchedRows: Array<{ modelId: string; est: BatchRouteEstimate }> = [];
  const seen = new Set<string>();
  for (const unit of units) {
    if (await researchRecordExists(ctx.db, unit.docId)) continue;
    let captured: CapturedCall[];
    try {
      captured = await withCaptureConsoleQuiet(() => unit.capture());
    } catch (err) {
      if (err instanceof FrozenSourceUnavailableError) continue;
      throw err;
    }
    for (const call of captured) {
      const customId = await batchCustomId(unit.docId, call.callKey);
      if (!results.has(customId)) continue;
      const params = await buildSubmittedParams(call.opts, ctx.cacheTtl, ctx.imageCache);
      matched.push({ custom_id: customId, doc_id: unit.docId, call_key: call.callKey, params_hash: await hashMessageParams(params) });
      const estEntry = unit.callEstimates.find((c) => c.callKey === call.callKey);
      if (estEntry) matchedRows.push({ modelId: unit.modelId, est: estEntry.est });
      seen.add(customId);
    }
  }
  const unknown = [...results.keys()].filter((id) => !seen.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `batch ${anthropicBatchId} has ${unknown.length} custom_id(s) that do not correspond to this config's pending ` +
      'calls — refusing to register it against this batch_id',
    );
  }
  if (matched.length === 0) throw new Error(`batch ${anthropicBatchId} matched no pending calls — nothing to register`);

  const totals = batchRouteTotals(matchedRows);
  await writeSubmissionDoc(ctx.db, {
    kind: BATCH_SUBMISSION_KIND,
    batch_id: ctx.batchId,
    submission_index: prior.submissions.length + 1,
    transport: 'anthropic-batch',
    anthropic_batch_id: anthropicBatchId,
    cache_ttl: ctx.cacheTtl,
    created_at: new Date().toISOString(),
    operator: ctx.operator,
    app_commit: ctx.appCommit,
    request_count: matched.length,
    est_usd_sync: totals.usd_sync,
    est_usd_batch_worst: totals.usd_batch_worst,
    est_usd_batch_best: totals.usd_batch_best,
    units: matched,
  });
  console.log(`registered previously unrecorded batch ${anthropicBatchId} (${matched.length} calls) — collecting`);
  return true;
}

export interface CollectSummary {
  written: number;
  skipped_existing: number;
  awaiting_submission: number;
  deferred_expired: number;
  still_processing: number;
  sync_fills: number;
  spent_estimate_usd: number;
}

/**
 * COLLECT: attach every ended submission's results to their pending units
 * through the executors, verify request identity by hash first, write
 * records. Never consumes results — a crashed collect re-runs cleanly
 * (results stay retrievable for 29 days; written records are skipped by
 * existence).
 */
export async function collectBatchRound(
  ctx: BatchRoundContext,
  units: BatchUnit[],
  options: { registerAnthropicBatchId?: string } = {},
): Promise<CollectSummary> {
  let prior = await loadPriorState(ctx);
  if (options.registerAnthropicBatchId) {
    const registered = await registerUnrecordedSubmission(ctx, units, options.registerAnthropicBatchId, prior);
    if (registered) prior = await loadPriorState(ctx);
  }
  if (prior.submissions.length === 0) {
    throw new Error(`no submissions recorded for batch ${ctx.batchId} — run --execute --transport batch first`);
  }

  const summary: CollectSummary = {
    written: 0,
    skipped_existing: 0,
    awaiting_submission: 0,
    deferred_expired: 0,
    still_processing: 0,
    sync_fills: 0,
    spent_estimate_usd: 0,
  };

  for (const unit of units) {
    if (await researchRecordExists(ctx.db, unit.docId)) {
      summary.skipped_existing++;
      continue;
    }

    let captured: CapturedCall[];
    try {
      captured = await withCaptureConsoleQuiet(() => unit.capture());
    } catch (err) {
      if (err instanceof FrozenSourceUnavailableError) {
        summary.awaiting_submission++;
        console.log(`awaiting earlier round: ${unit.docId} (frozen source not written yet)`);
        continue;
      }
      throw err;
    }

    const mappings = captured.map((call) => ({
      call,
      mapping: prior.latest.get(callId(unit.docId, call.callKey)) ?? null,
    }));
    if (mappings.some((m) => m.mapping === null)) {
      summary.awaiting_submission++;
      console.log(`not yet submitted: ${unit.docId} — run another submit round`);
      continue;
    }
    const inFlight = mappings.filter(
      (m) => prior.status.get(m.mapping!.submissionIndex)!.processing_status !== 'ended',
    );
    if (inFlight.length > 0) {
      summary.still_processing++;
      continue;
    }

    // Request-identity check BEFORE any result is attached: rebuild the
    // exact params from current inputs; a mismatch means the harness can no
    // longer reproduce what was sent (drifted image bytes, changed code) —
    // hard stop, nothing written for this unit.
    const entries = new Map<string, ReplayEntry>();
    const resultTypes: string[] = [];
    for (const { call, mapping } of mappings) {
      const params = await buildSubmittedParams(call.opts, ctx.cacheTtl, ctx.imageCache);
      const hash = await hashMessageParams(params);
      if (hash !== mapping!.params_hash) {
        throw new Error(
          `request-identity mismatch for ${unit.docId} (${call.callKey}): rebuilt params hash ${hash.slice(0, 12)}… ` +
          `!= submitted ${mapping!.params_hash.slice(0, 12)}… — the inputs changed since submit (e.g. image bytes ` +
          'moved under a stable URL); the stored result describes a request the harness can no longer reproduce, so ' +
          'nothing was written for this unit. Resubmit it in a fresh round or exclude it.',
        );
      }
      const result = prior.results.get(mapping!.submissionIndex)?.get(mapping!.custom_id);
      if (!result) {
        throw new Error(`submission ${mapping!.submissionIndex} results are missing custom_id ${mapping!.custom_id}`);
      }
      resultTypes.push(result.type);
      if (result.type === 'canceled' || result.type === 'expired') {
        entries.set(call.callKey, { kind: 'sync-fill' });
      } else {
        entries.set(call.callKey, { kind: 'result', result });
      }
    }

    // A unit whose EVERY slot went unprocessed re-enters the next submit
    // round at batch prices; a mixed unit (E3 step with some processed
    // candidates) sync-fills the gaps so the paid results aren't discarded.
    if (resultTypes.every((t) => t === 'canceled' || t === 'expired')) {
      summary.deferred_expired++;
      console.log(`defer (batch slot(s) ${resultTypes.join('/')}, unbilled): ${unit.docId} — resubmit in the next round`);
      continue;
    }
    const fills = [...entries.values()].filter((e) => e.kind === 'sync-fill').length;
    if (fills > 0) {
      summary.sync_fills += fills;
      console.warn(`${unit.docId}: ${fills} candidate slot(s) expired in the batch — running them synchronously now`);
    }

    const worst = unitWorstUsd(unit);
    if (ctx.budgetCapUsd !== null && summary.spent_estimate_usd + worst > ctx.budgetCapUsd) {
      throw new Error(
        `budget cap reached during collect: est. $${summary.spent_estimate_usd.toFixed(4)} + next unit ` +
        `$${worst.toFixed(4)} > cap $${ctx.budgetCapUsd.toFixed(2)} — stopping (results keep for 29 days; ` +
        're-run --collect with a raised cap)',
      );
    }

    const { record } = await unit.executeWithReplay(entries);
    record.cost_usd_estimate = worst;
    const usage = batchUsageForRecord(entries, record);
    if (usage) record.usage = usage;
    await writeResearchRecord(ctx.db, record, { docId: unit.docId });
    summary.spent_estimate_usd += worst;
    summary.written++;
    const status = (record.payload as { parse_status?: string }).parse_status ?? '?';
    console.log(`${unit.docId}: ${status} — est. $${worst.toFixed(4)} (batch)`);
  }

  console.log(
    `collect done: ${summary.written} written, ${summary.skipped_existing} already present, ` +
    `${summary.still_processing} still processing, ${summary.awaiting_submission} awaiting a submit round, ` +
    `${summary.deferred_expired} expired/canceled (resubmittable), ${summary.sync_fills} sync-filled call(s), ` +
    `est. spend $${summary.spent_estimate_usd.toFixed(4)}`,
  );
  if (summary.still_processing > 0) {
    for (const sub of prior.submissions) {
      const s = prior.status.get(sub.submission_index)!;
      if (s.processing_status !== 'ended') {
        console.log(
          `  submission ${sub.submission_index} (${sub.anthropic_batch_id}): ${s.processing_status} — ` +
          `${s.request_counts.processing} processing, ${s.request_counts.succeeded} succeeded so far; re-run --collect later`,
        );
      }
    }
  }
  if (summary.awaiting_submission > 0 || summary.deferred_expired > 0) {
    console.log('  next: run --execute --transport batch again to submit the remaining unit(s)');
  }
  return summary;
}
