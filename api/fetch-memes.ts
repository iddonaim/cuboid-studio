import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getArchthesisFirestore } from '../src/lib/archthesis-firebase';
import { mapMemeToCuboidInput } from '../src/lib/meme-mapper';
import type { ArchthesisMeme, FetchMemesResponse } from '../src/types/archthesis';

/**
 * GET /api/fetch-memes
 *
 * Lists memes from the archthesis Firestore collection.
 *
 * Query params:
 *   limit   — number of memes to return (default 20, max 50)
 *   offset  — pagination cursor: the `timestamp` value of the last meme in previous page
 *   sort    — "recent" (default), "popular", "oldest"
 *   search  — text search across memeText, topText, bottomText, description
 *   tag     — filter by tag (exact match)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getArchthesisFirestore();
    const memesCol = db.collection('memes');

    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const sort = (req.query.sort as string) || 'recent';
    const search = (req.query.search as string)?.toLowerCase().trim();
    const tag = (req.query.tag as string)?.trim();
    const offset = req.query.offset as string | undefined;

    // Build query
    let query = memesCol.where('hidden', '!=', true);

    if (tag) {
      query = query.where('tags', 'array-contains', tag);
    }

    // Sort
    if (sort === 'popular') {
      query = query.orderBy('likes', 'desc');
    } else if (sort === 'oldest') {
      query = query.orderBy('createdAt', 'asc');
    } else {
      query = query.orderBy('createdAt', 'desc');
    }

    // Pagination cursor
    if (offset) {
      query = query.startAfter(offset);
    }

    // Fetch one extra to check if there are more pages
    const snapshot = await query.limit(limit + 1).get();

    let memes: ArchthesisMeme[] = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        imageUrl: data.imageUrl || '',
        topText: data.topText || '',
        bottomText: data.bottomText || '',
        memeText: data.memeText || undefined,
        description: data.description || undefined,
        tags: data.tags || [],
        location: data.location || undefined,
        username: data.username || undefined,
        likes: data.likes || 0,
        timestamp: data.createdAt || data.timestamp || '',
        userId: data.userId || undefined,
        hidden: data.hidden || false,
        originSource: data.originSource || undefined,
      };
    });

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

    const hasMore = memes.length > limit;
    if (hasMore) memes = memes.slice(0, limit);

    const response: FetchMemesResponse = { memes, hasMore };
    return res.status(200).json(response);
  } catch (error) {
    console.error('fetch-memes error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch memes',
    });
  }
}
