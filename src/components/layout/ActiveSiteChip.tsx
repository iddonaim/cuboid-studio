import React, { useEffect, useState } from 'react';
import {
  clearActiveSiteContext,
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
  const [confirmingClear, setConfirmingClear] = useState(false);

  const lat = site ? parseFloat(site.quantitative.location.lat) : NaN;
  const lng = site ? parseFloat(site.quantitative.location.lng) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  // A new site gets a fresh chance at loading its thumbnail.
  const thumbKey = hasCoords ? `${lat},${lng}` : null;
  useEffect(() => setThumbFailed(false), [thumbKey]);

  if (!site) return null;

  const address = site.quantitative.location.address;

  return (
    <div className="mb-2">
      <div className="w-full flex items-stretch gap-1 bg-ink-100 border border-ink-200 rounded-md group">
        <button
          type="button"
          onClick={() => setActiveMode('map')}
          title="Open in Map"
          className="min-w-0 flex-1 flex items-center gap-2 p-1.5 bg-transparent border-0 text-left cursor-pointer rounded-l-md hover:bg-ink-200/50"
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

        {/* Detaching the site is the only way to stop it riding along on every
            encode and translation — without this the chip follows you through
            every mode with no way off. */}
        <button
          type="button"
          onClick={() => setConfirmingClear(true)}
          title="Detach this site context"
          aria-label="Detach this site context"
          className="px-2 bg-transparent border-0 text-ink-400 hover:text-ink-700 cursor-pointer text-[13px] leading-none"
        >
          ×
        </button>
      </div>

      {confirmingClear && (
        <div className="mt-1 p-2 bg-ink-50 border border-ink-300 rounded-md text-[11px] text-ink-600 flex flex-col gap-1.5">
          <span>
            Detach <span className="text-ink-800">{site.site_name}</span>? Encode and
            translation stop receiving it. The site itself stays in Map.
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                clearActiveSiteContext();
                setConfirmingClear(false);
              }}
              className="px-2 py-1 rounded border border-ink-300 bg-card text-ink-700 hover:bg-ink-200 cursor-pointer"
            >
              Detach
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="px-2 py-1 rounded border border-transparent text-ink-500 hover:text-ink-700 cursor-pointer bg-transparent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
