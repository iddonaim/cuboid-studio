/**
 * Composition pin files (BASELINE-1 ruling, 2026-10-11).
 *
 * A pin file is a read-only dump of one stored composition
 * (projects/{project}/sites/{site}/compositions/{id}), made by its owner
 * (the research identity cannot read projects). It carries what an E2 batch
 * needs to translate against that composition:
 *
 *   - site_context: the composition's siteContextSnapshot, verbatim — the
 *     exact object the app makes the active site context when the
 *     composition is restored, and so the exact object a translation request
 *     sends. The harness serializes it the way the handler does
 *     (JSON.stringify(…, null, 2)), and site_context_hash is the sha256 of
 *     that string.
 *   - composition_id / target_cube_id → every record's composition_ref /
 *     target_cube. The shipped translation request carries neither; they are
 *     recorded conditions, not prompt inputs.
 *   - images: the encode photos' storage paths and sha256 of the
 *     full-resolution bytes (provenance — E2 does not send them).
 *   - document_sha256: hash of the whole stored document at dump time.
 */

import fs from 'node:fs';
import path from 'node:path';
import { sha256HexOfString } from '../../../src/research/hashing.js';

export const COMPOSITION_PIN_SCHEMA = 'cuboid-composition-pin/v1';

/** The handler refuses larger site contexts (api/translate-meme.ts,
 *  MAX_SITE_CONTEXT_CHARS) — a pinned one must be sendable by the app. */
const MAX_SITE_CONTEXT_CHARS = 32_000;

export interface CompositionPinImage {
  id: string;
  is_primary: boolean;
  storage_path: string | null;
  sha256: string | null;
  bytes: number | null;
  thumbnail_sha256: string;
  error: string | null;
}

export interface CompositionPin {
  schema: typeof COMPOSITION_PIN_SCHEMA;
  exported_at: string;
  project_id: string;
  site_id: string;
  composition_id: string;
  name: string;
  created_at: number;
  updated_at: number | null;
  document_sha256: string;
  storage_bucket: string;
  target_cube_id: string | null;
  encode: { model: string | null; prompt_version: string | null; mode: string | null };
  images: CompositionPinImage[];
  site_context: Record<string, unknown>;
}

/** What a batch takes from a pin: the prompt's site context string and the
 *  identity recorded on every record and in the batch manifest. */
export interface LoadedComposition {
  pin: CompositionPin;
  /** Repo-relative path of the pin file. */
  file: string;
  /** sha256 of the pin file's bytes. */
  file_sha256: string;
  /** Exactly the site-context string the prompt carries. */
  siteContextStr: string;
  /** sha256 of siteContextStr. */
  site_context_hash: string;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function parseCompositionPin(json: string, file: string): CompositionPin {
  const pin = JSON.parse(json) as CompositionPin;
  const fail = (msg: string): never => {
    throw new Error(`composition pin ${file}: ${msg}`);
  };
  if (pin.schema !== COMPOSITION_PIN_SCHEMA) fail(`schema must be "${COMPOSITION_PIN_SCHEMA}"`);
  for (const key of ['project_id', 'site_id', 'composition_id', 'document_sha256'] as const) {
    if (!isStr(pin[key])) fail(`${key} is required`);
  }
  if (!(pin.target_cube_id === null || isStr(pin.target_cube_id))) fail('target_cube_id must be a string or null');
  if (!pin.site_context || typeof pin.site_context !== 'object' || Array.isArray(pin.site_context)) {
    fail('site_context must be an object — a composition without a site-context snapshot cannot pin one');
  }
  if (!Array.isArray(pin.images)) fail('images must be an array');
  for (const img of pin.images) {
    if (img.storage_path && !isStr(img.sha256)) {
      fail(`image ${img.id} has a storage path but no content hash${img.error ? ` (${img.error})` : ''} — re-run the dump`);
    }
  }
  return pin;
}

export function loadCompositionPin(repoRoot: string, file: string): Promise<LoadedComposition> {
  const raw = fs.readFileSync(path.resolve(repoRoot, file), 'utf-8');
  return loadCompositionPinFromString(raw, file);
}

export async function loadCompositionPinFromString(raw: string, file: string): Promise<LoadedComposition> {
  const pin = parseCompositionPin(raw, file);
  // Same serialization as the handler's site-context injection.
  const siteContextStr = JSON.stringify(pin.site_context, null, 2);
  if (siteContextStr.length > MAX_SITE_CONTEXT_CHARS) {
    throw new Error(
      `composition pin ${file}: site context is ${siteContextStr.length} chars — the app refuses more than ` +
      `${MAX_SITE_CONTEXT_CHARS}, so no app translation could carry it`,
    );
  }
  return {
    pin,
    file,
    file_sha256: await sha256HexOfString(raw),
    siteContextStr,
    site_context_hash: await sha256HexOfString(siteContextStr),
  };
}
