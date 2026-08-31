/**
 * Phase 0 corpus reader.
 *
 * The corpus source is the RAW `memes` collection, read through the Firestore
 * REST listDocuments endpoint — NOT /api/fetch-memes. That endpoint's query
 * orders by `createdAt`, and Firestore's orderBy silently EXCLUDES any
 * document missing the ordered field (cross-system structure record,
 * docs/SYSTEM-STRUCTURE.md landing on PR #152 — Layer 1 §2, finding 3), so a
 * corpus drawn through it could silently under-count. listDocuments pages
 * the whole collection with no ordering requirement.
 *
 * The harness records the raw collection count next to the count it actually
 * used (after the hidden-meme filter) in the batch record.
 */

import {
  API_KEY,
  FIRESTORE_URL,
  docToMeme,
  extractValue,
} from '../../../api/fetch-memes.js';
import type { ArchthesisMeme } from '../../../src/types/archthesis';
import { hashMemeContent } from '../../../src/research/hashing.js';

export interface CorpusMeme {
  id: string;
  /** Raw decoded document fields, exactly as stored (no declared-type
   *  defaults injected) — the input to the content hash. */
  rawFields: Record<string, unknown>;
  /** App-shaped view (docToMeme defaults) for input mapping only. */
  meme: ArchthesisMeme;
  content_hash: string;
  /** Stored field names the hash covered — auditable in the batch record. */
  covered_fields: string[];
  likes_at_read: number;
}

export interface Corpus {
  source: string;
  raw_collection_count: number;
  used_count: number;
  filter: string;
  memes: CorpusMeme[];
}

const CORPUS_FILTER_DESCRIPTION = 'exclude hidden === true (admin-moderated memes are not platform corpus)';

interface RestDocument {
  name: string;
  fields?: Record<string, unknown>;
}

/** Decode a REST document's fields to plain values, keeping only fields the
 *  document actually stores. */
function decodeRawFields(restDoc: RestDocument): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(restDoc.fields || {})) {
    out[key] = extractValue(value);
  }
  return out;
}

function docId(restDoc: RestDocument): string {
  const parts = restDoc.name.split('/');
  return parts[parts.length - 1];
}

async function buildCorpusMeme(restDoc: RestDocument): Promise<CorpusMeme> {
  const rawFields = decodeRawFields(restDoc);
  const { hash, covered_fields } = await hashMemeContent(rawFields);
  const likes = typeof rawFields.likes === 'number' ? rawFields.likes : 0;
  return {
    id: docId(restDoc),
    rawFields,
    meme: docToMeme(restDoc),
    content_hash: hash,
    covered_fields,
    likes_at_read: likes,
  };
}

/**
 * Lists every document in the raw `memes` collection (paged). Returns the
 * full corpus with raw and used counts.
 */
export async function loadCorpusFromFirestore(options: {
  /** Restrict to these meme ids after counting the raw collection. */
  memeIds?: string[] | null;
} = {}): Promise<Corpus> {
  const all: RestDocument[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${FIRESTORE_URL}/memes`);
    url.searchParams.set('key', API_KEY);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firestore listDocuments failed (${response.status}): ${errText}`);
    }
    const data = (await response.json()) as { documents?: RestDocument[]; nextPageToken?: string };
    all.push(...(data.documents || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  const rawCount = all.length;

  let selected = all;
  const idFilterNote: string[] = [];
  if (options.memeIds && options.memeIds.length > 0) {
    const wanted = new Set(options.memeIds);
    selected = all.filter((d) => wanted.has(docId(d)));
    const missing = options.memeIds.filter((id) => !selected.some((d) => docId(d) === id));
    if (missing.length > 0) {
      throw new Error(`corpus meme_ids not found in the raw memes collection: ${missing.join(', ')}`);
    }
    idFilterNote.push(`restricted to ${options.memeIds.length} configured meme_ids`);
  }

  const visible: RestDocument[] = [];
  const hiddenExplicit: string[] = [];
  for (const d of selected) {
    const fields = decodeRawFields(d);
    if (fields.hidden === true) {
      // An explicitly configured meme that turns out hidden is a conflict to
      // surface, never a silent shrink of the requested matrix.
      if (options.memeIds && options.memeIds.includes(docId(d))) hiddenExplicit.push(docId(d));
      continue;
    }
    visible.push(d);
  }
  if (hiddenExplicit.length > 0) {
    throw new Error(
      `configured meme_ids are hidden (admin-moderated) and excluded by the corpus filter: ${hiddenExplicit.join(', ')} — ` +
      'remove them from the config or unhide them before running',
    );
  }

  const memes: CorpusMeme[] = [];
  for (const d of visible) memes.push(await buildCorpusMeme(d));
  memes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    source:
      'firestore:memes raw collection via REST listDocuments (not /api/fetch-memes — its orderBy createdAt drops docs missing the field)',
    raw_collection_count: rawCount,
    used_count: memes.length,
    filter: [CORPUS_FILTER_DESCRIPTION, ...idFilterNote].join('; '),
    memes,
  };
}

/**
 * Offline corpus for dry runs and tests: a JSON file of raw meme documents
 * `[{ id, fields: { imageUrl: "...", ... } }]` with plain (already decoded)
 * field values. No network, no model calls.
 */
export async function loadCorpusFromFile(
  fileContents: string,
  filePath: string,
): Promise<Corpus> {
  const docs = JSON.parse(fileContents) as Array<{ id: string; fields: Record<string, unknown> }>;
  if (!Array.isArray(docs)) throw new Error(`corpus file ${filePath} must be a JSON array`);

  const memes: CorpusMeme[] = [];
  for (const d of docs) {
    if (d.fields?.hidden === true) continue;
    const { hash, covered_fields } = await hashMemeContent(d.fields);
    const likes = typeof d.fields.likes === 'number' ? d.fields.likes : 0;
    memes.push({
      id: d.id,
      rawFields: d.fields,
      meme: docToMeme({
        name: `projects/x/databases/(default)/documents/memes/${d.id}`,
        // Re-encode plain values just far enough for docToMeme's extractValue:
        fields: Object.fromEntries(
          Object.entries(d.fields).map(([k, v]) => [k, encodePlainValue(v)]),
        ),
      }),
      content_hash: hash,
      covered_fields,
      likes_at_read: likes,
    });
  }
  memes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    source: `corpus file ${filePath} (offline fixture — raw collection not consulted)`,
    raw_collection_count: docs.length,
    used_count: memes.length,
    filter: CORPUS_FILTER_DESCRIPTION,
    memes,
  };
}

/** Minimal plain-value → Firestore-REST-value encoder for fixture corpora. */
function encodePlainValue(v: unknown): unknown {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodePlainValue) } };
  if (typeof v === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, encodePlainValue(val)]),
        ),
      },
    };
  }
  throw new Error(`corpus fixture: cannot encode value of type ${typeof v}`);
}
