import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PoiItem {
  name: string;
  type: string;
  lat: number;
  lng: number;
}

interface RoadItem {
  name: string;
  type: string;
}

export interface ContextPoisResponse {
  transit: PoiItem[];
  education: PoiItem[];
  healthcare: PoiItem[];
  civic: PoiItem[];
  greenSpace: PoiItem[];
  markets: PoiItem[];
  majorRoads: RoadItem[];
}

type OverpassElement = {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const MAX_PER_CATEGORY = 10;

function parseCoord(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

function poiName(tags: Record<string, string> | undefined): string {
  if (!tags) return 'Unnamed';
  return tags.name || tags['name:en'] || tags.operator || tags.brand || 'Unnamed';
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearest<T extends { lat: number; lng: number }>(
  items: T[],
  lat: number,
  lng: number,
  limit: number
): T[] {
  return [...items]
    .sort((a, b) => distanceM(lat, lng, a.lat, a.lng) - distanceM(lat, lng, b.lat, b.lng))
    .slice(0, limit);
}

function buildOverpassQuery(lat: number, lng: number, radius: number): string {
  const around = `(around:${radius},${lat},${lng})`;
  return `
[out:json][timeout:15];
(
  node["amenity"="bus_station"]${around};
  node["highway"="bus_stop"]${around};
  node["railway"="tram_stop"]${around};
  node["railway"="subway_entrance"]${around};
  node["railway"="station"]${around};
  node["amenity"="school"]${around};
  node["amenity"="kindergarten"]${around};
  node["amenity"="university"]${around};
  node["amenity"="college"]${around};
  node["amenity"="hospital"]${around};
  node["amenity"="clinic"]${around};
  node["amenity"="pharmacy"]${around};
  node["amenity"="community_centre"]${around};
  node["amenity"="library"]${around};
  node["amenity"="museum"]${around};
  node["amenity"="place_of_worship"]${around};
  node["leisure"="park"]${around};
  node["leisure"="garden"]${around};
  node["shop"="supermarket"]${around};
  node["amenity"="marketplace"]${around};
  way["highway"="primary"]${around};
  way["highway"="secondary"]${around};
  way["highway"="tertiary"]${around};
);
out center;
`.trim();
}

function classifyElement(el: OverpassElement): { category: keyof ContextPoisResponse; type: string } | null {
  const t = el.tags ?? {};
  const amenity = t.amenity;
  const highway = t.highway;
  const railway = t.railway;
  const leisure = t.leisure;
  const shop = t.shop;

  if (amenity === 'bus_station') return { category: 'transit', type: 'bus_station' };
  if (highway === 'bus_stop') return { category: 'transit', type: 'bus_stop' };
  if (railway === 'tram_stop') return { category: 'transit', type: 'tram_stop' };
  if (railway === 'subway_entrance') return { category: 'transit', type: 'subway_entrance' };
  if (railway === 'station') return { category: 'transit', type: 'railway_station' };
  if (amenity === 'school') return { category: 'education', type: 'school' };
  if (amenity === 'kindergarten') return { category: 'education', type: 'kindergarten' };
  if (amenity === 'university') return { category: 'education', type: 'university' };
  if (amenity === 'college') return { category: 'education', type: 'college' };
  if (amenity === 'hospital') return { category: 'healthcare', type: 'hospital' };
  if (amenity === 'clinic') return { category: 'healthcare', type: 'clinic' };
  if (amenity === 'pharmacy') return { category: 'healthcare', type: 'pharmacy' };
  if (amenity === 'community_centre') return { category: 'civic', type: 'community_centre' };
  if (amenity === 'library') return { category: 'civic', type: 'library' };
  if (amenity === 'museum') return { category: 'civic', type: 'museum' };
  if (amenity === 'place_of_worship') return { category: 'civic', type: 'place_of_worship' };
  if (leisure === 'park') return { category: 'greenSpace', type: 'park' };
  if (leisure === 'garden') return { category: 'greenSpace', type: 'garden' };
  if (shop === 'supermarket') return { category: 'markets', type: 'supermarket' };
  if (amenity === 'marketplace') return { category: 'markets', type: 'marketplace' };
  if (highway === 'primary') return { category: 'majorRoads', type: 'primary' };
  if (highway === 'secondary') return { category: 'majorRoads', type: 'secondary' };
  if (highway === 'tertiary') return { category: 'majorRoads', type: 'tertiary' };
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = parseInt(req.query.radius as string, 10);

  if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radius)) {
    return res.status(400).json({ error: 'lat, lng, and radius are required numbers' });
  }
  if (radius < 50 || radius > 2000) {
    return res.status(400).json({ error: 'radius must be between 50 and 2000 metres' });
  }

  try {
    const query = buildOverpassQuery(lat, lng, radius);
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Overpass error:', response.status, errText);
      return res.status(503).json({
        error: 'Overpass API unavailable',
        message: errText.slice(0, 200),
      });
    }

    const data = (await response.json()) as { elements?: OverpassElement[] };
    const elements = data.elements ?? [];

    const buckets: {
      transit: PoiItem[];
      education: PoiItem[];
      healthcare: PoiItem[];
      civic: PoiItem[];
      greenSpace: PoiItem[];
      markets: PoiItem[];
      majorRoads: RoadItem[];
    } = {
      transit: [],
      education: [],
      healthcare: [],
      civic: [],
      greenSpace: [],
      markets: [],
      majorRoads: [],
    };

    const seenRoads = new Set<string>();

    for (const el of elements) {
      const classified = classifyElement(el);
      if (!classified) continue;
      const tags = el.tags ?? {};

      if (classified.category === 'majorRoads') {
        const name = poiName(tags);
        const key = `${classified.type}:${name}`;
        if (seenRoads.has(key)) continue;
        seenRoads.add(key);
        buckets.majorRoads.push({ name, type: classified.type });
        continue;
      }

      const coord = parseCoord(el);
      if (!coord) continue;
      buckets[classified.category].push({
        name: poiName(tags),
        type: classified.type,
        lat: coord.lat,
        lng: coord.lng,
      });
    }

    const result: ContextPoisResponse = {
      transit: nearest(buckets.transit, lat, lng, MAX_PER_CATEGORY),
      education: nearest(buckets.education, lat, lng, MAX_PER_CATEGORY),
      healthcare: nearest(buckets.healthcare, lat, lng, MAX_PER_CATEGORY),
      civic: nearest(buckets.civic, lat, lng, MAX_PER_CATEGORY),
      greenSpace: nearest(buckets.greenSpace, lat, lng, MAX_PER_CATEGORY),
      markets: nearest(buckets.markets, lat, lng, MAX_PER_CATEGORY),
      majorRoads: buckets.majorRoads.slice(0, MAX_PER_CATEGORY),
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error('fetch-context-pois error:', error);
    return res.status(503).json({
      error: 'POI fetch failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
