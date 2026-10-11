/**
 * BASELINE-1 harness additions (ruling 2026-10-11) — no network, no
 * Firestore: composition pins, multi-pin (c), per-meme language labels, the
 * BASELINE tag gate, and the e2-base-001 config itself.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256HexOfString } from '../../src/research/hashing';
import { validatePayload } from '../../src/research/validate';
import { loadCompositionPin, loadCompositionPinFromString } from './lib/composition';
import { parseBatchConfig, type BatchConfig } from './lib/config';
import { loadCorpusFromFile } from './lib/corpus';
import { classifyScript, languageForMeme, memeOwnText, parseLanguageOverrides } from './lib/language';
import { defaultFrozenSourceDocId, expandMatrix } from './lib/matrix';
import { captureRegime } from './lib/regime';
import { runTranslationCell, type TranslationCellContext } from './lib/translationCell';

const REPO_ROOT = path.resolve(__dirname, '../..');
const PIN_FILE = 'scripts/research/examples/compositions/NSCSM9TXSN0KhhvnhGkJ.json';
const BASE_CONFIG = 'scripts/research/examples/e2-base-001.batch.json';
const TOY_CORPUS = path.join(REPO_ROOT, 'scripts/research/examples/e2-toy.corpus.json');

function config(overrides: Partial<BatchConfig> & Record<string, unknown> = {}): BatchConfig {
  return parseBatchConfig(
    JSON.stringify({
      batch_id: 'b',
      experiment: 'E2',
      baseline_tag: 'SCAFFOLD-TOY',
      corpus: { meme_ids: 'all' },
      models: [{ id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic' }],
      cells: ['a', 'c'],
      replicates: 3,
      site_context_file: null,
      budget_cap_usd: null,
      ...overrides,
    }),
    'test.json',
  );
}

async function toyCorpus() {
  return loadCorpusFromFile(fs.readFileSync(TOY_CORPUS, 'utf-8'), TOY_CORPUS);
}

describe('composition pin', () => {
  it('loads the committed NSCSM9TXSN0KhhvnhGkJ pin: site context serialized as the handler does, hashed', async () => {
    const loaded = await loadCompositionPin(REPO_ROOT, PIN_FILE);
    expect(loaded.pin.composition_id).toBe('NSCSM9TXSN0KhhvnhGkJ');
    expect(loaded.pin.target_cube_id).toBeNull();
    expect(loaded.pin.images).toHaveLength(4);
    expect(loaded.siteContextStr).toBe(JSON.stringify(loaded.pin.site_context, null, 2));
    expect(loaded.site_context_hash).toBe(await sha256HexOfString(loaded.siteContextStr));
    expect(loaded.file_sha256).toBe(await sha256HexOfString(fs.readFileSync(path.join(REPO_ROOT, PIN_FILE), 'utf-8')));
  });

  it('refuses a pin with an unhashed photo, no site context, or an oversized site context', async () => {
    const good = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, PIN_FILE), 'utf-8'));
    const unhashed = { ...good, images: [{ ...good.images[0], sha256: null, error: 'storage HTTP 403' }] };
    await expect(loadCompositionPinFromString(JSON.stringify(unhashed), 'x')).rejects.toThrow(/storage HTTP 403/);
    await expect(loadCompositionPinFromString(JSON.stringify({ ...good, site_context: null }), 'x')).rejects.toThrow(/site_context/);
    const huge = { ...good, site_context: { blob: 'x'.repeat(40_000) } };
    await expect(loadCompositionPinFromString(JSON.stringify(huge), 'x')).rejects.toThrow(/refuses more than/);
  });

  it('config: composition_file is exclusive with site_context_file, composition_ref and target_cube', () => {
    expect(() => config({ composition_file: PIN_FILE, site_context_file: 'x.json' })).toThrow(/site_context_file/);
    expect(() => config({ composition_file: PIN_FILE, target_cube: 'cube-1' })).toThrow(/composition_ref and target_cube/);
    expect(() => config({ composition_file: PIN_FILE })).not.toThrow();
  });
});

describe('multi-pin (c)', () => {
  it('runs N replicates per pin, names the pin in the record name, declares it varied, and freezes the pinned (a) replicate', async () => {
    const cfg = config({ frozen_pass1_source: 'all-batch-cell-a' });
    const corpus = await toyCorpus();
    const cells = expandMatrix(cfg, corpus);
    const R = cfg.replicates;
    expect(cells).toHaveLength(corpus.memes.length * (R + R * R));

    const cCells = cells.filter((c) => c.cellType === 'c');
    const meme = corpus.memes[0].id;
    const forMeme = cCells.filter((c) => c.memeId === meme);
    expect(new Set(forMeme.map((c) => c.docId)).size).toBe(R * R);
    const sample = forMeme.find((c) => c.pinIndex === 2 && c.replicateIndex === 1)!;
    expect(sample.docId).toMatch(/__cell-c__p2__r1$/);
    expect(defaultFrozenSourceDocId(cfg, sample)).toMatch(/__cell-a__r2$/);
    expect(sample.declared.varied.join(' ')).toMatch(/pass1 pin/);

    // (a) names and single-pin (c) names are unchanged.
    expect(cells.find((c) => c.cellType === 'a')!.docId).toMatch(/__cell-a__r0$/);
    const single = expandMatrix(config(), corpus).filter((c) => c.cellType === 'c');
    expect(single[0].docId).toMatch(/__cell-c__r0$/);
    expect(single[0].pinIndex).toBeUndefined();
    expect(single[0].declared.varied).toEqual([]);
  });

  it('rejects unknown pin modes and multi-pin without (a) cells', () => {
    expect(() => config({ frozen_pass1_source: 'all' as never })).toThrow(/frozen_pass1_source/);
    expect(() => config({ frozen_pass1_source: 'all-batch-cell-a', cells: ['c'] })).toThrow(/must include "a"/);
  });
});

describe('language labels', () => {
  it('classifies the meme text script', () => {
    expect(classifyScript('קירות בתל אביב')).toBe('hebrew');
    expect(classifyScript('Junkspace, Koolhaas says')).toBe('latin');
    expect(classifyScript('מבנים של mvrdv להיות כמו:')).toBe('mixed');
    expect(classifyScript('')).toBe('none');
    expect(classifyScript('123 :)')).toBe('none');
  });

  it('reads memeText first, then the legacy top/bottom pair — never description', () => {
    expect(memeOwnText({ memeText: 'שקיעה', topText: 'TOP' })).toBe('שקיעה');
    expect(memeOwnText({ topText: 'MY LANDLORD', bottomText: 'RAISING RENT' })).toBe('MY LANDLORD / RAISING RENT');
    expect(languageForMeme('m1', { topText: 'MY LANDLORD' }, null)).toBe('latin');
    expect(languageForMeme('m1', { topText: 'MY LANDLORD' }, { m1: 'hebrew' })).toBe('hebrew');
  });

  it('validates override files and the config switch', () => {
    expect(parseLanguageOverrides('{"m1":"hebrew"}', 'o.json')).toEqual({ m1: 'hebrew' });
    expect(() => parseLanguageOverrides('["hebrew"]', 'o.json')).toThrow(/JSON object/);
    expect(() => parseLanguageOverrides('{"m1":""}', 'o.json')).toThrow(/non-empty/);
    expect(() => config({ language_from: 'meme-script', language: 'he' })).toThrow(/set language to null/);
    expect(() => config({ language_overrides_file: 'o.json' })).toThrow(/requires language_from/);
  });
});

describe('records carry the composition and the per-meme language label', () => {
  it('a (c) cell under a pinned composition: composition_ref, target_cube, site_context_hash, language', async () => {
    const corpus = await toyCorpus();
    const cfg = config({ composition_file: PIN_FILE, language_from: 'meme-script', frozen_pass1_source: 'all-batch-cell-a' });
    const loaded = await loadCompositionPin(REPO_ROOT, PIN_FILE);
    cfg.composition_ref = loaded.pin.composition_id;
    cfg.target_cube = loaded.pin.target_cube_id;
    const { regime, twoPassPromptText } = await captureRegime(REPO_ROOT);
    const cell = expandMatrix(cfg, corpus).find((c) => c.cellType === 'c' && c.pinIndex === 1)!;
    let sentSystem = '';
    const ctx: TranslationCellContext = {
      config: cfg,
      regime,
      twoPassPromptText,
      siteContext: loaded.siteContextStr,
      siteContextHash: loaded.site_context_hash,
      appCommit: 'test',
      anthropicKey: null,
      openRouterKey: null,
      resolveFrozenSource: async () => ({ recordId: 'rid-a1', pass1Raw: '{"pass":1}' }),
      languageOverrides: null,
      transportOverride: (_c, opts) => {
        sentSystem = opts.systemPrompt;
        return async () => 'not json';
      },
    };
    const { record } = await runTranslationCell(ctx, cell);
    expect(sentSystem).toContain(loaded.siteContextStr);
    expect(record.payload.composition_ref).toBe('NSCSM9TXSN0KhhvnhGkJ');
    expect(record.payload.target_cube).toBeNull();
    expect(record.payload.site_context_hash).toBe(loaded.site_context_hash);
    expect(record.payload.language).toBe(languageForMeme(cell.memeId, cell.meme.meme, null));
    expect(record.declared.varied.join(' ')).toMatch(/pass1 pin/);
    expect(validatePayload('translation', record.payload)).toBeNull();
  });
});

describe('BASELINE tag gate and the e2-base-001 config', () => {
  it('refuses a BASELINE tag unless baseline_freeze repeats it', () => {
    expect(() => config({ baseline_tag: 'BASELINE-1' })).toThrow(/baseline_freeze/);
    expect(() => config({ baseline_tag: 'BASELINE-1', baseline_freeze: 'BASELINE-2' })).toThrow(/baseline_freeze/);
    expect(() => config({ baseline_tag: 'BASELINE-1', baseline_freeze: 'BASELINE-1' })).not.toThrow();
  });

  it('e2-base-001 parses as ruled: BASELINE-1, the pinned composition, N=10, all pins, language by script, $120', () => {
    const cfg = parseBatchConfig(fs.readFileSync(path.join(REPO_ROOT, BASE_CONFIG), 'utf-8'), BASE_CONFIG);
    expect(cfg).toMatchObject({
      batch_id: 'e2-base-001',
      baseline_tag: 'BASELINE-1',
      composition_file: PIN_FILE,
      replicates: 10,
      cells: ['a', 'c'],
      frozen_pass1_source: 'all-batch-cell-a',
      language_from: 'meme-script',
      budget_cap_usd: 120,
      models: [{ id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic' }],
    });
    expect(cfg.corpus.meme_ids).toBe('all');
  });
});
