/**
 * Harness scaffold tests — no network, no Firestore, no model calls.
 *
 * Covers: matrix determinism + doc ids; the dry-run cost table (DoD 2);
 * the frozen-Pass-1 round-trip through the app's own validator (DoD d + e):
 * a stored cell-(a) record's verbatim Pass 1 is pinned, prefilled, and the
 * continuation parses through validateAndReturnTwoPass; failure recording;
 * ontology on every produced record (DoD f).
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidOntology } from '../../src/research/ontology';
import type { TranslationRecord } from '../../src/research/types';
import { validateEnvelope, validatePayload } from '../../src/research/validate';
import { prepareResearchRecord } from '../../src/research/writeResearchRecord';
import { parseBatchConfig } from './lib/config';
import { loadCorpusFromFile, type Corpus } from './lib/corpus';
import { estimateCellCost, renderDryRunTable } from './lib/costs';
import { captureRegime } from './lib/regime';
import { cellDocId, defaultFrozenSourceDocId, expandMatrix, type MatrixCell } from './lib/matrix';
import {
  assembleTwoPassSystemPrompt,
  buildPass1Prefill,
  extractFrozenSource,
  FrozenSourceUnavailableError,
  pickDescribedRaw,
  probeContinuationOk,
  runTranslationCell,
  type TranslationCellContext,
} from './lib/translationCell';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TOY_BATCH = path.join(REPO_ROOT, 'scripts/research/examples/e2-toy.batch.json');
const TOY_CORPUS = path.join(REPO_ROOT, 'scripts/research/examples/e2-toy.corpus.json');

async function loadToy(): Promise<{ config: ReturnType<typeof parseBatchConfig>; corpus: Corpus }> {
  const config = parseBatchConfig(fs.readFileSync(TOY_BATCH, 'utf-8'), TOY_BATCH);
  const corpus = await loadCorpusFromFile(fs.readFileSync(TOY_CORPUS, 'utf-8'), TOY_CORPUS);
  return { config, corpus };
}

// A two-pass response that passes validateAndReturnTwoPass (shapes match
// api/translate-meme.test.ts fixtures).
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
  target_reasoning: 'acts on who is next to whom',
  magnitude: 0.4,
  decay: 0.2,
  cutter: {
    type: 'box',
    proportions: [0.8, 0.1, 0.9],
    position: [0.3, 0.5, 0.4],
    rotation: [0, 15, 0],
    geometry_reasoning: 'a thin box',
  },
  confidence_vector: {
    rhetorical_clarity: 0.9,
    site_resonance: 0.7,
    affective_coherence: 0.8,
    operational_specificity: 0.5,
  },
  confidence_note: 'site resonance strained',
  reasoning: 'displacement maps to reassignment',
};

async function makeContext(
  overrides: Partial<TranslationCellContext>,
): Promise<TranslationCellContext> {
  const { config } = await loadToy();
  const { regime, twoPassPromptText } = await captureRegime(REPO_ROOT);
  return {
    config,
    regime,
    twoPassPromptText,
    siteContext: null,
    siteContextHash: null,
    appCommit: 'test-commit',
    anthropicKey: null,
    openRouterKey: null,
    resolveFrozenSource: async () => {
      throw new Error('no frozen source configured in this test');
    },
    prefillSupport: new Map([['anthropic/claude-sonnet-4.6', true]]),
    ...overrides,
  };
}

describe('matrix expansion', () => {
  it('expands the toy config to 3 memes × 1 model × 2 cells (a, c) × 3 replicates = 18 cells, deterministically ordered', async () => {
    const { config, corpus } = await loadToy();
    const cells = expandMatrix(config, corpus);
    expect(cells).toHaveLength(18);
    expect(corpus.raw_collection_count).toBe(3);
    expect(corpus.used_count).toBe(3);
    // Meme ids ascending; a-cells before c-cells within a meme×model.
    expect(cells[0].memeId).toBe('meme-toy-0001-current');
    expect(cells[0].cellType).toBe('a');
    expect(cells[0].replicateIndex).toBe(0);
    expect(cells[3].memeId).toBe('meme-toy-0001-current');
    expect(cells[3].cellType).toBe('c');
    expect(cells[6].memeId).toBe('meme-toy-0002-legacy');
    // Expanding twice gives identical doc ids in identical order.
    const again = expandMatrix(config, corpus).map((c) => c.docId);
    expect(cells.map((c) => c.docId)).toEqual(again);
  });

  it('rejects a config naming cell (b) — dropped as separate runs (Iddo, 2026-08-30)', () => {
    const withB = JSON.stringify({
      batch_id: 'b-test', experiment: 'E2', baseline_tag: 'SCAFFOLD-X',
      corpus: { meme_ids: 'all' },
      models: [{ id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic' }],
      cells: ['a', 'b', 'c'], replicates: 1, site_context_file: null, budget_cap_usd: null,
    });
    expect(() => parseBatchConfig(withB, 'with-b.json')).toThrow(/dropped as separate runs/);
  });

  it('doc ids are Firestore-safe and encode the full cell identity', async () => {
    const { config, corpus } = await loadToy();
    const cells = expandMatrix(config, corpus);
    for (const cell of cells) {
      expect(cell.docId).not.toContain('/');
      expect(cell.docId.length).toBeLessThan(1500);
    }
    expect(cells[0].docId).toBe(
      'e2-toy-000__E2__translation__meme-toy-0001-current__anthropic_anthropic~claude-sonnet-4-6__cell-a__r0',
    );
    // The (c) cell's default frozen source is its own meme×model cell (a) r0.
    const cCell = cells.find((c) => c.cellType === 'c')!;
    expect(defaultFrozenSourceDocId(config, cCell)).toBe(
      cellDocId(config.batch_id, config.experiment, cCell.memeId, cCell.model, 'a', 0),
    );
  });

  it('ghost fields: the legacy toy meme hashes its stored topText/userId, the current one does not', async () => {
    const { corpus } = await loadToy();
    const legacy = corpus.memes.find((m) => m.id === 'meme-toy-0002-legacy')!;
    const current = corpus.memes.find((m) => m.id === 'meme-toy-0001-current')!;
    expect(legacy.covered_fields).toContain('topText');
    expect(legacy.covered_fields).toContain('userId');
    expect(current.covered_fields).not.toContain('topText');
    expect(current.covered_fields).not.toContain('userId');
    // Mutable state is never covered.
    for (const m of corpus.memes) {
      expect(m.covered_fields).not.toContain('likes');
      expect(m.covered_fields).not.toContain('hidden');
    }
  });
});

describe('dry-run cost table (DoD 2)', () => {
  it('prices the toy matrix without any network or model call', async () => {
    const { config, corpus } = await loadToy();
    const { twoPassPromptText } = await captureRegime(REPO_ROOT);
    const systemPrompt = assembleTwoPassSystemPrompt(twoPassPromptText, null);

    const cells = expandMatrix(config, corpus).map((cell) => ({
      ...cell,
      estimate: estimateCellCost({
        modelId: cell.model.id,
        systemPromptChars: systemPrompt.length,
        userMessageChars: 400,
        hasImage: true,
        cellType: cell.cellType,
      }),
    }));

    const table = renderDryRunTable(cells);
    expect(table.cell_count).toBe(18);
    // Believable: a real two-pass system prompt is thousands of tokens, so an
    // 18-cell toy batch lands in whole-dollar-cents territory, not zero and
    // not hundreds of dollars.
    expect(table.total_usd).toBeGreaterThan(0.1);
    expect(table.total_usd).toBeLessThan(10);
    // 6 groups (3 memes × 2 cells) + header/footer lines.
    expect(table.lines.length).toBeGreaterThan(6);
    expect(table.lines.join('\n')).toContain('anthropic/claude-sonnet-4.6');
  });
});

describe('translation cell execution (scripted transport)', () => {
  it('cell (a): live run produces a valid ok record with verbatim pass slices', async () => {
    const { config, corpus } = await loadToy();
    const responseText = JSON.stringify([validPass1, validPass2], null, 2);
    const ctx = await makeContext({
      transportOverride: () => async () => responseText,
    });
    const cells = expandMatrix(config, corpus);
    const aCell = cells[0];

    const { record } = await runTranslationCell(ctx, aCell);
    expect(validateEnvelope({ ...record, payload: undefined })).toBeNull();
    expect(validatePayload('translation', record.payload)).toBeNull();
    expect(record.payload.parse_status).toBe('ok');
    expect(record.payload.pass1_input_mode).toBe('live');
    expect(record.payload.prefill).toBe(false);
    expect(record.payload.raw_response).toBe(responseText);
    // Verbatim slices re-parse to the scripted passes.
    expect(JSON.parse(record.payload.pass1.raw!)).toEqual(validPass1);
    expect(JSON.parse(record.payload.pass2.raw!)).toEqual(validPass2);
    expect(record.payload.attempts).toHaveLength(1);
    expect(record.ontology && isValidOntology(record.ontology)).toBe(true);
    // The write path accepts it untouched.
    expect(() => prepareResearchRecord(record)).not.toThrow();
  });

  it('frozen round-trip (DoD d + e): store cell (a), pin its Pass 1, produce a Pass-2-only record that parses through the existing validator', async () => {
    const { config, corpus } = await loadToy();
    const cells = expandMatrix(config, corpus);
    const store = new Map<string, TranslationRecord>();

    // 1. Store a live translation record (cell a, replicate 0).
    const aCell = cells[0];
    const aResponse = JSON.stringify([validPass1, validPass2], null, 2);
    const ctxA = await makeContext({ transportOverride: () => async () => aResponse });
    const aResult = await runTranslationCell(ctxA, aCell);
    store.set(aCell.docId, prepareResearchRecord(aResult.record) as TranslationRecord);

    // 2. Pin its Pass 1 for the (c) cell of the same meme × model.
    const cCell = cells.find((c) => c.cellType === 'c' && c.memeId === aCell.memeId)!;
    const seenPrefills: Array<string | undefined> = [];
    const continuation = '\n  ' + JSON.stringify(validPass2) + '\n]';
    const ctxC = await makeContext({
      resolveFrozenSource: async (cell: MatrixCell) => {
        const source = store.get(defaultFrozenSourceDocId(config, cell));
        if (!source) throw new Error('missing frozen source');
        return { recordId: source.record_id, pass1Raw: source.payload.pass1.raw! };
      },
      transportOverride: (_cell, opts) => {
        seenPrefills.push(opts.assistantPrefill);
        return async () => continuation;
      },
    });
    const cResult = await runTranslationCell(ctxC, cCell);
    const cRecord = cResult.record;

    // R1 mechanics: prefill is "[" + stored Pass-1 verbatim + ",".
    const storedA = store.get(aCell.docId)!;
    const expectedPrefill = buildPass1Prefill({
      recordId: storedA.record_id,
      pass1Raw: storedA.payload.pass1.raw!,
    });
    expect(seenPrefills).toEqual([expectedPrefill]);
    expect(expectedPrefill.startsWith('[')).toBe(true);
    expect(expectedPrefill.endsWith(',')).toBe(true);
    expect(expectedPrefill).toContain(storedA.payload.pass1.raw!);

    // The concatenated text parsed through the EXISTING validator (DoD e):
    expect(cRecord.payload.parse_status).toBe('ok');
    expect(cRecord.payload.pass1.parsed).toEqual(validPass1);
    expect(cRecord.payload.pass2.parsed).toEqual(validPass2);

    // The record references the pinned Pass-1 record (DoD d):
    expect(cRecord.payload.pass1_input_mode).toBe(`frozen:${storedA.record_id}`);
    expect(cRecord.payload.prefill).toBe(true);
    expect(cRecord.payload.prefill_content_hash).toMatch(/^[0-9a-f]{64}$/);
    // Full raw response = prefill + continuation, verbatim.
    expect(cRecord.payload.raw_response).toBe(expectedPrefill + continuation);
    expect(validatePayload('translation', cRecord.payload)).toBeNull();
    expect(cRecord.ontology && isValidOntology(cRecord.ontology)).toBe(true);
  });

  it('cell (c) is skipped with a recorded reason when the provider cannot prefill (R1)', async () => {
    const { config, corpus } = await loadToy();
    const cells = expandMatrix(config, corpus);
    const cCell = cells.find((c) => c.cellType === 'c')!;
    const ctx = await makeContext({
      prefillSupport: new Map([['anthropic/claude-sonnet-4.6', false]]),
      transportOverride: () => async () => {
        throw new Error('transport must not be called for a skipped cell');
      },
    });
    const { record, called } = await runTranslationCell(ctx, cCell);
    expect(called).toBe(false);
    expect(record.payload.parse_status).toBe('failed');
    expect(record.payload.prefill_supported).toBe(false);
    expect(record.payload.failure?.stage).toBe('harness');
    expect(record.payload.failure?.message).toContain('skipped');
    expect(validatePayload('translation', record.payload)).toBeNull();
  });

  it('failures are data: malformed model output becomes a failed record with every attempt preserved', async () => {
    const { config, corpus } = await loadToy();
    const cells = expandMatrix(config, corpus);
    const ctx = await makeContext({
      transportOverride: () => async () => 'not json at all',
    });
    const { record } = await runTranslationCell(ctx, cells[0]);
    expect(record.payload.parse_status).toBe('failed');
    expect(record.payload.failure?.stage).toBe('parse');
    expect(record.payload.failure?.http_status).toBe(422);
    // Initial call + the pipeline's one parse retry, both verbatim.
    expect(record.payload.attempts.map((a) => a.role)).toEqual(['initial', 'parse_retry']);
    expect(record.payload.attempts.every((a) => a.raw_response === 'not json at all')).toBe(true);
    expect(validatePayload('translation', record.payload)).toBeNull();
    expect(() => prepareResearchRecord(record)).not.toThrow();
  });
});

describe('config normalization', () => {
  it('omitted recorded-context fields default to null instead of poisoning every payload', () => {
    const minimal = JSON.stringify({
      batch_id: 'b', experiment: 'E2', baseline_tag: 'SCAFFOLD-X',
      corpus: { meme_ids: 'all' },
      models: [{ id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic' }],
      cells: ['a'], replicates: 1, site_context_file: null, budget_cap_usd: null,
    });
    const cfg = parseBatchConfig(minimal, 'minimal.json');
    expect(cfg.composition_ref).toBeNull();
    expect(cfg.target_cube).toBeNull();
    expect(cfg.language).toBeNull();
    expect(cfg.frozen_pass1_source).toBe('batch-cell-a');
  });

  it('rejects wrong types on the nullable context fields', () => {
    const bad = JSON.stringify({
      batch_id: 'b', experiment: 'E2', baseline_tag: 'SCAFFOLD-X',
      corpus: { meme_ids: 'all' },
      models: [{ id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic' }],
      cells: ['a'], replicates: 1, site_context_file: null, budget_cap_usd: null,
      target_cube: 7,
    });
    expect(() => parseBatchConfig(bad, 'bad.json')).toThrow(/target_cube/);
  });

  it('rejects a BASELINE-prefixed tag (the freeze is a separate human step)', () => {
    const bad = JSON.stringify({
      batch_id: 'b', experiment: 'E2', baseline_tag: 'BASELINE-1',
      corpus: { meme_ids: 'all' },
      models: [{ id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic' }],
      cells: ['a'], replicates: 1, site_context_file: null, budget_cap_usd: null,
    });
    expect(() => parseBatchConfig(bad, 'bad.json')).toThrow(/BASELINE/);
  });
});

describe('prefill probe continuation judgment (R1)', () => {
  it('accepts a genuine continuation of the prefill', () => {
    expect(probeContinuationOk(' 2, 3]')).toBe(true);
    expect(probeContinuationOk('2,3]')).toBe(true);
  });

  it('rejects a provider that restarted the answer instead of continuing', () => {
    // A fresh assistant turn: a complete array of its own. '[1,' + this is
    // not valid JSON — the provider ignored the prefill.
    expect(probeContinuationOk('[1, 2, 3]')).toBe(false);
    expect(probeContinuationOk('Sure! The array is [1, 2, 3].')).toBe(false);
  });
});

describe('frozen source hygiene', () => {
  const sourceDoc = (parseStatus: string, raw: string | null) => ({
    record_id: 'rid-1',
    payload: { parse_status: parseStatus, pass1: { raw } },
  });

  it('accepts a validated source and returns its verbatim Pass 1', () => {
    expect(extractFrozenSource('doc-1', sourceDoc('ok', '{"pass":1}'))).toEqual({
      recordId: 'rid-1',
      pass1Raw: '{"pass":1}',
    });
  });

  it('rejects a FAILED source record even when it carries a pass1.raw slice', () => {
    expect(() => extractFrozenSource('doc-1', sourceDoc('failed', '{"pass":1}'))).toThrow(
      FrozenSourceUnavailableError,
    );
  });

  it('rejects a source with no verbatim slice', () => {
    expect(() => extractFrozenSource('doc-1', sourceDoc('ok', null))).toThrow(
      FrozenSourceUnavailableError,
    );
  });
});

describe('pickDescribedRaw (record coherence)', () => {
  const attempt = (raw: string | null) => ({ role: 'x', raw_response: raw, error: null, timing_ms: 1 });

  it('a kept validation error is described by the last attempt that parsed, not an unparseable retry', () => {
    const attempts = [attempt('{"operator":"juxtaposition"}'), attempt('garbage retry')];
    expect(pickDescribedRaw(attempts, 422, 'Invalid operator: must be one of …')).toBe(
      '{"operator":"juxtaposition"}',
    );
  });

  it('malformed_response is described by the last response', () => {
    const attempts = [attempt('not json'), attempt('still not json')];
    expect(pickDescribedRaw(attempts, 422, 'malformed_response')).toBe('still not json');
  });

  it('success is described by the last response', () => {
    const attempts = [attempt('bad'), attempt('[{"pass":1},{"pass":2}]')];
    expect(pickDescribedRaw(attempts, 200, undefined)).toBe('[{"pass":1},{"pass":2}]');
  });
});

describe('prompt assembly parity (mirrors api/translate-meme.ts handler)', () => {
  it('fills every {{lexicon}} slot from the default lexicon', async () => {
    const { twoPassPromptText } = await captureRegime(REPO_ROOT);
    expect(twoPassPromptText).toContain('{{'); // the file is a slotted template
    const assembled = assembleTwoPassSystemPrompt(twoPassPromptText, null);
    expect(assembled).not.toContain('{{'); // composed: no unfilled slot remains
  });

  it('leaves the {site_context} placeholder untouched with no site context (handler behavior, measured as-is)', async () => {
    const { twoPassPromptText } = await captureRegime(REPO_ROOT);
    const assembled = assembleTwoPassSystemPrompt(twoPassPromptText, null);
    expect(assembled).toContain('{site_context}');
  });

  it('injects a provided site context as pretty-printed JSON', async () => {
    const { twoPassPromptText } = await captureRegime(REPO_ROOT);
    const site = { site_name: 'Allenby', quantitative: { location: { lat: '32.08', lng: '34.78' } } };
    const assembled = assembleTwoPassSystemPrompt(twoPassPromptText, site);
    expect(assembled).not.toContain('{site_context}');
    expect(assembled).toContain(JSON.stringify(site, null, 2));
  });
});
