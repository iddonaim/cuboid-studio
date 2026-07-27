import React, { useEffect, useState } from 'react';
import {
  getActiveSiteContext,
  subscribeActiveSiteContext,
  SiteContextData,
} from '../../lib/storage/siteContext';
import { useAppStore } from '../../store/useAppStore';

/** Slippy-map tile coordinates for a lat/lng at a given zoom. */
function tileForLatLng(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

/** Same imagery the Map tab uses, as a single static tile. */
function imageryTileUrl(lat: number, lng: number, zoom = 16): string {
  const { x, y } = tileForLatLng(lat, lng, zoom);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
}

function useActiveSiteContext(): SiteContextData | null {
  // Plain state + subscription (not useSyncExternalStore) because
  // getActiveSiteContext parses a fresh object on every call.
  const [site, setSite] = useState<SiteContextData | null>(getActiveSiteContext);
  useEffect(
    () => subscribeActiveSiteContext(() => setSite(getActiveSiteContext())),
    []
  );
  return site;
}

/**
 * Compact, always-visible reminder of the site the work is anchored to —
 * shown at the top of the Encode / Evolution / Decode panels so the physical
 * place stays present through every step after the Map tab.
 */
export const ActiveSiteChip: React.FC = () => {
  const site = useActiveSiteContext();
  const setActiveMode = useAppStore(s => s.setActiveMode);
  const [thumbFailed, setThumbFailed] = useState(false);

  const lat = site ? parseFloat(site.quantitative.location.lat) : NaN;
  const lng = site ? parseFloat(site.quantitative.location.lng) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  // A new site gets a fresh chance at loading its thumbnail.
  const thumbKey = hasCoords ? `${lat},${lng}` : null;
  useEffect(() => setThumbFailed(false), [thumbKey]);

  if (!site) return null;

  const address = site.quantitative.location.address;

  return (
    <button
      type="button"
      onClick={() => setActiveMode('map')}
      title="Open in Map"
      className="w-full flex items-center gap-2 p-1.5 mb-2 bg-ink-100 border border-ink-200 rounded-md text-left cursor-pointer hover:border-ink-300 group"
    >
      {hasCoords && !thumbFailed ? (
        <img
          src={imageryTileUrl(lat, lng)}
          alt=""
          onError={() => setThumbFailed(true)}
          className="w-11 h-11 rounded object-cover bg-ink-200 shrink-0"
        />
      ) : (
        <span className="w-11 h-11 rounded bg-ink-200 shrink-0 flex items-center justify-center text-ink-400 text-[16px]">
          ◎
        </span>
      )}
      <span className="min-w-0 flex flex-col">
        <span className="text-[12px] font-medium text-ink-800 truncate">
          {site.site_name}
        </span>
        {address && (
          <span className="text-[10px] text-ink-500 truncate">{address}</span>
        )}
        <span className="text-[10px] text-ink-400 group-hover:text-primary">
          Site context · open in Map
        </span>
      </span>
    </button>
  );
};
