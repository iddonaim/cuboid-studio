/**
 * Matrix expansion: cells = corpus × model × regime × cell-type(a/b/c) ×
 * replicate, in a deterministic order, each with a deterministic Firestore
 * document id so a resumed batch can skip completed cells.
 *
 * Cell identity lives in the DOCUMENT ID, not in the record schema — the
 * spec's envelope has no cell field, and schema additions need approval
 * (handoff rule 5; a `cell` envelope field is proposed in the build report).
 * The batch manifest maps every doc id back to its cell coordinates.
 *
 * Cell semantics under the shipped ONE-CALL two-pass pipeline:
 *   (a) full pipeline — live call, total variance.
 *   (b) "Pass 1 only" — the pipeline cannot stop after Pass 1 without a
 *       prompt variant, which Phase 0 forbids (R1: "No prompt variants in
 *       Phase 0"). Cell (b) therefore runs the SAME live call as (a) and
 *       pre-registers only the Pass-1 fields as measured; its Pass 2 is
 *       recorded (raw is always kept) but exploratory. This is an
 *       interpretation the rulings do not cover — flagged in the build
 *       report, and cheap to re-rule before any campaign.
 *   (c) frozen Pass 1 → Pass 2 only, via assistant prefill (R1).
 */

import type { DeclaredInfo } from '../../../src/research/types';
import type { BatchConfig, BatchModelConfig, CellType } from './config';
import type { Corpus, CorpusMeme } from './corpus';

export interface MatrixCell {
  index: number;
  memeId: string;
  meme: CorpusMeme;
  model: BatchModelConfig;
  cellType: CellType;
  replicateIndex: number;
  docId: string;
  declared: DeclaredInfo;
}

/** Firestore doc ids may not contain '/', and '.' has meaning in field paths
 *  elsewhere — normalize both out of model ids. */
export function modelKey(modelId: string): string {
  return modelId.replace(/\//g, '~').replace(/\./g, '-');
}

export function cellDocId(
  batchId: string,
  experiment: string,
  memeId: string,
  model: BatchModelConfig,
  cellType: CellType,
  replicateIndex: number,
): string {
  return [
    batchId,
    experiment,
    'translation',
    memeId,
    `${model.provider}_${modelKey(model.id)}`,
    `cell-${cellType}`,
    `r${replicateIndex}`,
  ].join('__');
}

const SHARED_FIXED = [
  'meme (id + content_hash)',
  'composition_ref',
  'target_cube',
  'site_context (hash)',
  'two-pass prompt file (hash)',
  'translation lexicon (hash, built-in default)',
  'model id + routing',
  'max_tokens',
];

const SHARED_STOCHASTIC = [
  'model sampling (temperature unset — provider default)',
  'pipeline parse/validation retry (app behavior, all attempts recorded)',
];

const PASS1_MEASURED = [
  'pass1.rhetorical_moves',
  'pass1.cultural_tensions',
  'pass1.functional_affects',
  'pass1.site_resonance',
  'pass1.meme_summary',
];

const PASS2_MEASURED = [
  'pass2.operator',
  'pass2.targets',
  'pass2.magnitude',
  'pass2.decay',
  'pass2.cutter',
  'pass2.confidence_vector',
  'pass2.reasoning',
];

/** Pre-registration blocks per E2 cell type (spec principle 6). */
export function declaredForCell(cellType: CellType): DeclaredInfo {
  switch (cellType) {
    case 'a':
      return {
        fixed: SHARED_FIXED,
        varied: [],
        stochastic: SHARED_STOCHASTIC,
        measured: [...PASS1_MEASURED, ...PASS2_MEASURED, 'parse_status', 'timing_ms'],
      };
    case 'b':
      return {
        fixed: SHARED_FIXED,
        varied: [],
        stochastic: SHARED_STOCHASTIC,
        measured: [
          ...PASS1_MEASURED,
          'parse_status',
          'timing_ms',
          // One-call pipeline: pass 2 is generated and recorded but NOT a
          // pre-registered outcome of cell (b) — exploratory only.
        ],
      };
    case 'c':
      return {
        fixed: [...SHARED_FIXED, 'pass1 (frozen — assistant prefill of stored Pass 1, R1)'],
        varied: [],
        stochastic: SHARED_STOCHASTIC,
        measured: [...PASS2_MEASURED, 'parse_status', 'timing_ms'],
      };
  }
}

/**
 * Expands the full E2 matrix in deterministic order: meme id ascending ×
 * config model order × cells (a, b, c) × replicate ascending.
 */
export function expandMatrix(config: BatchConfig, corpus: Corpus): MatrixCell[] {
  const cells: MatrixCell[] = [];
  let index = 0;
  for (const meme of corpus.memes) {
    for (const model of config.models) {
      for (const cellType of config.cells) {
        for (let r = 0; r < config.replicates; r++) {
          cells.push({
            index: index++,
            memeId: meme.id,
            meme,
            model,
            cellType,
            replicateIndex: r,
            docId: cellDocId(config.batch_id, config.experiment, meme.id, model, cellType, r),
            declared: declaredForCell(cellType),
          });
        }
      }
    }
  }
  return cells;
}

/** The batch's own frozen-source doc id for a (c) cell: cell (a) replicate 0
 *  of the same meme × model. */
export function defaultFrozenSourceDocId(config: BatchConfig, cell: MatrixCell): string {
  return cellDocId(config.batch_id, config.experiment, cell.memeId, cell.model, 'a', 0);
}
