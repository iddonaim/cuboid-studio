/**
 * The batch record: one manifest per batch in `research_batches` (same
 * append-only rules as research_records), written once at batch start.
 *
 * It carries what the envelope schema deliberately does not: the corpus
 * source with the RAW collection count next to the count actually used
 * (2026-08-30 instruction), the per-meme content hashes with the fields each
 * hash covered, the matrix shape, and the doc-id scheme that maps every
 * research_records document id back to its cell coordinates.
 */

import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { RESEARCH_BATCHES_COLLECTION, type RegimeInfo } from '../../../src/research/types';
import type { BatchConfig } from './config';
import type { Corpus } from './corpus';

export interface BatchRecord {
  batch_id: string;
  experiment: string;
  created_at: string;
  baseline_tag: string;
  app_commit: string;
  corpus: {
    source: string;
    /** Documents in the raw `memes` collection at read time. */
    raw_collection_count: number;
    /** Memes the batch actually uses (after the recorded filter). */
    used_count: number;
    filter: string;
    memes: Array<{
      id: string;
      content_hash: string;
      covered_fields: string[];
      likes_at_read: number;
    }>;
  };
  matrix: {
    models: BatchConfig['models'];
    cells: string[];
    replicates: number;
    cell_count: number;
    ordering: string;
    doc_id_scheme: string;
  };
  regime: RegimeInfo;
  site_context_hash: string | null;
  cost_estimate_usd: number;
  budget_cap_usd: number | null;
  notes: string[];
}

export function buildBatchRecord(args: {
  config: BatchConfig;
  corpus: Corpus;
  regime: RegimeInfo;
  siteContextHash: string | null;
  appCommit: string;
  cellCount: number;
  costEstimateUsd: number;
  notes?: string[];
}): BatchRecord {
  const { config, corpus } = args;
  return {
    batch_id: config.batch_id,
    experiment: config.experiment,
    created_at: new Date().toISOString(),
    baseline_tag: config.baseline_tag,
    app_commit: args.appCommit,
    corpus: {
      source: corpus.source,
      raw_collection_count: corpus.raw_collection_count,
      used_count: corpus.used_count,
      filter: corpus.filter,
      memes: corpus.memes.map((m) => ({
        id: m.id,
        content_hash: m.content_hash,
        covered_fields: m.covered_fields,
        likes_at_read: m.likes_at_read,
      })),
    },
    matrix: {
      models: config.models,
      cells: config.cells,
      replicates: config.replicates,
      cell_count: args.cellCount,
      ordering: 'meme id ascending × config model order × cells (a, b, c) × replicate ascending',
      doc_id_scheme:
        '<batch_id>__<experiment>__translation__<meme_id>__<provider>_<model id, / → ~ and . → ->__cell-<a|c>__r<replicate>',
    },
    regime: args.regime,
    site_context_hash: args.siteContextHash,
    cost_estimate_usd: args.costEstimateUsd,
    budget_cap_usd: config.budget_cap_usd,
    notes: args.notes ?? [],
  };
}

/**
 * Writes the batch record if none exists yet. A resumed batch keeps its
 * original manifest (append-only — never overwritten); the stored manifest
 * comes back so the caller can verify the resumed conditions still match it.
 */
export async function writeBatchRecordOnce(
  db: Firestore,
  record: BatchRecord,
): Promise<{ existed: boolean; stored: BatchRecord }> {
  const ref = doc(db, RESEARCH_BATCHES_COLLECTION, record.batch_id);
  const existing = await getDoc(ref);
  if (existing.exists()) return { existed: true, stored: existing.data() as BatchRecord };
  await setDoc(ref, JSON.parse(JSON.stringify(record)));
  return { existed: false, stored: record };
}

/**
 * A batch_id names ONE set of measurement conditions: records are comparable
 * iff their hashes match (spec principle 2), so resuming under the same
 * batch_id with a drifted regime, corpus, or site context would silently mix
 * regimes inside one batch. Returns the mismatches (empty = safe to resume).
 */
export function batchResumeMismatches(stored: BatchRecord, current: BatchRecord): string[] {
  const problems: string[] = [];
  for (const [key, hash] of Object.entries(current.regime.prompt_hashes)) {
    if (stored.regime.prompt_hashes[key] !== hash) problems.push(`regime.prompt_hashes.${key} changed`);
  }
  if (stored.regime.spatial_lexicon_hash !== current.regime.spatial_lexicon_hash) {
    problems.push('regime.spatial_lexicon_hash changed');
  }
  if (stored.regime.translation_lexicon_hash !== current.regime.translation_lexicon_hash) {
    problems.push('regime.translation_lexicon_hash changed');
  }
  if (stored.site_context_hash !== current.site_context_hash) problems.push('site_context_hash changed');

  const storedMemes = new Map(stored.corpus.memes.map((m) => [m.id, m.content_hash]));
  for (const meme of current.corpus.memes) {
    const storedHash = storedMemes.get(meme.id);
    if (storedHash === undefined) problems.push(`meme ${meme.id} not in the stored manifest`);
    else if (storedHash !== meme.content_hash) problems.push(`meme ${meme.id} content changed since the manifest`);
  }
  for (const id of storedMemes.keys()) {
    if (!current.corpus.memes.some((m) => m.id === id)) problems.push(`meme ${id} missing from the current corpus`);
  }
  return problems;
}
