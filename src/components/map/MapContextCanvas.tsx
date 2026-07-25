import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveSiteContext,
  SiteContextData,
  subscribeActiveSiteContext,
} from '../../lib/storage/siteContext';
import { buildSiteContextAt } from '../../lib/siteContext/mapSiteContext';
import { buildMapContextSrc, siteKeyFromContext } from '../../lib/siteContext/mapContextUrl';
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

  // Boot the iframe into the active site's analysis when one exists
  // (map-context versions without boot-param support just show the picker).
  const [iframeSrc, setIframeSrc] = useState(() =>
    buildMapContextSrc(mapContextUrl, getActiveSiteContext())
  );

  // Identity of the site the iframe currently shows (or is booting toward).
  // Updated when we re-point the iframe AND when the iframe itself reports
  // an analysis — so the context change caused by the iframe's own
  // analysis-complete never reloads it (that would wipe the fresh run),
  // and only a genuinely different site becoming active re-points it.
  const iframeSiteKeyRef = useRef<string | null>(siteKeyFromContext(getActiveSiteContext()));

  useEffect(() => {
    return subscribeActiveSiteContext(() => {
      const context = getActiveSiteContext();
      const key = siteKeyFromContext(context);
      // Cleared or unlocated context: leave the iframe alone rather than
      // resetting it to the blank picker (it may hold an in-progress run).
      if (!key || key === iframeSiteKeyRef.current) return;
      iframeSiteKeyRef.current = key;
      setIframeSrc(buildMapContextSrc(mapContextUrl, context));
    });
  }, [mapContextUrl]);

  useEffect(() => {
    const expectedOrigin = new URL(mapContextUrl).origin;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== expectedOrigin) return;
      if (!isAnalysisCompleteMessage(event.data)) return;
      const context = adaptAnalysisPayload(event.data.data);
      if (!context) return;
      // Record before onAnalysisComplete: saving the context fires the
      // subscription synchronously, and the guard above must already know
      // the iframe is showing this site.
      iframeSiteKeyRef.current = siteKeyFromContext(context) ?? iframeSiteKeyRef.current;
      onAnalysisComplete(context);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mapContextUrl, onAnalysisComplete]);

  return (
    <iframe
      src={iframeSrc}
      title="Map context analysis"
      className={
        isMobile
          ? 'absolute inset-0 w-full h-full border-0 bg-white'
          : // An <iframe> is a *replaced element*: left+right / top+bottom
            // insets do NOT stretch it (unlike a normal block), so without an
            // explicit size it collapses to its intrinsic 300x150 default and
            // the embedded app renders clipped in the top-left. Size it
            // explicitly instead — full width, and full height minus the 42px
            // top offset so the bottom lands exactly at the viewport edge
            // (plain h-full would overflow by those 42px).
            'absolute top-[42px] left-0 w-full h-[calc(100%-42px)] border-0 bg-white'
      }
      allow="clipboard-read; clipboard-write"
    />
  );
};
