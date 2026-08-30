/**
 * The single write path into the `research_records` collection.
 *
 * Contract (handoff Milestone 1):
 *   - schema-invalid ENVELOPES throw — nothing reaches Firestore;
 *   - schema-invalid PAYLOADS are still written, coerced to
 *     parse_status "failed" with the original payload preserved
 *     (spec principle 4: failures are data);
 *   - the collection is append-only: creates only, and firestore.rules deny
 *     update/delete to everyone (the client SDK has no create-only primitive,
 *     so overwrites are stopped server-side by the rules, not here).
 *
 * The Firestore instance is injected rather than imported from
 * src/lib/firebase.ts: the app's init reads import.meta.env (Vite-only),
 * while the headless harness initializes its own app from process.env and the
 * emulator tests inject a rules-unit-testing context. One write path, three
 * callers.
 */

import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { RESEARCH_RECORDS_COLLECTION, type ResearchRecord } from './types';
import { validateEnvelope, validatePayload } from './validate';

/**
 * Validates a record and returns the exact object the write path would store.
 * Pure — exported separately so validation behavior is testable without a
 * Firestore instance.
 *
 * Throws on an invalid envelope. An invalid payload comes back coerced:
 * original payload fields kept verbatim (JSON-representable portion),
 * parse_status forced to "failed", the schema error recorded in `failure`.
 */
export function prepareResearchRecord(record: ResearchRecord): ResearchRecord {
  const { payload, ...envelope } = record;

  const envelopeError = validateEnvelope(envelope);
  if (envelopeError) {
    throw new Error(`research_records envelope invalid: ${envelopeError}`);
  }

  let storedPayload = payload;
  const payloadError = validatePayload(record.kind, payload);
  if (payloadError) {
    const original = (payload ?? {}) as unknown as Record<string, unknown>;
    const originalFailure = original.failure as { message?: string } | null | undefined;
    storedPayload = {
      ...original,
      parse_status: 'failed',
      failure: {
        stage: 'schema',
        message:
          `payload failed ${record.kind} schema validation: ${payloadError}` +
          (originalFailure && typeof originalFailure.message === 'string'
            ? `; original failure: ${originalFailure.message}`
            : ''),
        http_status: null,
      },
    } as ResearchRecord['payload'];
  }

  // Firestore rejects `undefined` field values; JSON round-trip drops them
  // (and anything else JSON cannot carry) from arbitrary caller payloads.
  return JSON.parse(JSON.stringify({ ...envelope, payload: storedPayload })) as ResearchRecord;
}

export interface WriteResearchRecordOptions {
  /**
   * Firestore document id. Defaults to record_id. The harness passes its
   * deterministic cell id here so a resumed batch can find completed cells
   * without a schema field for cell identity (see scripts/research/lib/matrix.ts).
   */
  docId?: string;
}

/** Validates and writes one record. Returns the document id written. */
export async function writeResearchRecord(
  db: Firestore,
  record: ResearchRecord,
  options: WriteResearchRecordOptions = {},
): Promise<string> {
  const prepared = prepareResearchRecord(record);
  const docId = options.docId ?? prepared.record_id;
  await setDoc(doc(db, RESEARCH_RECORDS_COLLECTION, docId), prepared);
  return docId;
}

/** Resume support: does a record already exist under this document id? */
export async function researchRecordExists(db: Firestore, docId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, RESEARCH_RECORDS_COLLECTION, docId));
  return snap.exists();
}
