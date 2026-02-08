import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ArchthesisMeme, CuboidMemeInput, FetchMemeByIdResponse } from '../src/types/archthesis';

/**
 * GET /api/fetch-meme-by-id?id=meme-1707234567890-abc123def456
 *
 * Returns a single meme with its pre-mapped cuboid input fields.
 * Uses Firestore REST API directly — no firebase-admin needed.
 */

const PROJECT_ID = 'adaptivememeticarchitect-2776f';
const API_KEY = 'AIzaSyCsb6uQgANSQSnCp6kPhFX7I3TG_PQCd3o';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function extractValue(field: any): any {
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

function likesToEngagement(likes: number): number {
  if (likes <= 0) return 0;
  const scaled = (Math.log10(likes + 1) / Math.log10(1000)) * 100;
  return Math.min(100, Math.round(scaled));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const memeId = req.query.id as string;
  if (!memeId) {
    return res.status(400).json({ error: 'id query parameter is required' });
  }

  try {
    const docUrl = `${FIRESTORE_URL}/memes/${encodeURIComponent(memeId)}?key=${API_KEY}`;
    const response = await fetch(docUrl);

    if (response.status === 404) {
      return res.status(404).json({ error: 'Meme not found' });
    }
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firestore fetch failed (${response.status}): ${errText}`);
    }

    const doc = await response.json();
    const fields = doc.fields || {};
    const nameParts = (doc.name as string).split('/');
    const id = nameParts[nameParts.length - 1];

    const meme: ArchthesisMeme = {
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

    // Map to cuboid input
    const parts: string[] = [];
    const memeText = meme.memeText?.trim();
    if (memeText) {
      parts.push(memeText);
    } else {
      const combined = [meme.topText, meme.bottomText].filter(Boolean).join(' / ');
      if (combined) parts.push(combined);
    }
    if (meme.description?.trim()) parts.push(`Description: ${meme.description.trim()}`);
    if (meme.tags.length > 0) parts.push(`Tags: ${meme.tags.join(', ')}`);
    if (meme.username?.trim()) parts.push(`Created by: ${meme.username.trim()}`);

    const cuboidInput: CuboidMemeInput = {
      memeDescription: parts.join('\n') || 'Untitled meme',
      locationTag: meme.location?.display_name || null,
      engagementLevel: likesToEngagement(meme.likes),
    };

    const payload: FetchMemeByIdResponse = { meme, cuboidInput };
    return res.status(200).json(payload);
  } catch (error) {
    console.error('fetch-meme-by-id error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch meme',
    });
  }
}
