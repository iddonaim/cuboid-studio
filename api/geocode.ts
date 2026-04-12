import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/geocode?q=<address>
 *
 * Proxies geocoding requests to Nominatim server-side.
 * Needed because Nominatim requires a custom User-Agent header
 * (which browsers cannot set on fetch) and has inconsistent CORS.
 *
 * Rate limited to 1 request per second per Nominatim usage policy.
 */

let lastRequestTime = 0;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = req.query.q as string;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'q query parameter is required' });
  }

  // Rate limit: 1 request per second
  const now = Date.now();
  if (now - lastRequestTime < 1000) {
    return res.status(429).json({ error: 'Rate limited — max 1 request per second' });
  }
  lastRequestTime = now;

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
