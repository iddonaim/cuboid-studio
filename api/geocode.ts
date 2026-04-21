import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/geocode?q=<address>
 *
 * Proxies geocoding requests to Nominatim server-side.
 * Needed because Nominatim requires a custom User-Agent header
 * (which browsers cannot set on fetch) and has inconsistent CORS.
 *
 * Nominatim's usage policy asks for ≤1 request per second. We cannot
 * enforce that reliably from a serverless runtime (each lambda instance
 * has its own memory, so an in-process counter is meaningless under
 * concurrency). The UI gates geocoding behind an explicit button press,
 * which keeps traffic well below the limit in practice. If this route is
 * ever exposed to untrusted callers, move rate limiting to a shared store
 * (Upstash / Redis / KV) before relying on the limit.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = req.query.q as string;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'q query parameter is required' });
  }

  if (query.length > 512) {
    return res.status(400).json({ error: 'q too long (max 512 chars)' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CuboidStudio/1.0 (topological-translation-thesis; iddonaim@gmail.com)',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Nominatim error (${response.status}): ${errText}`);
    }

    const results = await response.json();

    if (!Array.isArray(results) || results.length === 0) {
      return res.status(404).json({ error: 'No results found' });
    }

    const first = results[0];
    return res.status(200).json({
      lat: first.lat,
      lng: first.lon,
      display_name: first.display_name,
    });
  } catch (error) {
    console.error('Geocode proxy error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Geocoding failed',
    });
  }
}
