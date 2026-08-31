/**
 * Append-only rules verification against the Firestore emulator (DoD c),
 * plus the frozen-input round-trip THROUGH Firestore (DoD d, storage form).
 *
 * Runs only when the emulator is reachable:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test
 * or via the wrapper script:
 *   npm run test:rules
 * (starts the emulator with firebase-tools, runs this file, tears down).
 *
 * Verifies, against cuboid-studio/firestore.rules (the reference copy —
 * archthesis/firestore.rules carries the deployed twin, kept in sync by R5):
 *   - the research identity (custom claim research: true) can create;
 *   - NOBODY can update or delete — research, admin, or anyone (append-only);
 *   - other identities (anon, plain signed-in) cannot create or read.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { ResearchRecord, TranslationPayload } from '../../src/research/types';
import { PHASE0_ONTOLOGY } from '../../src/research/ontology';
import { writeResearchRecord } from '../../src/research/writeResearchRecord';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

const REPO_ROOT = path.resolve(__dirname, '../..');

function sampleRecord(recordId: string): ResearchRecord {
  const payload: TranslationPayload = {
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
    raw_response: '[{"pass":1,"meme_summary":"x"},{"pass":2}]',
    attempts: [],
    pass1: { raw: '{"pass":1,"meme_summary":"x"}', parsed: null },
    pass2: { raw: '{"pass":2}', parsed: null },
    parse_status: 'ok',
    failure: null,
  };
  return {
    record_id: recordId,
    batch_id: 'rules-test-000',
    experiment: 'E2',
    kind: 'translation',
    replicate_index: 0,
    created_at: new Date().toISOString(),
    baseline_tag: 'SCAFFOLD-TOY',
    app_commit: 'test-commit',
    regime: {
      prompt_hashes: { two_pass: 'f'.repeat(64) },
      prompt_version_declared: '4',
      grammar_version_declared: '5',
      spatial_lexicon_hash: 'a'.repeat(64),
      translation_lexicon_hash: 'b'.repeat(64),
    },
    model: { id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic', params: { max_tokens: 4096 } },
    declared: { fixed: [], varied: [], stochastic: [], measured: [] },
    timing_ms: {},
    cost_usd_estimate: 0,
    ontology: PHASE0_ONTOLOGY.translation,
    payload,
  };
}

describe.skipIf(!emulatorHost)('research_records rules (emulator)', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, port] = (emulatorHost as string).split(':');
    env = await initializeTestEnvironment({
      projectId: 'rules-test-research',
      firestore: {
        host,
        port: Number(port),
        rules: fs.readFileSync(path.join(REPO_ROOT, 'firestore.rules'), 'utf-8'),
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  const research = () => env.authenticatedContext('research-user', { research: true }).firestore();
  const admin = () => env.authenticatedContext('admin-user', { admin: true }).firestore();
  const plainUser = () => env.authenticatedContext('someone').firestore();
  const anon = () => env.unauthenticatedContext().firestore();

  it('research identity can create; the record round-trips', async () => {
    const db = research();
    // Through the single write path — the same function the harness uses.
    await assertSucceeds(writeResearchRecord(db as never, sampleRecord('rec-create-1'), { docId: 'rec-create-1' }));
    const snap = await getDoc(doc(db, 'research_records', 'rec-create-1'));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.batch_id).toBe('rules-test-000');
  });

  it('append-only: research identity cannot update or delete its own record', async () => {
    const db = research();
    await assertSucceeds(writeResearchRecord(db as never, sampleRecord('rec-immutable-1'), { docId: 'rec-immutable-1' }));
    await assertFails(updateDoc(doc(db, 'research_records', 'rec-immutable-1'), { baseline_tag: 'EDITED' }));
    // setDoc over an existing doc is an update in rules terms — denied too.
    await assertFails(setDoc(doc(db, 'research_records', 'rec-immutable-1'), { overwritten: true }));
    await assertFails(deleteDoc(doc(db, 'research_records', 'rec-immutable-1')));
  });

  it('append-only holds even for the admin claim', async () => {
    await assertSucceeds(writeResearchRecord(research() as never, sampleRecord('rec-immutable-2'), { docId: 'rec-immutable-2' }));
    const db = admin();
    await assertFails(updateDoc(doc(db, 'research_records', 'rec-immutable-2'), { baseline_tag: 'EDITED' }));
    await assertFails(deleteDoc(doc(db, 'research_records', 'rec-immutable-2')));
    await assertFails(setDoc(doc(db, 'research_records', 'rec-admin-create'), { nope: true }));
  });

  it('anonymous and plain signed-in users can neither create nor read', async () => {
    await assertFails(setDoc(doc(anon(), 'research_records', 'rec-anon'), { nope: true }));
    await assertFails(setDoc(doc(plainUser(), 'research_records', 'rec-plain'), { nope: true }));
    await assertFails(getDoc(doc(anon(), 'research_records', 'rec-create-1')));
    await assertFails(getDoc(doc(plainUser(), 'research_records', 'rec-create-1')));
  });

  it('research_batches carries the same append-only regime', async () => {
    const db = research();
    await assertSucceeds(setDoc(doc(db, 'research_batches', 'batch-1'), { batch_id: 'batch-1' }));
    await assertFails(updateDoc(doc(db, 'research_batches', 'batch-1'), { batch_id: 'batch-1b' }));
    await assertFails(deleteDoc(doc(db, 'research_batches', 'batch-1')));
    await assertFails(setDoc(doc(anon(), 'research_batches', 'batch-2'), { nope: true }));
  });

  it('frozen round-trip through storage (DoD d): pin a stored record’s Pass 1 and write the cell-(c) record referencing it', async () => {
    const db = research();
    const stored = sampleRecord('rec-frozen-source');
    await assertSucceeds(writeResearchRecord(db as never, stored, { docId: 'rec-frozen-source' }));

    // Read back and pin — the same resolution run.ts performs.
    const snap = await getDoc(doc(db, 'research_records', 'rec-frozen-source'));
    const data = snap.data() as ResearchRecord;
    const pass1Raw = (data.payload as TranslationPayload).pass1.raw;
    expect(pass1Raw).toBe('{"pass":1,"meme_summary":"x"}');

    const frozen = sampleRecord('rec-frozen-c');
    (frozen.payload as TranslationPayload).pass1_input_mode = `frozen:${data.record_id}`;
    (frozen.payload as TranslationPayload).prefill = true;
    (frozen.payload as TranslationPayload).prefill_content_hash = 'd'.repeat(64);
    await assertSucceeds(writeResearchRecord(db as never, frozen, { docId: 'rec-frozen-c' }));

    const frozenBack = await getDoc(doc(db, 'research_records', 'rec-frozen-c'));
    expect((frozenBack.data() as ResearchRecord as { payload: TranslationPayload }).payload.pass1_input_mode).toBe(
      `frozen:${data.record_id}`,
    );
  });
});

// Visible signal (not a failure) when the file is skipped for lack of an emulator.
describe.skipIf(Boolean(emulatorHost))('research_records rules (emulator not running)', () => {
  it('skipped — set FIRESTORE_EMULATOR_HOST or use npm run test:rules', () => {
    expect(true).toBe(true);
  });
});
