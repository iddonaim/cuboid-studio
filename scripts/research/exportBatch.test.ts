/**
 * Batch export protocol — file formats only (no Firestore): the JSONL is the
 * full record with stable bytes, the CSV is one readable flat row per record.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cellFromDocId,
  CSV_COLUMNS,
  recordToRow,
  toCsv,
  toJsonl,
  writeBatchExport,
  type ExportedDoc,
} from './lib/exportBatch';

const okDoc: ExportedDoc = {
  docId: 'e2-toy-002__E2__translation__meme-1__anthropic_anthropic~claude-sonnet-4-6__cell-c__r1',
  data: {
    record_id: 'rid-ok',
    batch_id: 'e2-toy-002',
    experiment: 'E2',
    kind: 'translation',
    replicate_index: 1,
    created_at: '2026-10-10T21:04:10.000Z',
    baseline_tag: 'SCAFFOLD-TOY',
    model: { id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic', params: { max_tokens: 4096 } },
    cost_usd_estimate: 0.0183,
    usage: { source: 'anthropic-batch', input_tokens: 5100, output_tokens: 640, cache_creation_input_tokens: 0, cache_read_input_tokens: 3900, calls_covered: 1, calls_total: 1 },
    payload: {
      meme_id: 'meme-1',
      language: null,
      pass1_input_mode: 'frozen:rid-a',
      pass1_freeze_method: 'user_message_v1',
      prefill: false,
      prefill_content_hash: null,
      parse_status: 'ok',
      failure: null,
      raw_response: '{"pass":2}',
      attempts: [{ role: 'initial', raw_response: '{"pass":2}', error: null, timing_ms: 1 }],
      pass1: { raw: '{}', parsed: { pass: 1, meme_summary: 'כשהרויט קורס, "backup", always' } },
      pass2: {
        raw: '{}',
        parsed: {
          pass: 2,
          operator: 'erosion',
          targets: ['adjacency', 'access'],
          magnitude: 0.6,
          decay: 0.2,
          cutter: { type: 'box', proportions: [0.5, 1, 0.25], position: [0, -0.5, 0], rotation: [0, 45, 0] },
          confidence_vector: { rhetorical_clarity: 0.8, site_resonance: 0.4, affective_coherence: 0.7, operational_specificity: 0.6 },
        },
      },
    },
  },
};

const failedDoc: ExportedDoc = {
  docId: 'e2-toy-001__E2__translation__meme-1__anthropic_anthropic~claude-sonnet-4-6__cell-c__r0',
  data: {
    record_id: 'rid-failed',
    batch_id: 'e2-toy-001',
    experiment: 'E2',
    kind: 'translation',
    replicate_index: 0,
    model: { id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic' },
    payload: {
      meme_id: 'meme-1',
      pass1_input_mode: 'frozen:rid-a',
      prefill: true,
      parse_status: 'failed',
      failure: { stage: 'transport', message: 'This model does not support assistant message prefill.\nThe conversation must end with a user message.', http_status: 500 },
      attempts: [{ role: 'initial', raw_response: null, error: 'x', timing_ms: 1 }],
      pass1: { raw: null, parsed: null },
      pass2: { raw: null, parsed: null },
    },
  },
};

/** Minimal RFC 4180 reader for round-trip checks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else field += ch;
  }
  return rows;
}

describe('JSONL (artifact of record)', () => {
  it('keeps every field, adds _doc_id, and is byte-stable regardless of key order', () => {
    const shuffled: ExportedDoc = { docId: okDoc.docId, data: Object.fromEntries(Object.entries(okDoc.data).reverse()) };
    expect(toJsonl([okDoc])).toBe(toJsonl([shuffled]));
    const line = JSON.parse(toJsonl([okDoc]).trim());
    expect(line._doc_id).toBe(okDoc.docId);
    expect(line.payload.raw_response).toBe('{"pass":2}');
    expect(line.payload.attempts).toHaveLength(1);
    const { _doc_id, ...rest } = line;
    expect(rest).toEqual(okDoc.data);
  });
});

describe('CSV (reading copy)', () => {
  it('maps a frozen ok record to flat columns', () => {
    const row = recordToRow(okDoc, 'iddo');
    expect(row).toMatchObject({
      cell: 'c',
      status: 'ok',
      pass1_freeze_method: 'user_message_v1',
      prefill: 'false',
      run_operator: 'iddo',
      pass2_operator: 'erosion',
      cutter: 'box',
      cutter_proportions: '[0.5,1,0.25]',
      targets: 'adjacency; access',
      magnitude: '0.6',
      confidence_site_resonance: '0.4',
      usage_input_tokens: '5100',
      attempts: '1',
      language: '',
      failure_reason: '',
    });
  });

  it('keeps failed records, with their failure reason and blank Pass-2 columns', () => {
    const row = recordToRow(failedDoc, 'iddo');
    expect(row.status).toBe('failed');
    expect(row.prefill).toBe('true');
    expect(row.pass1_freeze_method).toBe('');
    expect(row.failure_stage).toBe('transport');
    expect(row.failure_reason).toContain('does not support assistant message prefill');
    expect(row.cutter).toBe('');
  });

  it('is BOM-prefixed RFC 4180 that round-trips commas, quotes, newlines and Hebrew', () => {
    const csv = toCsv([failedDoc, okDoc], 'iddo');
    expect(csv.startsWith('﻿')).toBe(true);
    const rows = parseCsv(csv.slice(1));
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toHaveLength(CSV_COLUMNS.length);
    const col = (name: string) => CSV_COLUMNS.indexOf(name as (typeof CSV_COLUMNS)[number]);
    expect(rows[1][col('failure_reason')]).toBe(failedDoc.data.payload && (failedDoc.data.payload as { failure: { message: string } }).failure.message);
    expect(rows[2][col('pass1_meme_summary')]).toBe('כשהרויט קורס, "backup", always');
  });

  it('reads the cell from the document id; blank for cell-less kinds', () => {
    expect(cellFromDocId(okDoc.docId)).toBe('c');
    expect(cellFromDocId('e3-toy__E3__evolve_step__state__anthropic_x__r0')).toBe('');
  });
});

describe('writeBatchExport', () => {
  it('writes research-data/<batch>/<batch>.jsonl + .csv and rewrites them in full', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-'));
    const first = writeBatchExport(root, 'e2-toy-002', [okDoc, failedDoc], 'iddo');
    expect(first.jsonlPath).toBe(path.join(root, 'research-data', 'e2-toy-002', 'e2-toy-002.jsonl'));
    expect(first.csvPath).toBe(path.join(root, 'research-data', 'e2-toy-002', 'e2-toy-002.csv'));
    expect(fs.readFileSync(first.jsonlPath, 'utf-8').trim().split('\n')).toHaveLength(2);
    writeBatchExport(root, 'e2-toy-002', [okDoc], 'iddo');
    expect(fs.readFileSync(first.jsonlPath, 'utf-8').trim().split('\n')).toHaveLength(1);
    expect(parseCsv(fs.readFileSync(first.csvPath, 'utf-8').slice(1))).toHaveLength(2);
  });

  it('refuses a path-like batch id', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-'));
    expect(() => writeBatchExport(root, '../escape', [okDoc], null)).toThrow(/not safe/);
  });
});
