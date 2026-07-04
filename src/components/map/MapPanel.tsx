import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  getActiveSiteContext,
  setActiveSiteContext,
  NearbyPoisData,
} from '../../lib/storage/siteContext';
import { buildSiteContextFromMap } from '../../lib/siteContext/mapSiteContext';
import { Button } from '@/components/ui/button';

const DEFAULT_CENTER: [number, number] = [32.08, 34.78];
const DEFAULT_ZOOM = 15;
const DEFAULT_RADIUS = 500;

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function readPinFromContext(): {
  lat: number;
  lng: number;
  address: string;
  radius: number;
} | null {
  const ctx = getActiveSiteContext();
  if (!ctx) return null;
  const lat = parseFloat(ctx.quantitative.location.lat);
  const lng = parseFloat(ctx.quantitative.location.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const radius = parseInt(ctx.quantitative.location.radius_meters || '', 10);
  return {
    lat,
    lng,
    address: ctx.quantitative.location.address,
    radius: Number.isNaN(radius) ? DEFAULT_RADIUS : radius,
  };
}

export const MapPanel: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const radiusRef = useRef(DEFAULT_RADIUS);

  const pinIcon = L.divIcon({
    className: '',
    html: '<div style="width:12px;height:12px;background:#bc4a1f;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,.5)"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  const [addressQuery, setAddressQuery] = useState('');
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  radiusRef.current = radius;
  const [pin, setPin] = useState<{ lat: number; lng: number; address: string } | null>(() => {
    const fromCtx = readPinFromContext();
    if (!fromCtx) return null;
    return { lat: fromCtx.lat, lng: fromCtx.lng, address: fromCtx.address };
  });
  const [activeInfo, setActiveInfo] = useState(() => readPinFromContext());

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [poiWarning, setPoiWarning] = useState<string | null>(null);
  const [poiSummary, setPoiSummary] = useState<string | null>(null);

  const updateCircle = useCallback((map: L.Map, lat: number, lng: number, r: number) => {
    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng]);
      circleRef.current.setRadius(r);
    } else {
      circleRef.current = L.circle([lat, lng], {
        radius: r,
        color: '#bc4a1f',
        fillColor: '#bc4a1f',
        fillOpacity: 0.08,
        weight: 1,
      }).addTo(map);
    }
  }, []);

  const placePin = useCallback(
    (lat: number, lng: number, address: string, fly = true) => {
      const map = mapRef.current;
      if (!map) return;

      setPin({ lat, lng, address });
      setGeocodeError(null);
      if (address) setAddressQuery(address);

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
      }
      updateCircle(map, lat, lng, radius);

      if (fly) {
        map.flyTo([lat, lng], DEFAULT_ZOOM, { duration: 0.8 });
      }
    },
    [radius, updateCircle]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initial = readPinFromContext();
    const center: [number, number] = initial
      ? [initial.lat, initial.lng]
      : DEFAULT_CENTER;

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    const esriLayer = L.tileLayer(ESRI_IMAGERY, {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    }).addTo(map);

    const osmLayer = L.tileLayer(OSM_TILES, {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    let usingOsm = false;
    esriLayer.on('tileerror', () => {
      if (!usingOsm) {
        usingOsm = true;
        map.removeLayer(esriLayer);
        osmLayer.addTo(map);
      }
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setPin({ lat, lng, address: label });
      setGeocodeError(null);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
      }
      if (circleRef.current) {
        circleRef.current.setLatLng([lat, lng]);
      } else {
        circleRef.current = L.circle([lat, lng], {
          radius: radiusRef.current,
          color: '#bc4a1f',
          fillColor: '#bc4a1f',
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(map);
      }
    });

    mapRef.current = map;

    if (initial) {
      markerRef.current = L.marker([initial.lat, initial.lng], { icon: pinIcon }).addTo(map);
      circleRef.current = L.circle([initial.lat, initial.lng], {
        radius: initial.radius,
        color: '#bc4a1f',
        fillColor: '#bc4a1f',
        fillOpacity: 0.08,
        weight: 1,
      }).addTo(map);
      setRadius(initial.radius);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pin && mapRef.current) {
      updateCircle(mapRef.current, pin.lat, pin.lng, radius);
    }
  }, [radius, pin, updateCircle]);

  const handleGeocode = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = addressQuery.trim();
    if (!q) return;

    setGeocoding(true);
    setGeocodeError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Geocoding failed (${res.status})`);
      }
      const lat = parseFloat(data.lat);
      const lng = parseFloat(data.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        throw new Error('Invalid coordinates returned');
      }
      placePin(lat, lng, data.display_name || q);
    } catch (err) {
      setGeocodeError(err instanceof Error ? err.message : 'Geocoding failed');
    } finally {
      setGeocoding(false);
    }
  };

  const handleSetActiveSite = async () => {
    if (!pin) return;

    setCommitting(true);
    setPoiWarning(null);
    setPoiSummary(null);

    let pois: NearbyPoisData | undefined;

    try {
      const res = await fetch(
        `/api/fetch-context-pois?lat=${pin.lat}&lng=${pin.lng}&radius=${radius}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `POI fetch failed (${res.status})`);
      }
      pois = (await res.json()) as NearbyPoisData;
      setPoiSummary(
        `Found ${pois.transit.length} transit stops, ${pois.education.length} schools, ${pois.civic.length} civic buildings within ${radius}m`
      );
    } catch {
      setPoiWarning('POI data unavailable — site location saved without it');
    }

    const ctx = buildSiteContextFromMap(pin.lat, pin.lng, pin.address, radius, pois);
    setActiveSiteContext(ctx);
    setActiveInfo({
      lat: pin.lat,
      lng: pin.lng,
      address: pin.address,
      radius,
    });

    setCommitting(false);
  };

  const infoLine = activeInfo
    ? `${activeInfo.address || `${activeInfo.lat.toFixed(4)}, ${activeInfo.lng.toFixed(4)}`} · ${activeInfo.radius}m radius`
    : 'No site selected';

  return (
    <div className="flex flex-col gap-3 text-[12px] text-ink-700">
      <p className="text-[11px] text-ink-500 leading-relaxed m-0">
        Pick a site on the map or search an address. Set radius, then commit to active site context
        (used by Encode and Pataphysical translation).
      </p>

      <div>
        <form onSubmit={handleGeocode} className="flex gap-1.5">
          <input
            type="text"
            value={addressQuery}
            onChange={(e) => setAddressQuery(e.target.value)}
            placeholder="Search address..."
            className="flex-1 box-border px-2 py-1.5 font-[inherit] text-[12px] text-ink-800 bg-ink-100 border border-ink-200 rounded outline-none focus:border-primary"
          />
          <Button
            type="submit"
            disabled={geocoding || !addressQuery.trim()}
            className="h-auto py-1.5 px-2.5 text-[11px] bg-ink-100 hover:bg-ink-200 text-primary border border-ink-200"
          >
            {geocoding ? 'Searching…' : 'Search'}
          </Button>
        </form>
        {geocodeError && (
          <p className="text-destructive text-[11px] m-0" role="alert">
            {geocodeError}
          </p>
        )}
      </div>

      {/* Bounds wrapper: pointer-events none so Leaflet cannot steal hits above the map.
          Inner div re-enables interaction only within the map box. */}
      <div
        className="relative w-full rounded-md border border-ink-200 overflow-hidden"
        style={{
          height: 220,
          minHeight: 180,
          pointerEvents: 'none',
        }}
      >
        <div
          ref={mapContainerRef}
          className="overflow-hidden"
          style={{
            position: 'relative',
            width: '100%',
            height: 220,
            maxHeight: 220,
            pointerEvents: 'auto',
          }}
        />
      </div>

      <div>
        <label className="block text-[11px] text-ink-500 mb-1">
          Radius: {radius}m
        </label>
        <input
          type="range"
          min={50}
          max={2000}
          step={50}
          value={radius}
          onChange={(e) => setRadius(parseInt(e.target.value, 10))}
          className="w-full accent-cyan-500"
        />
      </div>

      <Button
        onClick={handleSetActiveSite}
        disabled={!pin || committing}
        className="w-full h-auto py-2 text-[13px] font-semibold bg-primary hover:bg-primary/85 text-white border-0 disabled:opacity-50"
      >
        {committing ? 'Fetching site context…' : 'Set as active site'}
      </Button>

      {poiSummary && (
        <p className="text-green-600 text-[11px] m-0">{poiSummary}</p>
      )}
      {poiWarning && (
        <p className="text-amber-600 text-[11px] m-0">{poiWarning}</p>
      )}

      <div className="px-2 py-1.5 rounded bg-ink-50 border border-ink-200 text-[11px] text-ink-600">
        {infoLine}
      </div>
    </div>
  );
};
