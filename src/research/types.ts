/**
 * research_records — envelope + payload types for Phase 0
 * (phase0-baseline-spec.md v0.2, 2026-08-14; Step 3 rulings 2026-08-30).
 *
 * One provenance envelope shared by all records; four payload kinds
 * (encode / translation / evolve_step / judgment). The schema is designed to
 * span Phases 1–2 unchanged: nothing in the envelope names memes or cuboids.
 *
 * Two spec-internal resolutions, both flagged in the build report:
 *   - `raw_response` / `attempts` on model-call payloads: principle 1
 *     ("records store raw model output verbatim") and principle 4 ("failures
 *     are data … never silently retried out of the dataset") require the
 *     verbatim response text of every attempt, including the app pipeline's
 *     built-in parse/validation retries. The per-pass raw fields alone cannot
 *     reconstruct the wire text of a one-call two-pass response.
 *   - `prefill` fields on the translation payload are ruled additions
 *     (R1: record `prefill: true` and the prefill's content hash;
 *     `prefill_supported: false` when a probed provider cannot prefill).
 */

import type { TranslationPass1, TranslationPass2 } from '../lib/operators/types';
import type { RecordOntology, ResearchKind } from './ontology';

export type { ResearchKind };

export type Experiment = 'E1' | 'E2' | 'E3';

/** Firestore collection names (append-only; see firestore.rules). */
export const RESEARCH_RECORDS_COLLECTION = 'research_records';
export const RESEARCH_BATCHES_COLLECTION = 'research_batches';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface RegimeInfo {
  /** sha256 of each raw prompt file, keyed per pass/stage
   *  (Phase 0: "two_pass" for the v2 translation prompt, "encode" for the
   *  spatial-encoding grammar). Hash of the file bytes, before slot filling. */
  prompt_hashes: Record<string, string>;
  /** "# version" header as stamped by parsePromptVersion — a label, not an
   *  identity; the hashes are the identity (spec principle 2). */
  prompt_version_declared: string | null;
  /** "# version" header of spatial-encoding-grammar.md (same parser). */
  grammar_version_declared: string | null;
  /** sha256 of the deterministic (key-sorted) serialization of each lexicon. */
  spatial_lexicon_hash: string;
  translation_lexicon_hash: string;
}

export interface ModelInfo {
  /** As sent to the transport (OpenRouter-style or Anthropic-native id). */
  id: string;
  /** "anthropic" (direct) or "openrouter:<model vendor>" per spec. */
  provider: string;
  /** Request params actually set (e.g. max_tokens). Temperature is NOT set by
   *  the shipped pipeline — absent here means provider default, which is a
   *  declared stochastic factor, not an omission. */
  params: Record<string, unknown>;
}

/** Pre-registration vocabulary (spec principle 6, Iddo 2026-08-14). */
export interface DeclaredInfo {
  fixed: string[];
  varied: string[];
  stochastic: string[];
  measured: string[];
}

/**
 * Real token usage as billed by the API, when the transport surfaces it
 * (approved 2026-09-04 as an ADDITIVE, optional envelope field — the one
 * sanctioned schema change; everything else predates it unchanged).
 *
 * Only batch-collected records carry this today: the sync transports
 * (api/translate-meme.ts, app code) discard the API's usage object, and a
 * record's sync-run calls — including collect-time parse/validation retries
 * and sync-filled expired slots — therefore report none. calls_covered /
 * calls_total make that partial coverage explicit instead of letting a
 * summed number quietly understate what a record's calls consumed.
 */
export interface UsageInfo {
  /** Which transport reported the numbers (currently "anthropic-batch"). */
  source: string;
  /** Summed verbatim over the covered calls' API usage objects. */
  input_tokens: number;
  output_tokens: number;
  /** Cache counters as reported; 0 where the API omits them. */
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  /** Calls with reported usage vs every transport call the record made
   *  (all attempts; for evolve_step, summed over candidates). */
  calls_covered: number;
  calls_total: number;
}

export interface ResearchEnvelope {
  record_id: string;
  batch_id: string;
  experiment: Experiment;
  kind: ResearchKind;
  replicate_index: number;
  created_at: string; // ISO 8601
  /** e.g. "BASELINE-1" once the freeze happens. The freeze is a separate,
   *  human-initiated step — this scaffold never writes a BASELINE tag. */
  baseline_tag: string;
  app_commit: string; // git sha
  regime: RegimeInfo;
  /** null only for judgment records (a human ruling has no model). */
  model: ModelInfo | null;
  declared: DeclaredInfo;
  timing_ms: Record<string, number>;
  cost_usd_estimate: number;
  /** Real billed token counts when the transport reports them (see
   *  UsageInfo). Optional and additive (2026-09-04 approval): absent on all
   *  earlier records and on sync-transport records. */
  usage?: UsageInfo;
  /** v6 system-section ids (ruling R3). Optional in the shared type so other
   *  writers and Phases 1–2 are not broken; required on every record written
   *  by this implementation. */
  ontology?: RecordOntology;
}

// ---------------------------------------------------------------------------
// Payload building blocks
// ---------------------------------------------------------------------------

export type ParseStatus = 'ok' | 'failed';

/** Full failure context (spec principle 4 — failures are data). */
export interface FailureInfo {
  /** Where it failed: "transport" | "parse" | "validation" | "harness". */
  stage: string;
  message: string;
  /** HTTP status of the API-shaped result when one exists (422/500). */
  http_status: number | null;
}

/** Raw model text alongside its parsed form (spec principle 1). */
export interface RawParsed<T> {
  /** Verbatim text. For the one-call two-pass response, each pass's raw is
   *  the exact character span of that pass's object inside the full response
   *  (see jsonSlice.ts) — the span cell (c) prefills verbatim per R1. */
  raw: string | null;
  parsed: T | null;
}

/** One transport round-trip, in call order. The app pipeline retries once on
 *  a parse failure and once on a validation failure; every attempt is kept. */
export interface CallAttempt {
  /** "initial" | "parse_retry" | "validation_retry" | "probe". */
  role: string;
  raw_response: string | null;
  /** Transport error text when the call itself threw (timeout, 5xx…). */
  error: string | null;
  timing_ms: number;
}

// ---------------------------------------------------------------------------
// Payload kinds
// ---------------------------------------------------------------------------

export interface EncodePayload {
  /** sha256 of each input image's bytes, primary first. */
  image_hashes: string[];
  site_context_hash: string | null;
  language: string | null;
  raw_response: string | null;
  attempts: CallAttempt[];
  reading: unknown | null;
  reasoning: string | null;
  proposed_composition: unknown | null;
  parse_status: ParseStatus;
  failure: FailureInfo | null;
}

export interface EngagementAtRun {
  likes: number;
  /** 0–100, likesToEngagement's log scale — the value the prompt received. */
  engagement_level: number;
}

export type Pass1InputMode = 'live' | `frozen:${string}`;
export type StepInputMode = 'campaign' | `frozen:${string}`;

export interface TranslationPayload {
  meme_id: string;
  /** sha256 over the meme document's stored wire fields — what is actually
   *  on the wire, not the declared type (see hashMemeContent in hashing.ts:
   *  fields actually present in the doc, minus mutable state; ghost fields
   *  topText/bottomText/userId are covered only when a legacy doc really
   *  stores them). */
  meme_content_hash: string;
  engagement_at_run: EngagementAtRun;
  /** Reference to the composition the translation runs against (recorded
   *  context — the shipped translate request does not carry the composition). */
  composition_ref: string | null;
  target_cube: string | null;
  site_context_hash: string | null;
  language: string | null;
  /** "live", or "frozen:<record_id>" for E2 cell (c) — ruling R1. */
  pass1_input_mode: Pass1InputMode;
  /** R1: true when the assistant turn was prefilled with a stored Pass 1. */
  prefill: boolean;
  /** sha256 of the exact prefill text sent (null when prefill is false). */
  prefill_content_hash: string | null;
  /** Set (false) only when a per-model probe found the provider cannot
   *  prefill and cell (c) was skipped for that model — ruling R1. */
  prefill_supported?: boolean;
  raw_response: string | null;
  attempts: CallAttempt[];
  pass1: RawParsed<TranslationPass1>;
  pass2: RawParsed<TranslationPass2>;
  parse_status: ParseStatus;
  failure: FailureInfo | null;
}

export interface EvolveCandidateRecord {
  meme_id: string;
  target_cube: string;
  response: RawParsed<unknown>;
  /** Every transport round-trip for this candidate, verbatim — same
   *  principle-1/-4 grounds as the translation payload's attempts. */
  attempts?: CallAttempt[];
}

export interface EvolveStepPayload {
  /** sha256 of the serialized state the step's requests are built from
   *  (ruling R2 — state replay, not a prompt change). */
  parent_state_hash: string;
  generation_index: number;
  candidate_set: EvolveCandidateRecord[];
  ranking_scores: Record<string, number>;
  selection_criterion_id: string;
  selected_candidate: string | null;
  step_input_mode: StepInputMode;
  parse_status: ParseStatus;
  failure: FailureInfo | null;
}

/** Always a separate record, never a field edited onto a system record
 *  (spec principle 7). */
export interface JudgmentPayload {
  judge_id: string;
  presented_record_ids: string[];
  anonymized: boolean;
  ruling: string;
  stated_reason: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export type ResearchPayload =
  | EncodePayload
  | TranslationPayload
  | EvolveStepPayload
  | JudgmentPayload;

export interface ResearchRecord extends ResearchEnvelope {
  payload: ResearchPayload;
}

export interface EncodeRecord extends ResearchEnvelope {
  kind: 'encode';
  payload: EncodePayload;
}
export interface TranslationRecord extends ResearchEnvelope {
  kind: 'translation';
  payload: TranslationPayload;
}
export interface EvolveStepRecord extends ResearchEnvelope {
  kind: 'evolve_step';
  payload: EvolveStepPayload;
}
export interface JudgmentRecord extends ResearchEnvelope {
  kind: 'judgment';
  payload: JudgmentPayload;
}
