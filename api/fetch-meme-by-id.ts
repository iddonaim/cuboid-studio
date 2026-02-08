import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getArchthesisFirestore } from '../src/lib/archthesis-firebase';
import { mapMemeToCuboidInput } from '../src/lib/meme-mapper';
import type { ArchthesisMeme, FetchMemeByIdResponse } from '../src/types/archthesis';

/**
 * GET /api/fetch-meme-by-id?id=meme-1707234567890-abc123def456
 *
 * Returns a single meme with its pre-mapped cuboid input fields.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const memeId = req.query.id as string;
  if (!memeId) {
    return res.status(400).json({ error: 'id query parameter is required' });
  }

  try {
    const db = getArchthesisFirestore();
    const doc = await db.collection('memes').doc(memeId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Meme not found' });
    }

    const data = doc.data()!;
    const meme: ArchthesisMeme = {
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

    const cuboidInput = mapMemeToCuboidInput(meme);

    const response: FetchMemeByIdResponse = { meme, cuboidInput };
    return res.status(200).json(response);
  } catch (error) {
    console.error('fetch-meme-by-id error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch meme',
    });
  }
}
