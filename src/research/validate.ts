/**
 * Schema validation for research_records.
 *
 * Hand-rolled in the same idiom as api/translate-meme.ts' validators: precise
 * error strings, no schema library. The contract (handoff, Milestone 1):
 *   - a schema-invalid ENVELOPE throws at the write path;
 *   - an invalid PAYLOAD is still written, coerced to parse_status "failed"
 *     with the original payload preserved verbatim (failures are data).
 */

import { isValidOntology } from './ontology';
import type {
  DeclaredInfo,
  EncodePayload,
  EvolveStepPayload,
  JudgmentPayload,
  ResearchEnvelope,
  ResearchKind,
  TranslationPayload,
} from './types';

const EXPERIMENTS = ['E1', 'E2', 'E3'] as const;
const KINDS: ResearchKind[] = ['encode', 'translation', 'evolve_step', 'judgment'];
const PARSE_STATUSES = ['ok', 'failed'] as const;

const isString = (v: unknown): v is string => typeof v === 'string';
const isNonEmptyString = (v: unknown): v is string => isString(v) && v.length > 0;
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function declaredError(declared: unknown): string | null {
  if (!isPlainObject(declared)) return 'declared must be an object';
  for (const key of ['fixed', 'varied', 'stochastic', 'measured'] as (keyof DeclaredInfo)[]) {
    if (!isStringArray((declared as Record<string, unknown>)[key])) {
      return `declared.${key} must be a string array`;
    }
  }
  return null;
}

/**
 * Returns null when the envelope is valid, else a precise error message.
 * Ontology is optional in the shared type (R3), but when present it must use
 * only the v6 ids.
 */
export function validateEnvelope(env: unknown): string | null {
  if (!isPlainObject(env)) return 'envelope must be an object';
  const e = env as Partial<ResearchEnvelope> & Record<string, unknown>;

  if (!isNonEmptyString(e.record_id)) return 'record_id must be a non-empty string';
  if (!isNonEmptyString(e.batch_id)) return 'batch_id must be a non-empty string';
  if (!EXPERIMENTS.includes(e.experiment as never)) {
    return `experiment must be one of ${EXPERIMENTS.join(', ')}`;
  }
  if (!KINDS.includes(e.kind as never)) {
    return `kind must be one of ${KINDS.join(', ')}`;
  }
  if (!isFiniteNumber(e.replicate_index) || e.replicate_index < 0 || !Number.isInteger(e.replicate_index)) {
    return 'replicate_index must be a non-negative integer';
  }
  if (!isNonEmptyString(e.created_at) || Number.isNaN(Date.parse(e.created_at))) {
    return 'created_at must be an ISO 8601 date string';
  }
  if (!isNonEmptyString(e.baseline_tag)) return 'baseline_tag must be a non-empty string';
  if (!isNonEmptyString(e.app_commit)) return 'app_commit must be a non-empty string';

  if (!isPlainObject(e.regime)) return 'regime must be an object';
  const r = e.regime as Record<string, unknown>;
  if (!isPlainObject(r.prompt_hashes) || !Object.values(r.prompt_hashes).every(isNonEmptyString)) {
    return 'regime.prompt_hashes must be an object of non-empty strings';
  }
  if (!(r.prompt_version_declared === null || isString(r.prompt_version_declared))) {
    return 'regime.prompt_version_declared must be a string or null';
  }
  if (!(r.grammar_version_declared === null || isString(r.grammar_version_declared))) {
    return 'regime.grammar_version_declared must be a string or null';
  }
  if (!isNonEmptyString(r.spatial_lexicon_hash)) return 'regime.spatial_lexicon_hash must be a non-empty string';
  if (!isNonEmptyString(r.translation_lexicon_hash)) return 'regime.translation_lexicon_hash must be a non-empty string';

  if (e.kind === 'judgment') {
    if (e.model !== null && e.model !== undefined) {
      if (!isPlainObject(e.model)) return 'model must be an object or null';
    }
  } else {
    if (!isPlainObject(e.model)) return 'model must be an object (null is allowed only on judgment records)';
  }
  if (isPlainObject(e.model)) {
    const m = e.model as Record<string, unknown>;
    if (!isNonEmptyString(m.id)) return 'model.id must be a non-empty string';
    if (!isNonEmptyString(m.provider)) return 'model.provider must be a non-empty string';
    if (m.provider !== 'anthropic' && !m.provider.startsWith('openrouter:')) {
      return 'model.provider must be "anthropic" or "openrouter:<name>"';
    }
    if (!isPlainObject(m.params)) return 'model.params must be an object';
  }

  const dErr = declaredError(e.declared);
  if (dErr) return dErr;

  if (!isPlainObject(e.timing_ms) || !Object.values(e.timing_ms).every(isFiniteNumber)) {
    return 'timing_ms must be an object of finite numbers';
  }
  if (!isFiniteNumber(e.cost_usd_estimate) || e.cost_usd_estimate < 0) {
    return 'cost_usd_estimate must be a non-negative number';
  }

  if (e.ontology !== undefined && !isValidOntology(e.ontology)) {
    return 'ontology must use only stage/band/actor/deliverer ids from poetiks_system_section_data_v6.json (or null per field)';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Payload validation (per kind)
// ---------------------------------------------------------------------------

function failureError(failure: unknown): string | null {
  if (failure === null) return null;
  if (!isPlainObject(failure)) return 'failure must be an object or null';
  const f = failure as Record<string, unknown>;
  if (!isNonEmptyString(f.stage)) return 'failure.stage must be a non-empty string';
  if (!isString(f.message)) return 'failure.message must be a string';
  if (!(f.http_status === null || isFiniteNumber(f.http_status))) {
    return 'failure.http_status must be a number or null';
  }
  return null;
}

function parseStatusError(payload: Record<string, unknown>): string | null {
  if (!PARSE_STATUSES.includes(payload.parse_status as never)) {
    return `parse_status must be one of ${PARSE_STATUSES.join(', ')}`;
  }
  return failureError(payload.failure);
}

function attemptsError(attempts: unknown): string | null {
  if (!Array.isArray(attempts)) return 'attempts must be an array';
  for (const a of attempts) {
    if (!isPlainObject(a)) return 'each attempt must be an object';
    if (!isNonEmptyString(a.role)) return 'attempt.role must be a non-empty string';
    if (!(a.raw_response === null || isString(a.raw_response))) return 'attempt.raw_response must be a string or null';
    if (!(a.error === null || isString(a.error))) return 'attempt.error must be a string or null';
    if (!isFiniteNumber(a.timing_ms)) return 'attempt.timing_ms must be a number';
  }
  return null;
}

function rawParsedError(v: unknown, label: string): string | null {
  if (!isPlainObject(v)) return `${label} must be an object { raw, parsed }`;
  const rp = v as Record<string, unknown>;
  if (!(rp.raw === null || isString(rp.raw))) return `${label}.raw must be a string or null`;
  if (!('parsed' in rp)) return `${label}.parsed is required (null when unparsed)`;
  return null;
}

function validateEncodePayload(p: Record<string, unknown>): string | null {
  if (!isStringArray(p.image_hashes)) return 'image_hashes must be a string array';
  if (!(p.site_context_hash === null || isNonEmptyString(p.site_context_hash))) {
    return 'site_context_hash must be a non-empty string or null';
  }
  if (!(p.language === null || isString(p.language))) return 'language must be a string or null';
  if (!(p.raw_response === null || isString(p.raw_response))) return 'raw_response must be a string or null';
  const aErr = attemptsError(p.attempts);
  if (aErr) return aErr;
  if (!('reading' in p) || !('reasoning' in p) || !('proposed_composition' in p)) {
    return 'reading, reasoning and proposed_composition are required (null when absent)';
  }
  return parseStatusError(p);
}

function validateTranslationPayload(p: Record<string, unknown>): string | null {
  if (!isNonEmptyString(p.meme_id)) return 'meme_id must be a non-empty string';
  if (!isNonEmptyString(p.meme_content_hash)) return 'meme_content_hash must be a non-empty string';
  if (!isPlainObject(p.engagement_at_run)) return 'engagement_at_run must be an object';
  const eng = p.engagement_at_run as Record<string, unknown>;
  if (!isFiniteNumber(eng.likes)) return 'engagement_at_run.likes must be a number';
  if (!isFiniteNumber(eng.engagement_level) || eng.engagement_level < 0 || eng.engagement_level > 100) {
    return 'engagement_at_run.engagement_level must be a number in [0, 100]';
  }
  if (!(p.composition_ref === null || isString(p.composition_ref))) return 'composition_ref must be a string or null';
  if (!(p.target_cube === null || isString(p.target_cube))) return 'target_cube must be a string or null';
  if (!(p.site_context_hash === null || isNonEmptyString(p.site_context_hash))) {
    return 'site_context_hash must be a non-empty string or null';
  }
  if (!(p.language === null || isString(p.language))) return 'language must be a string or null';
  if (!(p.pass1_input_mode === 'live'
      || (isString(p.pass1_input_mode) && p.pass1_input_mode.startsWith('frozen:') && p.pass1_input_mode.length > 'frozen:'.length))) {
    return 'pass1_input_mode must be "live" or "frozen:<record_id>"';
  }
  if (typeof p.prefill !== 'boolean') return 'prefill must be a boolean';
  if (p.prefill && !isNonEmptyString(p.prefill_content_hash)) {
    return 'prefill_content_hash is required when prefill is true';
  }
  if (!p.prefill && p.prefill_content_hash !== null) {
    return 'prefill_content_hash must be null when prefill is false';
  }
  if (p.prefill_supported !== undefined && typeof p.prefill_supported !== 'boolean') {
    return 'prefill_supported must be a boolean when present';
  }
  if (!(p.raw_response === null || isString(p.raw_response))) return 'raw_response must be a string or null';
  const aErr = attemptsError(p.attempts);
  if (aErr) return aErr;
  const p1Err = rawParsedError(p.pass1, 'pass1');
  if (p1Err) return p1Err;
  const p2Err = rawParsedError(p.pass2, 'pass2');
  if (p2Err) return p2Err;
  return parseStatusError(p);
}

function validateEvolveStepPayload(p: Record<string, unknown>): string | null {
  if (!isNonEmptyString(p.parent_state_hash)) return 'parent_state_hash must be a non-empty string';
  if (!isFiniteNumber(p.generation_index) || !Number.isInteger(p.generation_index) || p.generation_index < 0) {
    return 'generation_index must be a non-negative integer';
  }
  if (!Array.isArray(p.candidate_set)) return 'candidate_set must be an array';
  for (const c of p.candidate_set) {
    if (!isPlainObject(c)) return 'each candidate must be an object';
    if (!isNonEmptyString(c.meme_id)) return 'candidate.meme_id must be a non-empty string';
    if (!isNonEmptyString(c.target_cube)) return 'candidate.target_cube must be a non-empty string';
    const rpErr = rawParsedError(c.response, 'candidate.response');
    if (rpErr) return rpErr;
    if (c.attempts !== undefined) {
      const aErr = attemptsError(c.attempts);
      if (aErr) return `candidate.${aErr}`;
    }
  }
  if (!isPlainObject(p.ranking_scores) || !Object.values(p.ranking_scores).every(isFiniteNumber)) {
    return 'ranking_scores must be an object of numbers';
  }
  if (!isNonEmptyString(p.selection_criterion_id)) return 'selection_criterion_id must be a non-empty string';
  if (!(p.selected_candidate === null || isString(p.selected_candidate))) {
    return 'selected_candidate must be a string or null';
  }
  if (!(p.step_input_mode === 'campaign'
      || (isString(p.step_input_mode) && p.step_input_mode.startsWith('frozen:') && p.step_input_mode.length > 'frozen:'.length))) {
    return 'step_input_mode must be "campaign" or "frozen:<state_hash>"';
  }
  return parseStatusError(p);
}

function validateJudgmentPayload(p: Record<string, unknown>): string | null {
  if (!isNonEmptyString(p.judge_id)) return 'judge_id must be a non-empty string';
  if (!isStringArray(p.presented_record_ids) || p.presented_record_ids.length === 0) {
    return 'presented_record_ids must be a non-empty string array';
  }
  if (typeof p.anonymized !== 'boolean') return 'anonymized must be a boolean';
  if (!isNonEmptyString(p.ruling)) return 'ruling must be a non-empty string';
  if (!isString(p.stated_reason)) return 'stated_reason must be a string';
  if (!isNonEmptyString(p.timestamp) || Number.isNaN(Date.parse(p.timestamp))) {
    return 'timestamp must be an ISO 8601 date string';
  }
  return null;
}

/** Returns null when the payload matches its kind's schema, else an error. */
export function validatePayload(kind: ResearchKind, payload: unknown): string | null {
  if (!isPlainObject(payload)) return 'payload must be an object';
  const p = payload as Record<string, unknown>;
  switch (kind) {
    case 'encode':
      return validateEncodePayload(p);
    case 'translation':
      return validateTranslationPayload(p);
    case 'evolve_step':
      return validateEvolveStepPayload(p);
    case 'judgment':
      return validateJudgmentPayload(p);
  }
}

// Re-export payload types so callers can narrow after validation.
export type { EncodePayload, TranslationPayload, EvolveStepPayload, JudgmentPayload };
