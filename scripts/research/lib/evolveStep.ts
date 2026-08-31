/**
 * E3 step-mode executor (ruling R2; wired on Iddo's go, 2026-08-31).
 *
 * One evolve_step record = one full generation-step replayed from a frozen
 * state: the state's resolved assignments fire as translation requests
 * through the SAME inner functions the app uses (buildUserMessage, the
 * transports, parseAndRoute → validateAndReturnTwoPass — ruling R6), each
 * candidate's response is kept raw+parsed, ranking scores are computed with
 * the extracted generation lib (src/lib/evolution/generation.ts, #155), and
 * the state's declared criterion selects the winner. Replicating the step N
 * times measures per-step stochasticity with lineage divergence frozen out —
 * the E3 confound fix.
 *
 * Differences from the app's live loop, on purpose:
 *   - candidates run sequentially (rate-friendly; the app fires them in
 *     parallel — call order does not enter any declared measurement);
 *   - a failed candidate stays in the record (raw preserved, no ranking
 *     entry) instead of being dropped from a UI list — failures are data.
 */

import {
  buildUserMessage,
  makeAnthropicCaller,
  makeOpenRouterCaller,
  MAX_TOKENS_TWO_PASS,
  parseAndRoute,
  type CallerOpts,
} from '../../../api/translate-meme.js';
import { parsePromptVersion } from '../../../src/lib/promptVersion.js';
import { PHASE0_ONTOLOGY } from '../../../src/research/ontology.js';
import type {
  CallAttempt,
  DeclaredInfo,
  EvolveCandidateRecord,
  EvolveStepRecord,
  RegimeInfo,
} from '../../../src/research/types';
import type { TranslationPass1, TranslationPass2 } from '../../../src/lib/operators/types';
import type { BatchConfig, BatchModelConfig } from './config';
import { estimateCellCost, type CellCostEstimate } from './costs';
import {
  hashEvolveState,
  scoreStepCandidate,
  selectCandidateByCriterion,
  stateBaseline,
  type FrozenEvolveState,
  type StepTranslationRequest,
} from './evolveState.js';
import { modelKey } from './matrix.js';
import {
  assertAnthropicModelId,
  assembleTwoPassSystemPrompt,
  captureRes,
  makeRecordingCaller,
  pickDescribedRaw,
  providerLabel,
} from './translationCell.js';

export { hashEvolveState };

/** Deterministic Firestore doc id for one step replicate — the resume key.
 *  The state-hash prefix ties the id to the exact frozen conditions. */
export function stepDocId(
  batchId: string,
  stateHash: string,
  model: BatchModelConfig,
  replicateIndex: number,
): string {
  return [
    batchId,
    'E3',
    'evolve_step',
    `state-${stateHash.slice(0, 12)}`,
    `${model.provider}_${modelKey(model.id)}`,
    `r${replicateIndex}`,
  ].join('__');
}

/** Pre-registration block for a step replicate (spec principle 6). */
export function declaredForStep(): DeclaredInfo {
  return {
    fixed: [
      'frozen state (hash covers composition + operator history + assignments + pool content hashes + criterion)',
      'site_context (hash, verified against the state)',
      'translation lexicon (hash, verified against the state)',
      'two-pass prompt file (hash)',
      'model id + routing',
      'max_tokens',
    ],
    varied: [],
    stochastic: [
      'model sampling (temperature unset — provider default)',
      'pipeline parse/validation retry (app behavior, all attempts recorded)',
    ],
    measured: [
      'per-candidate pass1 + pass2 (raw + parsed)',
      'ranking_scores (compression progress per candidate)',
      'selected_candidate (criterion applied to the scores)',
      'parse_status',
      'timing_ms',
    ],
  };
}

/** Whole-step cost estimate: one full two-pass call per assignment. */
export function estimateStepCost(args: {
  modelId: string;
  systemPromptChars: number;
  requests: StepTranslationRequest[];
}): CellCostEstimate {
  let tokensIn = 0;
  let tokensOut = 0;
  let usd = 0;
  let known = true;
  for (const request of args.requests) {
    const userMessage = buildUserMessage(request.memeDescription, request.locationTag, request.engagementLevel);
    const est = estimateCellCost({
      modelId: args.modelId,
      systemPromptChars: args.systemPromptChars,
      userMessageChars: userMessage.length,
      hasImage: Boolean(request.memeImageUrl),
      cellType: 'a', // full two-pass output per candidate
    });
    tokensIn += est.tokens_in;
    tokensOut += est.tokens_out;
    usd += est.usd;
    known = known && est.pricing_known;
  }
  return { tokens_in: tokensIn, tokens_out: tokensOut, usd, pricing_known: known };
}

export interface EvolveStepContext {
  config: BatchConfig;
  regime: RegimeInfo;
  twoPassPromptText: string;
  /** The exact injected string, hash-verified against the state by run.ts. */
  siteContext: string | null;
  siteContextHash: string | null;
  appCommit: string;
  anthropicKey: string | null;
  openRouterKey: string | null;
  state: FrozenEvolveState;
  stateHash: string;
  /** Prebuilt once per batch (pool hashes verified against the corpus). */
  requests: StepTranslationRequest[];
  /** Test-only transport injection; the runner never sets this. */
  transportOverride?: (
    request: StepTranslationRequest,
    opts: CallerOpts,
  ) => (retryMessage?: string) => Promise<string>;
}

export interface EvolveStepResult {
  record: EvolveStepRecord;
  estimate: CellCostEstimate;
  called: boolean;
}

interface ParsedTwoPassBody {
  pass1: TranslationPass1;
  pass2: TranslationPass2;
}

/**
 * Runs one step replicate: every assignment fired once, scored, ranked,
 * selected. Model/pipeline failures land inside the record (failures are
 * data); only harness misconfiguration (missing keys, bad model id) throws.
 */
export async function runEvolveStep(
  ctx: EvolveStepContext,
  model: BatchModelConfig,
  replicateIndex: number,
): Promise<EvolveStepResult> {
  const systemPrompt = assembleTwoPassSystemPrompt(ctx.twoPassPromptText, ctx.siteContext);
  const promptVersion = parsePromptVersion(ctx.twoPassPromptText);
  const baseline = stateBaseline(ctx.state);

  if (!ctx.transportOverride) {
    if (model.provider === 'anthropic') {
      assertAnthropicModelId(model.id);
      if (!ctx.anthropicKey) throw new Error('ANTHROPIC_API_KEY is required for anthropic-routed steps');
    } else if (!ctx.openRouterKey) {
      throw new Error('OPENROUTER_API_KEY is required for openrouter-routed steps');
    }
  }

  const candidateSet: EvolveCandidateRecord[] = [];
  const rankingScores: Record<string, number> = {};
  let modelMsTotal = 0;
  const t0 = Date.now();

  for (const request of ctx.requests) {
    const userMessage = buildUserMessage(request.memeDescription, request.locationTag, request.engagementLevel);
    const callerOpts: CallerOpts = {
      apiKey: '',
      userMessage,
      memeImageUrl: request.memeImageUrl,
      systemPrompt,
      selectedModel: model.id,
      passMode: 'two_pass',
    };

    let transport: (retryMessage?: string) => Promise<string>;
    if (ctx.transportOverride) {
      transport = ctx.transportOverride(request, callerOpts);
    } else if (model.provider === 'anthropic') {
      transport = await makeAnthropicCaller({ ...callerOpts, apiKey: ctx.anthropicKey as string });
    } else {
      transport = makeOpenRouterCaller({ ...callerOpts, apiKey: ctx.openRouterKey as string });
    }

    const attempts: CallAttempt[] = [];
    const caller = makeRecordingCaller(transport, attempts, null);
    const capture = captureRes();
    await parseAndRoute(capture.res, caller, userMessage, 'two_pass', model.id, promptVersion);
    const { status, body } = capture.get();
    modelMsTotal += attempts.reduce((sum, a) => sum + a.timing_ms, 0);

    const errorText = (body as { error?: string } | null)?.error;
    const raw = pickDescribedRaw(attempts, status, errorText);
    const parsed = status === 200 && body && typeof body === 'object' ? (body as ParsedTwoPassBody) : null;

    candidateSet.push({
      meme_id: request.meme_id,
      target_cube: request.target_cube_id,
      response: { raw, parsed },
      attempts,
    });

    if (parsed) {
      rankingScores[String(request.candidate_index)] = scoreStepCandidate({
        state: ctx.state,
        baseline,
        candidateIndex: request.candidate_index,
        targetCubeId: request.target_cube_id,
        memeDescription: request.memeDescription,
        pass2: parsed.pass2,
      });
    }
  }

  const anyOk = Object.keys(rankingScores).length > 0;
  const estimate = estimateStepCost({
    modelId: model.id,
    systemPromptChars: systemPrompt.length,
    requests: ctx.requests,
  });

  const record: EvolveStepRecord = {
    record_id: crypto.randomUUID(),
    batch_id: ctx.config.batch_id,
    experiment: 'E3',
    kind: 'evolve_step',
    replicate_index: replicateIndex,
    created_at: new Date().toISOString(),
    baseline_tag: ctx.config.baseline_tag,
    app_commit: ctx.appCommit,
    regime: ctx.regime,
    model: {
      id: model.id,
      provider: providerLabel(model),
      params: { max_tokens: MAX_TOKENS_TWO_PASS },
    },
    declared: declaredForStep(),
    timing_ms: { total_ms: Date.now() - t0, model_ms_total: modelMsTotal },
    cost_usd_estimate: estimate.usd,
    ontology: PHASE0_ONTOLOGY.evolve_step,
    payload: {
      parent_state_hash: ctx.stateHash,
      generation_index: ctx.state.generation_index,
      candidate_set: candidateSet,
      ranking_scores: rankingScores,
      selection_criterion_id: ctx.state.selection_criterion_id,
      selected_candidate: selectCandidateByCriterion(rankingScores),
      step_input_mode: `frozen:${ctx.stateHash}`,
      parse_status: anyOk ? 'ok' : 'failed',
      failure: anyOk
        ? null
        : {
            stage: 'pipeline',
            message: `all ${ctx.requests.length} candidates failed to parse/validate — per-candidate attempts preserved in candidate_set`,
            http_status: null,
          },
    },
  };

  return { record, estimate, called: true };
}
