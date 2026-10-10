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

// The REST constants + decoder live in src/research/firestoreRest.ts (shared
// with the in-app frozen-state capture and the research harness — one
// decoder, so wire-truth content hashes can never drift). Re-exported here
// so existing importers (scripts/research/lib/corpus.ts) keep working. See
// the cross-system structure record (docs/SYSTEM-STRUCTURE.md, landing on PR
// #152; Layer 1 §2) for why research reads must NOT go through this
// handler's query (orderBy createdAt silently drops docs missing the field).
import {
  API_KEY,
  extractValue,
  FIRESTORE_URL,
  PROJECT_ID,
} from '../src/research/firestoreRest.js';

export { API_KEY, extractValue, FIRESTORE_URL, PROJECT_ID };

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
