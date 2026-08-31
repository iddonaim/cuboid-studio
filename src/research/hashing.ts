/**
 * Content-hash utilities for research_records (spec principle 2:
 * "Hash, don't trust labels").
 *
 * Everything here is deterministic and reproducible across runs and machines:
 * objects are serialized with recursively key-sorted JSON before hashing, so
 * insertion order never changes a hash. sha256 comes from WebCrypto
 * (crypto.subtle), which exists in both the browser and Node ≥ 18 — this
 * module stays importable from app code and from the headless harness alike.
 */

const subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** sha256 hex of raw bytes (input images, prefill text as bytes, …). */
export async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
  if (!subtle) throw new Error('WebCrypto (crypto.subtle) unavailable in this runtime');
  // Copy into a fresh ArrayBuffer so a view over a larger buffer can't leak
  // neighbouring bytes into the digest.
  const copy = new Uint8Array(bytes);
  return toHex(await subtle.digest('SHA-256', copy));
}

/** sha256 hex of a UTF-8 string (prompt files, raw model text, prefills). */
export async function sha256HexOfString(text: string): Promise<string> {
  return sha256HexOfBytes(new TextEncoder().encode(text));
}

/**
 * Deterministic JSON serialization: recursively key-sorted objects, arrays in
 * order. `undefined` values are dropped (matching JSON.stringify and the
 * Firestore write path). Throws on values JSON cannot carry losslessly
 * (functions, bigints, circular references) rather than hashing a lie.
 */
export function canonicalJson(value: unknown): string {
  const seen = new Set<object>();

  const walk = (v: unknown): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'number') {
      if (!Number.isFinite(v as number)) {
        throw new Error(`canonicalJson: non-finite number (${String(v)}) cannot be hashed`);
      }
      return v;
    }
    if (t === 'undefined') return undefined;
    if (t === 'function' || t === 'bigint' || t === 'symbol') {
      throw new Error(`canonicalJson: ${t} values cannot be hashed`);
    }
    if (Array.isArray(v)) {
      if (seen.has(v)) throw new Error('canonicalJson: circular reference');
      seen.add(v);
      // JSON.stringify turns undefined array items into null; mirror that.
      const out = v.map((item) => {
        const w = walk(item);
        return w === undefined ? null : w;
      });
      seen.delete(v);
      return out;
    }
    if (t === 'object') {
      // Only plain objects: a Date/Map/Set/class instance would serialize by
      // its enumerable own keys (usually '{}'), silently collapsing distinct
      // values onto one hash. Refuse instead of hashing a lie.
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) {
        throw new Error(
          `canonicalJson: non-plain object (${(v as object).constructor?.name ?? 'unknown'}) cannot be hashed — serialize it explicitly first`,
        );
      }
      if (seen.has(v as object)) throw new Error('canonicalJson: circular reference');
      seen.add(v as object);
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src).sort()) {
        const w = walk(src[key]);
        if (w !== undefined) out[key] = w;
      }
      seen.delete(v as object);
      return out;
    }
    throw new Error(`canonicalJson: unsupported value of type ${t}`);
  };

  const walked = walk(value);
  if (walked === undefined) {
    throw new Error('canonicalJson: top-level value serializes to nothing');
  }
  return JSON.stringify(walked);
}

/** sha256 hex of the canonical (key-sorted) JSON form of a value. */
export async function sha256HexOfCanonicalJson(value: unknown): Promise<string> {
  return sha256HexOfString(canonicalJson(value));
}

// ---------------------------------------------------------------------------
// Named wrappers for the spec's hashed inputs
// ---------------------------------------------------------------------------

/** Prompt file: hash of the raw file text, before any slot filling. */
export const hashPromptFile = sha256HexOfString;

/** Lexicon (spatial or translation): deterministic key-sorted serialization. */
export const hashLexicon = sha256HexOfCanonicalJson;

/** Site context: deterministic serialization of the stored object. */
export const hashSiteContext = sha256HexOfCanonicalJson;

/** Input image: hash of the bytes themselves, not the URL. */
export const hashImageBytes = sha256HexOfBytes;

// ---------------------------------------------------------------------------
// Meme content hash — wire truth, not the declared type
// ---------------------------------------------------------------------------

/**
 * Meme document fields that are mutable state rather than content, excluded
 * from the content hash so a like or an admin hide/show doesn't change a
 * meme's identity between runs:
 *   - likes   — mutated by like/unlike; captured separately as
 *               engagement_at_run on the translation payload
 *   - hidden  — admin moderation toggle
 *   - timestamp — Firestore serverTimestamp twin of createdAt (createdAt,
 *               the client ISO string the read path actually orders and
 *               reports on, stays in the hash)
 */
export const MEME_MUTABLE_FIELDS = ['likes', 'hidden', 'timestamp'] as const;

export interface MemeContentHashResult {
  hash: string;
  /** The stored field names the hash covered, sorted — recorded in the batch
   *  record so every hash is auditable. */
  covered_fields: string[];
}

/**
 * Content hash over what the meme document actually stores — the wire shape —
 * not over the declared ArchthesisMeme type.
 *
 * `topText`, `bottomText` and `userId` are ghost fields: declared in the
 * types, never written by current archthesis publish code (cross-system
 * structure record, docs/SYSTEM-STRUCTURE.md landing on cuboid-studio PR
 * #152 — Layer 1 §2, findings 1–2). They are therefore NOT
 * given defaulted values here the way /api/fetch-memes' docToMeme does;
 * a doc that doesn't store them isn't hashed as if it stored ''. A legacy doc
 * that really carries them has them hashed like any other stored content.
 *
 * Pass the RAW decoded document fields (e.g. Firestore REST fields through
 * extractValue), never the docToMeme output — docToMeme injects the
 * declared-type defaults this hash exists to avoid.
 */
export async function hashMemeContent(
  rawDocFields: Record<string, unknown>,
): Promise<MemeContentHashResult> {
  const content: Record<string, unknown> = {};
  for (const key of Object.keys(rawDocFields)) {
    if ((MEME_MUTABLE_FIELDS as readonly string[]).includes(key)) continue;
    if (rawDocFields[key] === undefined) continue;
    content[key] = rawDocFields[key];
  }
  return {
    hash: await sha256HexOfCanonicalJson(content),
    covered_fields: Object.keys(content).sort(),
  };
}
