import { describe, expect, it } from 'vitest';
import { PHASE0_ONTOLOGY, isValidOntology } from './ontology';
import type {
  EncodePayload,
  EvolveStepPayload,
  JudgmentPayload,
  ResearchEnvelope,
  ResearchRecord,
  TranslationPayload,
} from './types';
import { validateEnvelope, validatePayload } from './validate';
import { prepareResearchRecord } from './writeResearchRecord';

// ---------------------------------------------------------------------------
// Fixtures — one valid envelope + one valid payload per kind (DoD b, f)
// ---------------------------------------------------------------------------

const envelope = (overrides: Partial<ResearchEnvelope> = {}): ResearchEnvelope => ({
  record_id: 'a2f0c9c8-6a1e-4a5f-9b3c-1d2e3f405060',
  batch_id: 'e2-toy-000',
  experiment: 'E2',
  kind: 'translation',
  replicate_index: 0,
  created_at: '2026-08-30T12:00:00.000Z',
  baseline_tag: 'SCAFFOLD-TOY',
  app_commit: 'a4fe78a36dd254c858d61d1ae3126d8279e9919e',
  regime: {
    prompt_hashes: { two_pass: 'f'.repeat(64), encode: 'e'.repeat(64) },
    prompt_version_declared: '4',
    grammar_version_declared: '5',
    spatial_lexicon_hash: 'a'.repeat(64),
    translation_lexicon_hash: 'b'.repeat(64),
  },
  model: {
    id: 'anthropic/claude-sonnet-4.6',
    provider: 'anthropic',
    params: { max_tokens: 4096 },
  },
  declared: { fixed: ['meme'], varied: [], stochastic: ['sampling'], measured: ['pass2.operator'] },
  timing_ms: { total_ms: 4200 },
  cost_usd_estimate: 0.021,
  ontology: PHASE0_ONTOLOGY.translation,
  ...overrides,
});

const translationPayload = (): TranslationPayload => ({
  meme_id: 'meme-toy-0001-current',
  meme_content_hash: 'c'.repeat(64),
  engagement_at_run: { likes: 12, engagement_level: 48 },
  composition_ref: null,
  target_cube: null,
  site_context_hash: null,
  language: null,
  pass1_input_mode: 'live',
  prefill: false,
  prefill_content_hash: null,
  raw_response: '[{"pass":1},{"pass":2}]',
  attempts: [{ role: 'initial', raw_response: '[{"pass":1},{"pass":2}]', error: null, timing_ms: 4100 }],
  pass1: { raw: '{"pass":1}', parsed: null },
  pass2: { raw: '{"pass":2}', parsed: null },
  parse_status: 'ok',
  failure: null,
});

const encodePayload = (): EncodePayload => ({
  image_hashes: ['d'.repeat(64)],
  site_context_hash: null,
  language: null,
  raw_response: '{"cubes":[]}',
  attempts: [{ role: 'initial', raw_response: '{"cubes":[]}', error: null, timing_ms: 900 }],
  reading: null,
  reasoning: 'reasoning text',
  proposed_composition: { cubes: [] },
  parse_status: 'ok',
  failure: null,
});

const evolveStepPayload = (): EvolveStepPayload => ({
  parent_state_hash: 'e'.repeat(64),
  generation_index: 3,
  candidate_set: [
    { meme_id: 'meme-toy-0001-current', target_cube: 'cube-1', response: { raw: '[]', parsed: null } },
  ],
  ranking_scores: { 'cube-1': 0.42 },
  selection_criterion_id: 'least-compressed',
  selected_candidate: 'cube-1',
  step_input_mode: `frozen:${'e'.repeat(64)}`,
  parse_status: 'ok',
  failure: null,
});

const judgmentPayload = (): JudgmentPayload => ({
  judge_id: 'iddo',
  presented_record_ids: ['a2f0c9c8-6a1e-4a5f-9b3c-1d2e3f405060'],
  anonymized: true,
  ruling: 'continue with replicate 2',
  stated_reason: 'clearest site resonance',
  timestamp: '2026-08-30T13:00:00.000Z',
});

// ---------------------------------------------------------------------------

describe('validateEnvelope', () => {
  it('accepts a valid envelope', () => {
    expect(validateEnvelope(envelope())).toBeNull();
  });

  it('accepts a judgment envelope with model: null', () => {
    expect(validateEnvelope(envelope({ kind: 'judgment', model: null }))).toBeNull();
  });

  it('rejects model: null on non-judgment kinds', () => {
    expect(validateEnvelope(envelope({ model: null }))).toContain('model');
  });

  it('rejects a bad experiment / kind / replicate_index', () => {
    expect(validateEnvelope(envelope({ experiment: 'E9' as never }))).toContain('experiment');
    expect(validateEnvelope(envelope({ kind: 'oops' as never }))).toContain('kind');
    expect(validateEnvelope(envelope({ replicate_index: -1 }))).toContain('replicate_index');
    expect(validateEnvelope(envelope({ replicate_index: 1.5 }))).toContain('replicate_index');
  });

  it('rejects a provider outside the spec vocabulary', () => {
    const bad = envelope();
    bad.model = { ...bad.model!, provider: 'openai' };
    expect(validateEnvelope(bad)).toContain('provider');
  });

  it('rejects an ontology with an invented id (R3: never invent ids)', () => {
    const bad = envelope({ ontology: { stage: 'transcode', band: 'llm', actor: 'llm', deliverer: 'architect' } as never });
    expect(validateEnvelope(bad)).toContain('ontology');
  });

  it('accepts null ontology fields (a record that does not fit)', () => {
    expect(validateEnvelope(envelope({ ontology: { stage: null, band: null, actor: null, deliverer: null } }))).toBeNull();
  });

  it('rejects declared blocks that are not string arrays', () => {
    expect(validateEnvelope(envelope({ declared: { fixed: [1], varied: [], stochastic: [], measured: [] } as never }))).toContain('declared');
  });

  it('usage is optional and additive (2026-09-04 approval): absent stays valid, present validates', () => {
    expect(validateEnvelope(envelope())).toBeNull(); // no usage — every earlier record
    const usage = {
      source: 'anthropic-batch',
      input_tokens: 5100,
      output_tokens: 1180,
      cache_creation_input_tokens: 1100,
      cache_read_input_tokens: 0,
      calls_covered: 1,
      calls_total: 2,
    };
    expect(validateEnvelope(envelope({ usage }))).toBeNull();
  });

  it('rejects malformed usage blocks', () => {
    const usage = {
      source: 'anthropic-batch',
      input_tokens: 5100,
      output_tokens: 1180,
      cache_creation_input_tokens: 1100,
      cache_read_input_tokens: 0,
      calls_covered: 1,
      calls_total: 1,
    };
    expect(validateEnvelope(envelope({ usage: 'lots' as never }))).toContain('usage');
    expect(validateEnvelope(envelope({ usage: { ...usage, source: '' } }))).toContain('usage.source');
    expect(validateEnvelope(envelope({ usage: { ...usage, input_tokens: -1 } }))).toContain('usage.input_tokens');
    expect(validateEnvelope(envelope({ usage: { ...usage, output_tokens: 1.5 } }))).toContain('usage.output_tokens');
    // A block with no covered calls is meaningless — the writer omits it instead.
    expect(validateEnvelope(envelope({ usage: { ...usage, calls_covered: 0 } }))).toContain('usage.calls_covered');
    expect(validateEnvelope(envelope({ usage: { ...usage, calls_covered: 3, calls_total: 2 } }))).toContain('usage.calls_total');
  });
});

describe('validatePayload — accepts all four kinds (DoD b)', () => {
  it('translation', () => expect(validatePayload('translation', translationPayload())).toBeNull());
  it('encode', () => expect(validatePayload('encode', encodePayload())).toBeNull());
  it('evolve_step', () => expect(validatePayload('evolve_step', evolveStepPayload())).toBeNull());
  it('judgment', () => expect(validatePayload('judgment', judgmentPayload())).toBeNull());

  it('accepts a failed translation with raw preserved (failures are data)', () => {
    const failed: TranslationPayload = {
      ...translationPayload(),
      pass1: { raw: null, parsed: null },
      pass2: { raw: null, parsed: null },
      parse_status: 'failed',
      failure: { stage: 'parse', message: 'malformed_response', http_status: 422 },
    };
    expect(validatePayload('translation', failed)).toBeNull();
  });

  it('accepts frozen pass1_input_mode with prefill fields (R1)', () => {
    const frozen: TranslationPayload = {
      ...translationPayload(),
      pass1_input_mode: 'frozen:some-record-id',
      prefill: true,
      prefill_content_hash: 'f'.repeat(64),
    };
    expect(validatePayload('translation', frozen)).toBeNull();
  });

  it('rejects prefill without its content hash', () => {
    const bad = { ...translationPayload(), prefill: true };
    expect(validatePayload('translation', bad)).toContain('prefill_content_hash');
  });

  it('rejects a bare "frozen:" mode', () => {
    const bad = { ...translationPayload(), pass1_input_mode: 'frozen:' };
    expect(validatePayload('translation', bad)).toContain('pass1_input_mode');
  });
});

describe('prepareResearchRecord (the write path contract)', () => {
  it('throws on a schema-invalid envelope', () => {
    const record = { ...envelope({ batch_id: '' }), payload: translationPayload() } as ResearchRecord;
    expect(() => prepareResearchRecord(record)).toThrow(/envelope invalid/);
  });

  it('coerces an invalid payload to parse_status failed, preserving it', () => {
    const brokenPayload = { ...translationPayload(), meme_id: 42 } as unknown as TranslationPayload;
    const record: ResearchRecord = { ...envelope(), payload: brokenPayload };
    const prepared = prepareResearchRecord(record);
    const payload = prepared.payload as TranslationPayload & { meme_id: unknown };
    expect(payload.parse_status).toBe('failed');
    expect(payload.failure?.stage).toBe('schema');
    expect(payload.failure?.message).toContain('meme_id');
    // The original (wrong) value is preserved, not repaired away.
    expect(payload.meme_id).toBe(42);
    expect(payload.raw_response).toBe(translationPayload().raw_response);
  });

  it('passes a fully valid record through unchanged in content', () => {
    const record: ResearchRecord = { ...envelope(), payload: translationPayload() };
    const prepared = prepareResearchRecord(record);
    expect(prepared).toEqual(JSON.parse(JSON.stringify(record)));
  });

  it('every fixture record carries a valid ontology (DoD f)', () => {
    for (const kind of ['encode', 'translation', 'evolve_step', 'judgment'] as const) {
      expect(isValidOntology(PHASE0_ONTOLOGY[kind])).toBe(true);
    }
  });
});
