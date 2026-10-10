/**
 * E2 translation cell executor.
 *
 * Calls the SAME inner functions the app's serverless handler uses (ruling
 * R6): buildUserMessage / makeAnthropicCaller / makeOpenRouterCaller /
 * parseAndRoute and, through it, validateAndReturnTwoPass — never the Vercel
 * handler export, never UI code paths. Prompt assembly mirrors the handler
 * line-for-line (site-context injection, then lexicon composition); with the
 * default lexicon the composition reproduces the original pre-slot prompt
 * text byte-for-byte (see translationLexicon.default.ts), so the regime is
 * fully identified by the prompt-file hash + the lexicon hash.
 *
 * Cell (c) — frozen Pass 1 (ruling R1, mechanism revised 2026-10-10): the
 * unchanged system prompt is sent, and the stored Pass-1 object (verbatim raw
 * text from the referenced record) is handed back in the USER turn, after the
 * meme message, under a short wrapper asking for Pass 2 only
 * (buildPass1FreezeBlock). The original R1 mechanism — prefilling the
 * assistant turn — is gone: current Claude models reject assistant prefill
 * outright (e2-toy-001, 2026-10-10). The model's reply is recorded verbatim;
 * for parsing and validation only, the harness composes
 * "[" + stored Pass 1 + "," + reply + "]" so the app's parser and two-pass
 * validator run unchanged. Records carry pass1_freeze_method.
 *
 * Every transport round-trip is recorded verbatim (spec principles 1 and 4):
 * the app pipeline's built-in parse/validation retries stay in the record as
 * attempts, never silently absorbed.
 */

import {
  buildUserMessage,
  makeAnthropicCaller,
  makeOpenRouterCaller,
  MAX_TOKENS_TWO_PASS,
  parseAndRoute,
  stripCodeFences,
  type CallerOpts,
} from '../../../api/translate-meme.js';
import { toAnthropicModelId } from '../../../src/lib/models.js';
import type { VercelResponse } from '@vercel/node';
import { composeTranslationPrompt, DEFAULT_TRANSLATION_LEXICON } from '../../../src/prompts/translationLexicon.default.js';
import { parsePromptVersion } from '../../../src/lib/promptVersion.js';
import { mapMemeToCuboidInput } from '../../../src/lib/meme-mapper.js';
import { extractTwoPassRawSlices } from '../../../src/research/jsonSlice.js';
import { PHASE0_ONTOLOGY } from '../../../src/research/ontology.js';
import type {
  CallAttempt,
  ResearchRecord,
  TranslationPayload,
  TranslationRecord,
} from '../../../src/research/types';
import type { BatchConfig } from './config';
import { estimateCellCost, type CellCostEstimate } from './costs';
import type { MatrixCell } from './matrix';

// ---------------------------------------------------------------------------
// Prompt assembly — mirrors api/translate-meme.ts' handler exactly
// ---------------------------------------------------------------------------

export function assembleTwoPassSystemPrompt(
  promptFileText: string,
  siteContext: object | string | null,
): string {
  let systemPrompt = promptFileText;
  if (siteContext) {
    const contextStr = typeof siteContext === 'string'
      ? siteContext
      : JSON.stringify(siteContext, null, 2);
    if (!systemPrompt.includes('{site_context}')) {
      console.warn('Two-pass prompt has no {site_context} placeholder — site context was NOT injected');
    }
    systemPrompt = systemPrompt.replace('{site_context}', contextStr);
  }
  return composeTranslationPrompt(systemPrompt, DEFAULT_TRANSLATION_LEXICON);
}

// ---------------------------------------------------------------------------
// parseAndRoute capture double (the harness has no real VercelResponse)
// ---------------------------------------------------------------------------

export interface CapturedResponse {
  status: number;
  body: unknown;
}

export function captureRes(): { res: VercelResponse; get: () => CapturedResponse } {
  let status = 0;
  let body: unknown = null;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  return { res, get: () => ({ status, body }) };
}

// ---------------------------------------------------------------------------
// Recording caller
// ---------------------------------------------------------------------------

function retryRole(retryMessage: string | undefined, callIndex: number): string {
  if (callIndex === 0 && retryMessage === undefined) return 'initial';
  if (retryMessage && retryMessage.includes('was rejected for this reason')) return 'validation_retry';
  return 'parse_retry';
}

/**
 * Wraps a transport caller: records every round-trip's model text verbatim,
 * and (cell c) hands parseAndRoute the composed two-pass text
 * (composeFrozenTwoPass) instead of the bare Pass-2 reply.
 */
export function makeRecordingCaller(
  transport: (retryMessage?: string) => Promise<string>,
  attempts: CallAttempt[],
  frozenPass1Raw: string | null,
): (retryMessage?: string) => Promise<string> {
  let callIndex = 0;
  return async (retryMessage?: string) => {
    const role = retryRole(retryMessage, callIndex);
    callIndex++;
    const t0 = Date.now();
    try {
      const text = await transport(retryMessage);
      attempts.push({ role, raw_response: text, error: null, timing_ms: Date.now() - t0 });
      return frozenPass1Raw !== null ? composeFrozenTwoPass(frozenPass1Raw, text) : text;
    } catch (err) {
      attempts.push({
        role,
        raw_response: null,
        error: err instanceof Error ? err.message : String(err),
        timing_ms: Date.now() - t0,
      });
      throw err;
    }
  };
}

/**
 * Picks the attempt text the record's final status actually describes, so
 * raw_response / pass slices and `failure` never talk about different
 * attempts. A 422 validation error is kept from the last attempt that PARSED
 * (parseAndRoute quotes the original error even when its corrective retry
 * comes back unparseable); everything else is described by the last response.
 * All attempts stay in `attempts[]` verbatim regardless.
 */
export function pickDescribedRaw(
  attempts: CallAttempt[],
  status: number,
  errorText: string | undefined,
): string | null {
  const raws = attempts
    .map((a) => a.raw_response)
    .filter((r): r is string => r !== null);
  if (raws.length === 0) return null;
  const isValidationFailure = status === 422 && errorText !== 'malformed_response';
  if (isValidationFailure) {
    for (let i = raws.length - 1; i >= 0; i--) {
      try {
        JSON.parse(stripCodeFences(raws[i]));
        return raws[i];
      } catch {
        // keep looking backwards for the attempt the error was raised on
      }
    }
  }
  return raws[raws.length - 1];
}

// ---------------------------------------------------------------------------
// Prefill construction (R1)
// ---------------------------------------------------------------------------

export interface FrozenPass1Source {
  /** record_id of the referenced translation record (→ pass1_input_mode). */
  recordId: string;
  /** Verbatim raw text of the stored Pass-1 object. */
  pass1Raw: string;
}

/**
 * A cell-(c) frozen source that cannot be used right now — the source record
 * is missing, failed, or has no verbatim Pass-1 slice. The runner skips the
 * cell WITHOUT writing (so the append-only dataset isn't burned and a later
 * resume — e.g. after pinning a different record via frozen_pass1_source —
 * can still fill it) instead of aborting the whole batch.
 */
export class FrozenSourceUnavailableError extends Error {}

/**
 * Validates a stored research_records document as a cell-(c) frozen source.
 * Requires parse_status "ok": a record whose pipeline failed may still carry
 * a pass1.raw slice, and R1's point is to freeze a VALIDATED reading — a
 * failed one must be pinned deliberately, never inherited by default.
 */
export function extractFrozenSource(sourceDocId: string, data: unknown): FrozenPass1Source {
  const record = (data ?? {}) as {
    record_id?: string;
    payload?: { pass1?: { raw?: string | null }; parse_status?: string };
  };
  if (record.payload?.parse_status !== 'ok') {
    throw new FrozenSourceUnavailableError(
      `cell (c) frozen source ${sourceDocId} has parse_status "${record.payload?.parse_status ?? 'unknown'}" — ` +
      'only a validated (parse_status "ok") Pass 1 is frozen by default; pin a different record via frozen_pass1_source',
    );
  }
  const pass1Raw = record.payload?.pass1?.raw;
  if (!record.record_id || typeof pass1Raw !== 'string' || pass1Raw.length === 0) {
    throw new FrozenSourceUnavailableError(
      `cell (c) frozen source ${sourceDocId} has no verbatim pass1.raw — R1 requires the stored Pass-1 verbatim; ` +
      'pin a different record via frozen_pass1_source',
    );
  }
  return { recordId: record.record_id, pass1Raw };
}

/** Which mechanism froze Pass 1 on a cell-(c) record (pass1_freeze_method).
 *  Versioned: a changed wrapper text is a new value, never a silent edit. */
export const PASS1_FREEZE_METHOD = 'user_message_v1' as const;

/**
 * The text appended to the user turn for cell (c): a minimal, neutral
 * wrapper around the stored Pass-1 object, which goes in verbatim. Asks for
 * the Pass-2 object only, so the frozen Pass 1 is never re-emitted (and so
 * never altered) by the model.
 */
export function buildPass1FreezeBlock(source: FrozenPass1Source): string {
  return (
    'The Pass 1 output for this meme was produced earlier and is given below, verbatim. ' +
    'Use it as your Pass 1; do not redo it. ' +
    'Produce Pass 2 from it and return only the Pass 2 JSON object, not the array.\n\n' +
    'Pass 1 output:\n' +
    source.pass1Raw
  );
}

/** The user message a cell-(c) request carries: the meme message, a blank
 *  line, then the freeze block. Retries reuse it (parseAndRoute appends its
 *  instructions to the user message it is given), so the frozen Pass 1
 *  survives every attempt. */
export function buildFrozenUserMessage(userMessage: string, source: FrozenPass1Source): string {
  return userMessage + '\n\n' + buildPass1FreezeBlock(source);
}

/**
 * "[" + stored Pass 1 + "," + the model's Pass-2 reply (code fences
 * stripped) + "]" — the two-pass array the app's parser and validator
 * expect. Used only to parse/validate and to cut the pass slices; the
 * record keeps the reply verbatim. A reply that is not a bare Pass-2 object
 * (e.g. the model returned the whole array) fails parse/validation and is
 * recorded as such — failures are data.
 */
export function composeFrozenTwoPass(pass1Raw: string, reply: string): string {
  return '[' + pass1Raw + ',' + stripCodeFences(reply) + ']';
}

// ---------------------------------------------------------------------------
// Cell execution
// ---------------------------------------------------------------------------

export interface TranslationCellContext {
  config: BatchConfig;
  regime: TranslationRecord['regime'];
  twoPassPromptText: string;
  /** Passed to prompt assembly verbatim. The runner passes the exact STRING
   *  it hashed for site_context_hash, so the recorded identity is the bytes
   *  the prompt carried — not a canonicalized cousin of them. */
  siteContext: object | string | null;
  siteContextHash: string | null;
  appCommit: string;
  anthropicKey: string | null;
  openRouterKey: string | null;
  /** Resolves the frozen Pass-1 source for a (c) cell (Firestore lookup in
   *  run.ts; injected fixture in tests). */
  resolveFrozenSource: (cell: MatrixCell) => Promise<FrozenPass1Source>;
  /**
   * Transport injection: when set, replaces the network callers so the full
   * cell path (prompt assembly, Pass-1 freeze, recording, parseAndRoute,
   * validators, record building) runs against a supplied transport. Tests
   * script the model through it, and the batch transport's submit (capture)
   * / collect (replay) phases ride the same seam — that is what guarantees
   * a batch-collected record went through the identical pipeline. The sync
   * execution path never sets this.
   */
  transportOverride?: (
    cell: MatrixCell,
    opts: CallerOpts,
  ) => (retryMessage?: string) => Promise<string>;
}

export interface TranslationCellResult {
  record: TranslationRecord;
  estimate: CellCostEstimate;
  /** True when the model was actually called. */
  called: boolean;
}

/**
 * Explicit routing means the id must survive the transport untouched:
 * makeAnthropicCaller silently substitutes claude-sonnet-4-6 for ids it
 * cannot normalize (app-side safety net) — for research runs that would
 * record one model and call another. Refuse up front instead. Shared by the
 * E2 cell executor and the E3 step executor.
 */
export function assertAnthropicModelId(modelId: string): void {
  const normalized = toAnthropicModelId(modelId);
  if (!normalized.startsWith('claude-')) {
    throw new Error(
      `model ${modelId} is routed anthropic-direct but does not normalize to a claude-* id ` +
      `(got "${normalized}") — the transport would silently substitute its default model; fix the batch config`,
    );
  }
}

export function providerLabel(model: BatchConfig['models'][number]): string {
  if (model.provider === 'anthropic') return 'anthropic';
  const vendor = model.id.includes('/') ? model.id.split('/')[0] : model.id;
  return `openrouter:${vendor}`;
}

function baseEnvelope(
  ctx: TranslationCellContext,
  cell: MatrixCell,
  providerLabel: string,
): Omit<TranslationRecord, 'payload'> {
  return {
    record_id: crypto.randomUUID(),
    batch_id: ctx.config.batch_id,
    experiment: ctx.config.experiment,
    kind: 'translation',
    replicate_index: cell.replicateIndex,
    created_at: new Date().toISOString(),
    baseline_tag: ctx.config.baseline_tag,
    app_commit: ctx.appCommit,
    regime: ctx.regime,
    model: {
      id: cell.model.id,
      provider: providerLabel,
      params: { max_tokens: MAX_TOKENS_TWO_PASS },
    },
    declared: cell.declared,
    timing_ms: {},
    cost_usd_estimate: 0,
    ontology: PHASE0_ONTOLOGY.translation,
  };
}



/**
 * Runs one E2 cell and returns the record to write. Never throws for
 * model/pipeline failures — those come back as parse_status "failed" records
 * (failures are data). Throws only for harness misconfiguration (missing
 * keys, unresolvable frozen source), which the runner surfaces and halts on.
 */
export async function runTranslationCell(
  ctx: TranslationCellContext,
  cell: MatrixCell,
): Promise<TranslationCellResult> {
  const input = mapMemeToCuboidInput(cell.meme.meme);
  const userMessage = buildUserMessage(input.memeDescription, input.locationTag, input.engagementLevel);
  const systemPrompt = assembleTwoPassSystemPrompt(ctx.twoPassPromptText, ctx.siteContext);
  const promptVersion = parsePromptVersion(ctx.twoPassPromptText);
  const provider = providerLabel(cell.model);
  const memeImageUrl = cell.meme.meme.imageUrl || null;

  const payloadBase = {
    meme_id: cell.memeId,
    meme_content_hash: cell.meme.content_hash,
    engagement_at_run: {
      likes: cell.meme.likes_at_read,
      engagement_level: input.engagementLevel,
    },
    composition_ref: ctx.config.composition_ref,
    target_cube: ctx.config.target_cube,
    site_context_hash: ctx.siteContextHash,
    language: ctx.config.language,
  };

  const estimate = estimateCellCost({
    modelId: cell.model.id,
    systemPromptChars: systemPrompt.length,
    userMessageChars: userMessage.length,
    hasImage: Boolean(memeImageUrl),
    cellType: cell.cellType,
  });

  // Cell (c): resolve the frozen source and fold it into the user turn.
  let frozen: FrozenPass1Source | null = null;
  let sentUserMessage = userMessage;
  if (cell.cellType === 'c') {
    frozen = await ctx.resolveFrozenSource(cell);
    sentUserMessage = buildFrozenUserMessage(userMessage, frozen);
  }

  if (cell.model.provider === 'anthropic') {
    assertAnthropicModelId(cell.model.id);
  }

  // Transport per explicit routing — never inferred from which keys exist.
  const callerOpts: CallerOpts = {
    apiKey: '',
    userMessage: sentUserMessage,
    memeImageUrl,
    systemPrompt,
    selectedModel: cell.model.id,
    passMode: 'two_pass',
  };

  let transport: (retryMessage?: string) => Promise<string>;
  if (ctx.transportOverride) {
    transport = ctx.transportOverride(cell, callerOpts);
  } else if (cell.model.provider === 'anthropic') {
    if (!ctx.anthropicKey) throw new Error('ANTHROPIC_API_KEY is required for anthropic-routed cells');
    transport = await makeAnthropicCaller({ ...callerOpts, apiKey: ctx.anthropicKey });
  } else {
    if (!ctx.openRouterKey) throw new Error('OPENROUTER_API_KEY is required for openrouter-routed cells');
    transport = makeOpenRouterCaller({ ...callerOpts, apiKey: ctx.openRouterKey });
  }

  const attempts: CallAttempt[] = [];
  const caller = makeRecordingCaller(transport, attempts, frozen?.pass1Raw ?? null);
  const capture = captureRes();

  const t0 = Date.now();
  await parseAndRoute(capture.res, caller, sentUserMessage, 'two_pass', cell.model.id, promptVersion);
  const totalMs = Date.now() - t0;

  const { status, body } = capture.get();
  const errBody = (body ?? {}) as { error?: string };
  const describedRaw = pickDescribedRaw(attempts, status, errBody.error);
  const slices = describedRaw
    ? extractTwoPassRawSlices(
        frozen ? composeFrozenTwoPass(frozen.pass1Raw, describedRaw) : stripCodeFences(describedRaw),
      )
    : { pass1: null, pass2: null };

  let payload: TranslationPayload;
  const shared = {
    ...payloadBase,
    pass1_input_mode: (frozen ? `frozen:${frozen.recordId}` : 'live') as TranslationPayload['pass1_input_mode'],
    // The assistant-prefill mechanism is retired; kept false/null so the
    // schema stays one shape across old and new records.
    prefill: false,
    prefill_content_hash: null,
    ...(frozen ? { pass1_freeze_method: PASS1_FREEZE_METHOD } : {}),
    raw_response: describedRaw,
    attempts,
  };

  if (status === 200 && body && typeof body === 'object') {
    const ok = body as { pass1: TranslationPayload['pass1']['parsed']; pass2: TranslationPayload['pass2']['parsed'] };
    payload = {
      ...shared,
      pass1: { raw: slices.pass1, parsed: ok.pass1 },
      pass2: { raw: slices.pass2, parsed: ok.pass2 },
      parse_status: 'ok',
      failure: null,
    };
  } else {
    const stage = status === 500 ? 'transport' : errBody.error === 'malformed_response' ? 'parse' : 'validation';
    payload = {
      ...shared,
      pass1: { raw: slices.pass1, parsed: null },
      pass2: { raw: slices.pass2, parsed: null },
      parse_status: 'failed',
      failure: {
        stage,
        message: errBody.error ?? `unexpected status ${status}`,
        http_status: status || null,
      },
    };
  }

  const record: TranslationRecord = {
    ...baseEnvelope(ctx, cell, provider),
    payload,
  };
  record.timing_ms = {
    total_ms: totalMs,
    model_ms_total: attempts.reduce((sum, a) => sum + a.timing_ms, 0),
  };
  record.cost_usd_estimate = estimate.usd;

  return { record, estimate, called: true };
}

export type { ResearchRecord };
export { buildUserMessage };
