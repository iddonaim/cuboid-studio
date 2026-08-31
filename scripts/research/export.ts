/**
 * JSONL export of research_records (Milestone 1).
 *
 *   npm run research:export -- [--batch <batch_id>] [--experiment E2]
 *                              [--kind translation] [--out records.jsonl]
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
import { RESEARCH_RECORDS_COLLECTION } from '../../src/research/types.js';
import { initHeadlessFirebase } from './lib/headlessFirebase.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      batch: { type: 'string' },
      experiment: { type: 'string' },
      kind: { type: 'string' },
      out: { type: 'string' },
    },
  });

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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
