import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ArchthesisMeme, FetchMemesResponse } from '../src/types/archthesis';

/**
 * GET /api/fetch-memes
 *
 * Lists memes from the archthesis Firestore collection via the REST API.
 * No firebase-admin needed — archthesis Firestore rules allow public reads.
 *
 * Query params:
 *   limit   — number of memes to return (default 20, max 50)
 *   offset  — number of (visible, post-filter) memes to skip, for pagination
 *   sort    — "recent" (default), "popular", "oldest"
 *   search  — text search across memeText, topText, bottomText, description
 *   tag     — filter by tag (exact match)
 *
 * Pagination is count-based rather than cursor-based: hidden-meme and search
 * filtering happen here after the Firestore query, so a Firestore cursor
 * wouldn't line up with what the client actually displayed. The collection is
 * small (thesis-scale), so re-reading offset+limit docs per page is fine.
 */

// Exported for the research harness (scripts/research/), which reads the raw
// `memes` collection through the same REST endpoint and decoder — see the
// cross-system structure record (docs/SYSTEM-STRUCTURE.md, landing on PR
// #152; Layer 1 §2) for why it must NOT go through this handler's query
// (orderBy createdAt silently drops docs missing the field).
export const PROJECT_ID = 'adaptivememeticarchitect-2776f';
export const API_KEY = 'AIzaSyCsb6uQgANSQSnCp6kPhFX7I3TG_PQCd3o';
export const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** Extract a typed value from a Firestore REST API field */
export function extractValue(field: any): any {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(extractValue);
  if ('mapValue' in field) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) {
      result[k] = extractValue(v);
    }
    return result;
  }
  if ('nullValue' in field) return null;
  return undefined;
}

/** Convert a Firestore REST document to our ArchthesisMeme type.
 *  NOTE: injects the declared-type defaults ('' for topText/bottomText, etc.)
 *  — fine for app display/input mapping, wrong for content hashing. The
 *  research content hash reads the raw stored fields instead. */
export function docToMeme(doc: any): ArchthesisMeme {
  const fields = doc.fields || {};
  // Document name format: projects/.../documents/memes/{id}
  const nameParts = (doc.name as string).split('/');
  const id = nameParts[nameParts.length - 1];

  return {
    id,
    imageUrl: extractValue(fields.imageUrl) || '',
    topText: extractValue(fields.topText) || '',
    bottomText: extractValue(fields.bottomText) || '',
    memeText: extractValue(fields.memeText) || undefined,
    description: extractValue(fields.description) || undefined,
    tags: extractValue(fields.tags) || [],
    location: extractValue(fields.location) || undefined,
    username: extractValue(fields.username) || undefined,
    likes: extractValue(fields.likes) || 0,
    timestamp: extractValue(fields.createdAt) || extractValue(fields.timestamp) || '',
    userId: extractValue(fields.userId) || undefined,
    hidden: extractValue(fields.hidden) || false,
    originSource: extractValue(fields.originSource) || undefined,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 500));
    const sort = (req.query.sort as string) || 'recent';
    const search = (req.query.search as string)?.toLowerCase().trim();
    const tag = (req.query.tag as string)?.trim();

    // Build a Firestore structured query
    const orderField = sort === 'popular' ? 'likes' : 'createdAt';
    const orderDirection = sort === 'oldest' ? 'ASCENDING' : 'DESCENDING';

    const structuredQuery: any = {
      from: [{ collectionId: 'memes' }],
      orderBy: [{ field: { fieldPath: orderField }, direction: orderDirection }],
      // Fetch everything up to the requested page, plus extra to absorb
      // hidden memes and to answer "has more".
      limit: offset + limit + 10,
    };

    if (tag) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: 'tags' },
          op: 'ARRAY_CONTAINS',
          value: { stringValue: tag },
        },
      };
    }

    const queryUrl = `${FIRESTORE_URL}:runQuery?key=${API_KEY}`;
    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firestore query failed (${response.status}): ${errText}`);
    }

    const results = await response.json();

    // Parse results — each item has a `document` field (or `skippedResults` for empty)
    let memes: ArchthesisMeme[] = results
      .filter((r: any) => r.document)
      .map((r: any) => docToMeme(r.document))
      .filter((m: ArchthesisMeme) => !m.hidden);

    // Client-side text search (Firestore doesn't support full-text search)
    if (search) {
      memes = memes.filter(m => {
        const searchable = [
          m.memeText, m.topText, m.bottomText,
          m.description, m.username,
          m.location?.display_name,
          ...m.tags,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(search);
      });
    }

    const hasMore = memes.length > offset + limit;
    memes = memes.slice(offset, offset + limit);

    const payload: FetchMemesResponse = { memes, hasMore };
    return res.status(200).json(payload);
  } catch (error) {
    console.error('fetch-memes error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch memes',
    });
  }
}
