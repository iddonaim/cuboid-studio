/**
 * Batch export — the files a researcher opens (export protocol, 2026-10-11).
 *
 * A batch is not finished until its export exists:
 *   research-data/<batch_id>/<batch_id>.jsonl  — every record in full, the
 *     artifact of record (one line per Firestore document, `_doc_id` + every
 *     stored field, raw model text included; keys sorted so a re-export of
 *     unchanged records is byte-identical).
 *   research-data/<batch_id>/<batch_id>.csv    — one flat row per record for
 *     reading (CSV_COLUMNS). Derived from the JSONL's records; never the
 *     source of truth.
 *
 * Re-exporting rewrites both files in full from the database. The database is
 * only ever read here.
 *
 * Used by `run.ts --collect` (after every successful collect) and by
 * `export.ts --research-data` (any batch, on demand). The GitHub workflow
 * commits the folder to the `research-data` branch.
 */

import fs from 'node:fs';
import path from 'node:path';
import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { RESEARCH_BATCHES_COLLECTION, RESEARCH_RECORDS_COLLECTION } from '../../../src/research/types.js';

export interface ExportedDoc {
  docId: string;
  data: Record<string, unknown>;
}

/** Every research_records document of one batch, ordered by document id. */
export async function fetchBatchRecords(db: Firestore, batchId: string): Promise<ExportedDoc[]> {
  const snapshot = await getDocs(
    query(collection(db, RESEARCH_RECORDS_COLLECTION), where('batch_id', '==', batchId)),
  );
  return snapshot.docs
    .map((d) => ({ docId: d.id, data: d.data() as Record<string, unknown> }))
    .sort((a, b) => (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0));
}

/** Who launched the batch (the batch record's `operator`), or null. */
export async function fetchBatchOperator(db: Firestore, batchId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, RESEARCH_BATCHES_COLLECTION, batchId));
  const operator = snap.exists() ? (snap.data() as { operator?: unknown }).operator : undefined;
  return typeof operator === 'string' ? operator : null;
}

// ---------------------------------------------------------------------------
// JSONL
// ---------------------------------------------------------------------------

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** One line per record: `_doc_id` plus every stored field, keys sorted. */
export function toJsonl(docs: ExportedDoc[]): string {
  return docs.map((d) => JSON.stringify(sortKeysDeep({ _doc_id: d.docId, ...d.data }))).join('\n') + (docs.length ? '\n' : '');
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Column order of the reading CSV. Translation-specific columns are blank
 *  for other record kinds. */
export const CSV_COLUMNS = [
  'record_id',
  'doc_id',
  'batch_id',
  'experiment',
  'kind',
  'cell',
  'replicate_index',
  'meme_id',
  'language',
  'model_id',
  'model_provider',
  'status',
  'pass1_input_mode',
  'pass1_freeze_method',
  'prefill',
  'run_operator',
  'pass2_operator',
  'cutter',
  'cutter_proportions',
  'cutter_position',
  'cutter_rotation',
  'targets',
  'magnitude',
  'decay',
  'confidence_rhetorical_clarity',
  'confidence_site_resonance',
  'confidence_affective_coherence',
  'confidence_operational_specificity',
  'pass1_meme_summary',
  'attempts',
  'cost_usd_estimate',
  'usage_input_tokens',
  'usage_output_tokens',
  'usage_cache_creation_input_tokens',
  'usage_cache_read_input_tokens',
  'created_at',
  'failure_stage',
  'failure_reason',
  'baseline_tag',
] as const;

type Row = Record<(typeof CSV_COLUMNS)[number], string>;

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** "a" | "c" from the cell-identity document id (…__cell-<x>__r<n>); blank
 *  for record kinds without cells. */
export function cellFromDocId(docId: string): string {
  return docId.match(/__cell-([a-z])__r\d+$/)?.[1] ?? '';
}

export function recordToRow(d: ExportedDoc, runOperator: string | null): Row {
  const r = d.data;
  const model = obj(r.model);
  const payload = obj(r.payload);
  const pass2 = obj(obj(payload.pass2).parsed);
  const pass1 = obj(obj(payload.pass1).parsed);
  const cutter = obj(pass2.cutter);
  const confidence = obj(pass2.confidence_vector);
  const usage = obj(r.usage);
  const failure = obj(payload.failure);
  const targets = Array.isArray(pass2.targets) ? (pass2.targets as unknown[]).map(str).join('; ') : '';
  return {
    record_id: str(r.record_id),
    doc_id: d.docId,
    batch_id: str(r.batch_id),
    experiment: str(r.experiment),
    kind: str(r.kind),
    cell: cellFromDocId(d.docId),
    replicate_index: str(r.replicate_index),
    meme_id: str(payload.meme_id),
    language: str(payload.language),
    model_id: str(model.id),
    model_provider: str(model.provider),
    status: str(payload.parse_status),
    pass1_input_mode: str(payload.pass1_input_mode),
    pass1_freeze_method: str(payload.pass1_freeze_method),
    prefill: str(payload.prefill),
    run_operator: str(runOperator),
    pass2_operator: str(pass2.operator),
    cutter: str(cutter.type),
    cutter_proportions: str(cutter.proportions),
    cutter_position: str(cutter.position),
    cutter_rotation: str(cutter.rotation),
    targets,
    magnitude: str(pass2.magnitude),
    decay: str(pass2.decay),
    confidence_rhetorical_clarity: str(confidence.rhetorical_clarity),
    confidence_site_resonance: str(confidence.site_resonance),
    confidence_affective_coherence: str(confidence.affective_coherence),
    confidence_operational_specificity: str(confidence.operational_specificity),
    pass1_meme_summary: str(pass1.meme_summary),
    attempts: Array.isArray(payload.attempts) ? String(payload.attempts.length) : '',
    cost_usd_estimate: str(r.cost_usd_estimate),
    usage_input_tokens: str(usage.input_tokens),
    usage_output_tokens: str(usage.output_tokens),
    usage_cache_creation_input_tokens: str(usage.cache_creation_input_tokens),
    usage_cache_read_input_tokens: str(usage.cache_read_input_tokens),
    created_at: str(r.created_at),
    failure_stage: str(failure.stage),
    failure_reason: str(failure.message),
    baseline_tag: str(r.baseline_tag),
  };
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

/** RFC 4180 CSV with CRLF line ends and a UTF-8 byte-order mark, so
 *  spreadsheet apps open the Hebrew text correctly without an import step. */
export function toCsv(docs: ExportedDoc[], runOperator: string | null): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const d of docs) {
    const row = recordToRow(d, runOperator);
    lines.push(CSV_COLUMNS.map((c) => csvField(row[c])).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export const RESEARCH_DATA_DIR = 'research-data';

export interface BatchExportResult {
  dir: string;
  jsonlPath: string;
  csvPath: string;
  recordCount: number;
}

/** batch ids become folder and file names — refuse anything path-like. */
function assertSafeBatchId(batchId: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(batchId) || batchId.startsWith('.')) {
    throw new Error(`batch id "${batchId}" is not safe to use as a folder name`);
  }
}

/** Writes both files for one batch under <root>/research-data/<batch_id>/,
 *  replacing whatever was there. */
export function writeBatchExport(
  root: string,
  batchId: string,
  docs: ExportedDoc[],
  runOperator: string | null,
): BatchExportResult {
  assertSafeBatchId(batchId);
  const dir = path.join(root, RESEARCH_DATA_DIR, batchId);
  fs.mkdirSync(dir, { recursive: true });
  const jsonlPath = path.join(dir, `${batchId}.jsonl`);
  const csvPath = path.join(dir, `${batchId}.csv`);
  fs.writeFileSync(jsonlPath, toJsonl(docs));
  fs.writeFileSync(csvPath, toCsv(docs, runOperator));
  return { dir, jsonlPath, csvPath, recordCount: docs.length };
}

/** Read the batch from Firestore and write its export. Refuses an empty
 *  batch (a typo'd id would otherwise produce an empty "export"). */
export async function exportBatch(db: Firestore, batchId: string, root: string): Promise<BatchExportResult> {
  assertSafeBatchId(batchId);
  const docs = await fetchBatchRecords(db, batchId);
  if (docs.length === 0) throw new Error(`no research_records found for batch ${batchId} — nothing to export`);
  const runOperator = await fetchBatchOperator(db, batchId);
  return writeBatchExport(root, batchId, docs, runOperator);
}
