/**
 * Batch configuration for the matrix runner. A batch config is a JSON file —
 * every run condition is declared up front (spec principle 6), and the file
 * itself is recorded in the batch manifest.
 */

/**
 * E2 cell types. Cell (b) — "Pass 1 only" — was DROPPED as separate runs by
 * Iddo's ruling of 2026-08-30: the one-call two-pass pipeline cannot stop
 * after Pass 1 without a prompt variant (forbidden in Phase 0), so reading
 * variance is decomposed from (a)'s Pass-1 marginals together with (c)'s
 * translation-given-frozen-reading variance, not measured by its own cell.
 */
export type CellType = 'a' | 'c';

export interface BatchModelConfig {
  /** Model id as the transport expects it (OpenRouter-style for openrouter,
   *  either style for anthropic-direct — toAnthropicModelId normalizes). */
  id: string;
  /**
   * Explicit routing — never inferred (SoT-documented trap: normal encode is
   * Anthropic-direct, not the OpenRouter gateway; translation defaults to
   * OpenRouter when a key exists. The harness always says which).
   */
  provider: 'anthropic' | 'openrouter';
}

export interface BatchConfig {
  batch_id: string;
  experiment: 'E1' | 'E2' | 'E3';
  /** A BASELINE tag is refused unless `baseline_freeze` repeats it: the
   *  freeze is a separate, human-ruled step (BASELINE-1: Iddo, 2026-10-11),
   *  and a stray BASELINE tag must never come from a copied config. */
  baseline_tag: string;
  /** Must equal baseline_tag for a BASELINE-tagged batch — the explicit
   *  declaration that this config is the ruled freeze run. */
  baseline_freeze?: string;
  corpus: {
    /** "all" = the whole raw memes collection; or an explicit id list. */
    meme_ids: 'all' | string[];
    /** Path to an offline corpus fixture (dry runs / tests) — see
     *  loadCorpusFromFile. When set, Firestore is not consulted. */
    corpus_file?: string;
  };
  models: BatchModelConfig[];
  /** E2 only: which cells to run. Empty (and rejected if set) for E3 —
   *  a/c are E2 concepts; an E3 batch is model × step-replicate. */
  cells: CellType[];
  replicates: number;
  /** E3 only: the frozen state to replay (see lib/evolveState.ts). */
  e3?: {
    /** Path to a FrozenEvolveState JSON file, repo-relative. */
    state_file: string;
  };
  /** Path to a site-context JSON file (SiteContextData), or null to run
   *  without site context (the prompt keeps its literal {site_context}
   *  placeholder, exactly as the app behaves with no active site). */
  site_context_file: string | null;
  /** Recorded context for the translation payload (the shipped translate
   *  request does not carry the composition — these document conditions). */
  composition_ref: string | null;
  target_cube: string | null;
  /** Language of the run, for the payload's language field (bilingual arm is
   *  out of Phase-0-scaffold scope; null = meme text as stored). */
  language: string | null;
  /** Abort the batch when the running cost estimate exceeds this (USD). */
  budget_cap_usd: number | null;
  /**
   * E2 cell (c) frozen Pass-1 source. "batch-cell-a" (default) pins each
   * meme×model's own cell-(a) replicate-0 record from this batch;
   * "all-batch-cell-a" pins EVERY (a) replicate of the meme×model in turn
   * (multi-pin: (c) runs `replicates` replicates per pin, and the pin index
   * is a declared varied condition and a segment of the record name);
   * or a map of "<memeId>" → research_records document id.
   */
  frozen_pass1_source?: 'batch-cell-a' | 'all-batch-cell-a' | Record<string, string>;
  /**
   * Path to a composition pin file (lib/composition.ts) — the stored
   * composition the batch translates against. Its site-context snapshot is
   * the site context of every cell; its composition id and target cube id
   * fill composition_ref / target_cube. Exclusive with site_context_file,
   * composition_ref and target_cube.
   */
  composition_file?: string;
  /**
   * "meme-script": each record's `language` is the script of its meme's text
   * (hebrew / latin / mixed / none — lib/language.ts), a label only; the
   * prompt is unchanged. Exclusive with a non-null `language`.
   */
  language_from?: 'meme-script';
  /** Optional JSON map "<memeId>" → language label, overriding the script
   *  classification for those memes (requires language_from). */
  language_overrides_file?: string;
  /** Batch transport: at most this many requests per submit round (a large
   *  round is also cut at a byte budget well under the API's batch size
   *  limit). Rounds go up one after another; omitted = byte budget only. */
  max_requests_per_round?: number;
}

const CELL_ORDER: CellType[] = ['a', 'c'];

export function parseBatchConfig(json: string, filePath: string): BatchConfig {
  const cfg = JSON.parse(json) as BatchConfig;
  const fail = (msg: string): never => {
    throw new Error(`batch config ${filePath}: ${msg}`);
  };

  if (!cfg.batch_id || typeof cfg.batch_id !== 'string') fail('batch_id is required');
  if (!['E1', 'E2', 'E3'].includes(cfg.experiment)) fail('experiment must be E1 | E2 | E3');
  if (!cfg.baseline_tag || typeof cfg.baseline_tag !== 'string') fail('baseline_tag is required');
  if (/^BASELINE/i.test(cfg.baseline_tag) && cfg.baseline_freeze !== cfg.baseline_tag) {
    fail(
      'baseline_tag must not be a BASELINE tag unless the config also declares the freeze — set ' +
      '"baseline_freeze" to the same tag (a human-ruled step: the freeze tag on the code, then this batch)',
    );
  }
  if (!cfg.corpus || (cfg.corpus.meme_ids !== 'all' && !Array.isArray(cfg.corpus.meme_ids))) {
    fail('corpus.meme_ids must be "all" or a string array');
  }
  if (!Array.isArray(cfg.models) || cfg.models.length === 0) fail('models must be a non-empty array');
  for (const m of cfg.models) {
    if (!m.id || typeof m.id !== 'string') fail('every model needs an id');
    if (m.provider !== 'anthropic' && m.provider !== 'openrouter') {
      fail(`model ${m.id}: provider must be "anthropic" or "openrouter" — routing is always explicit`);
    }
  }
  if (cfg.experiment === 'E3') {
    if (Array.isArray(cfg.cells) && cfg.cells.length > 0) {
      fail('cells do not apply to E3 (a/c are E2 concepts) — an E3 batch is model × step-replicate; remove cells');
    }
    cfg.cells = [];
    if (!cfg.e3 || typeof cfg.e3.state_file !== 'string' || cfg.e3.state_file.length === 0) {
      fail('E3 requires e3.state_file — the frozen state to replay');
    }
  } else {
    if (cfg.e3 !== undefined) fail('e3 applies only to experiment E3');
    if (!Array.isArray(cfg.cells) || cfg.cells.length === 0) fail('cells must be a non-empty array');
    for (const c of cfg.cells) {
      if ((c as string) === 'b') {
        fail(
          'cell (b) was dropped as separate runs (Iddo, 2026-08-30): reading variance is decomposed ' +
          'from cells (a) and (c), not run on its own — remove "b" from cells',
        );
      }
      if (!CELL_ORDER.includes(c)) fail(`unknown cell type "${c}" (expected a, c)`);
    }
  }
  if (!Number.isInteger(cfg.replicates) || cfg.replicates < 1) fail('replicates must be a positive integer');
  if (cfg.site_context_file !== null && typeof cfg.site_context_file !== 'string') {
    fail('site_context_file must be a path or null');
  }
  if (cfg.budget_cap_usd !== null && !(typeof cfg.budget_cap_usd === 'number' && cfg.budget_cap_usd > 0)) {
    fail('budget_cap_usd must be a positive number or null');
  }

  // Recorded-context fields: omitted means null. Without this, an omitted
  // field reaches the payload as `undefined`, fails payload validation, and
  // every record in the batch is written parse_status "failed" AFTER the
  // model spend. Wrong types still fail fast.
  for (const key of ['composition_ref', 'target_cube', 'language'] as const) {
    if (cfg[key] === undefined) cfg[key] = null;
    else if (cfg[key] !== null && typeof cfg[key] !== 'string') {
      fail(`${key} must be a string or null`);
    }
  }
  if (cfg.frozen_pass1_source === undefined) cfg.frozen_pass1_source = 'batch-cell-a';
  const fps = cfg.frozen_pass1_source;
  if (typeof fps === 'string' && fps !== 'batch-cell-a' && fps !== 'all-batch-cell-a') {
    fail('frozen_pass1_source must be "batch-cell-a", "all-batch-cell-a" or a meme-id → record-id map');
  }
  if (fps === 'all-batch-cell-a' && cfg.cells.includes('c') && !cfg.cells.includes('a')) {
    fail('frozen_pass1_source "all-batch-cell-a" pins this batch\'s own (a) records — cells must include "a"');
  }

  if (cfg.experiment === 'E3' && (cfg.composition_file !== undefined || cfg.language_from !== undefined)) {
    fail('composition_file and language_from apply to E2 translation batches only');
  }
  if (cfg.composition_file !== undefined) {
    if (typeof cfg.composition_file !== 'string' || cfg.composition_file.length === 0) {
      fail('composition_file must be a repo-relative path');
    }
    if (cfg.site_context_file !== null) fail('composition_file supplies the site context — set site_context_file to null');
    if (cfg.composition_ref !== null || cfg.target_cube !== null) {
      fail('composition_file supplies composition_ref and target_cube — leave both null');
    }
  }

  if (cfg.language_from !== undefined) {
    if (cfg.language_from !== 'meme-script') fail('language_from must be "meme-script"');
    if (cfg.language !== null) fail('language_from labels each record per meme — set language to null');
  }
  if (cfg.language_overrides_file !== undefined) {
    if (cfg.language_from === undefined) fail('language_overrides_file requires language_from');
    if (typeof cfg.language_overrides_file !== 'string') fail('language_overrides_file must be a path');
  }

  if (cfg.max_requests_per_round !== undefined
      && !(Number.isInteger(cfg.max_requests_per_round) && cfg.max_requests_per_round > 0)) {
    fail('max_requests_per_round must be a positive integer');
  }

  // Deterministic cell order regardless of config order.
  cfg.cells = CELL_ORDER.filter((c) => cfg.cells.includes(c));
  return cfg;
}
