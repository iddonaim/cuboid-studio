import React, { useEffect, useMemo } from 'react';
import { SiteContextData } from '../../lib/storage/siteContext';
import { buildSiteContextAt } from '../../lib/siteContext/mapSiteContext';
import { useIsMobile } from '../../hooks/useIsMobile';

const DEFAULT_MAP_CONTEXT_URL = 'https://map-context-production.up.railway.app';

/**
 * The shape the map-context iframe actually posts: its own analysis payload
 * (site_center/site_radius/address + raw layer data), NOT a SiteContextData.
 * It must be adapted before storage, otherwise the coordinates live under
 * keys nothing in this app reads and saved Sites end up "without location".
 */
interface MapAnalysisPayload {
  site_center?: { lat?: number; lon?: number };
  site_radius?: number;
  address?: string;
  quantitative?: SiteContextData['quantitative'];
}

interface AnalysisCompleteMessage {
  type: 'analysis-complete';
  data: MapAnalysisPayload;
}

function isAnalysisCompleteMessage(value: unknown): value is AnalysisCompleteMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<AnalysisCompleteMessage>;
  return message.type === 'analysis-complete' && typeof message.data === 'object' && message.data !== null;
}

/**
 * Convert the iframe payload into a proper SiteContextData anchored at the
 * analysis coordinates. Passes through unchanged if the payload already is
 * one (future-proofing for a converged map-context).
 */
function adaptAnalysisPayload(raw: MapAnalysisPayload): SiteContextData | null {
  if (raw.quantitative?.location?.lat && raw.quantitative?.location?.lng) {
    return raw as SiteContextData;
  }
  const lat = Number(raw.site_center?.lat);
  const lng = Number(raw.site_center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = typeof raw.address === 'string' ? raw.address : '';
  const radius = Number(raw.site_radius) || 400;
  // Fresh base: a new analysis describes a new site, so don't merge over
  // whatever context happened to be active before.
  return buildSiteContextAt(lat, lng, address, radius, null);
}

interface MapContextCanvasProps {
  onAnalysisComplete: (data: SiteContextData) => void;
}

export const MapContextCanvas: React.FC<MapContextCanvasProps> = ({ onAnalysisComplete }) => {
  const isMobile = useIsMobile();
  const mapContextUrl = useMemo(
    () => import.meta.env.VITE_MAP_CONTEXT_URL || DEFAULT_MAP_CONTEXT_URL,
    []
  );

  useEffect(() => {
    const expectedOrigin = new URL(mapContextUrl).origin;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== expectedOrigin) return;
      if (!isAnalysisCompleteMessage(event.data)) return;
      const context = adaptAnalysisPayload(event.data.data);
      if (!context) return;
      onAnalysisComplete(context);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mapContextUrl, onAnalysisComplete]);

  return (
    <iframe
      src={mapContextUrl}
      title="Map context analysis"
      className={
        isMobile
          ? 'absolute inset-0 w-full h-full border-0 bg-white'
          : // Iframes are replaced elements: they do NOT stretch to inset
            // offsets like a div (left-0/right-0/bottom-0 alone collapses one
            // to its intrinsic 300×150). Size must be explicit — and h-full
            // would overshoot by the 42px top offset, clipping the embedded
            // app's bottom UI, so subtract it.
            'absolute top-[42px] left-0 w-full h-[calc(100%-42px)] border-0 bg-white'
      }
      allow="clipboard-read; clipboard-write"
    />
  );
};
