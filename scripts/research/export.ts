/**
 * JSONL export of research_records (Milestone 1).
 *
 *   npm run research:export -- [--batch <batch_id>] [--experiment E2]
 *                              [--kind translation] [--out records.jsonl]
 *
 *   npm run research:export -- --batch <batch_id> --research-data
 *     The batch export protocol (lib/exportBatch.ts): rewrites
 *     research-data/<batch_id>/<batch_id>.jsonl + .csv in full from the
 *     database. The same export run.ts --collect performs after every
 *     collect; this form re-exports any batch on demand.
 *
 * One record per line, exactly as stored, plus `_doc_id` (the Firestore
 * document id — the cell identity a resumed batch keys on; the batch record
 * documents the scheme). Without --out, lines go to stdout.
 *
 * Analyses run on these records, never on derived tables trusted as truth
 * (spec principle 1).
 */

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import {
  collection,
  getDocs,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import path from 'node:path';
import { RESEARCH_RECORDS_COLLECTION } from '../../src/research/types.js';
import { exportBatch } from './lib/exportBatch.js';
import { initHeadlessFirebase } from './lib/headlessFirebase.js';

const REPO_ROOT = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '../..');

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      batch: { type: 'string' },
      experiment: { type: 'string' },
      kind: { type: 'string' },
      out: { type: 'string' },
      'research-data': { type: 'boolean' },
    },
  });

  if (values['research-data']) {
    if (!values.batch) throw new Error('--research-data needs --batch <batch_id>');
    if (values.experiment || values.kind || values.out) {
      throw new Error('--research-data exports the whole batch to its fixed location — drop --experiment/--kind/--out');
    }
    const { db } = await initHeadlessFirebase();
    const result = await exportBatch(db, values.batch, REPO_ROOT);
    console.log(`export: ${result.recordCount} records → ${path.relative(REPO_ROOT, result.dir)}/`);
    return;
  }

  if (values.experiment && !['E1', 'E2', 'E3'].includes(values.experiment)) {
    throw new Error('--experiment must be E1, E2 or E3');
  }
  if (values.kind && !['encode', 'translation', 'evolve_step', 'judgment'].includes(values.kind)) {
    throw new Error('--kind must be encode, translation, evolve_step or judgment');
  }

  const { db } = await initHeadlessFirebase();

  const constraints: QueryConstraint[] = [];
  if (values.batch) constraints.push(where('batch_id', '==', values.batch));
  if (values.experiment) constraints.push(where('experiment', '==', values.experiment));
  if (values.kind) constraints.push(where('kind', '==', values.kind));

  const snapshot = await getDocs(query(collection(db, RESEARCH_RECORDS_COLLECTION), ...constraints));

  const lines: string[] = [];
  for (const docSnap of snapshot.docs) {
    lines.push(JSON.stringify({ _doc_id: docSnap.id, ...docSnap.data() }));
  }
  // Deterministic export order: by document id.
  lines.sort();

  const output = lines.join('\n') + (lines.length ? '\n' : '');
  if (values.out) {
    fs.writeFileSync(values.out, output);
    console.error(`${lines.length} records → ${values.out}`);
  } else {
    process.stdout.write(output);
    console.error(`${lines.length} records`);
  }
}

// Exit explicitly: the Firebase client SDK keeps its channel and auth timers
// open after the work is done (same reason as run.ts).
main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
