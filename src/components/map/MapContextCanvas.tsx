import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveSiteContext,
  SiteContextData,
  subscribeActiveSiteContext,
} from '../../lib/storage/siteContext';
import { buildSiteContextAt } from '../../lib/siteContext/mapSiteContext';
import {
  MapAnalysisPayload,
  morphologyFromMapAnalysis,
  poisFromMapAnalysis,
} from '../../lib/siteContext/mapContextPayload';
import { buildMapContextSrc, siteKeyFromContext } from '../../lib/siteContext/mapContextUrl';
import { isDemoRecordMode } from '../../lib/demo/recorder';
import { useIsMobile } from '../../hooks/useIsMobile';

const DEFAULT_MAP_CONTEXT_URL = 'https://map-context-production.up.railway.app';

/**
 * The shape the map-context iframe actually posts (site_center/site_radius/
 * address + raw layer data) is NOT a SiteContextData — see MapAnalysisPayload
 * in lib/siteContext/mapContextPayload. It must be adapted before storage,
 * otherwise the coordinates live under keys nothing in this app reads and
 * saved Sites end up "without location".
 */
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
 *
 * The analysis layers (institutions, streets, rail, buildings, elevation) are
 * distilled into POIs and morphology hints here — without this the whole
 * bundle was discarded and Encode reported zero of everything for every site.
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
  const pois = poisFromMapAnalysis(raw, { lat, lng });
  const context = buildSiteContextAt(lat, lng, address, radius, null, pois);

  const morphology = morphologyFromMapAnalysis(raw);
  if (!Object.keys(morphology).length) return context;
  return {
    ...context,
    quantitative: {
      ...context.quantitative,
      morphology: { ...context.quantitative.morphology, ...morphology },
    },
  };
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

      // ?demoRecord: capture the finished analysis. Offline this iframe can't
      // run at all, so without a recording the demo has no site context —
      // Encode and the translations then read zero of everything.
      if (isDemoRecordMode()) {
        const lat = Number(context.quantitative.location.lat);
        const lng = Number(context.quantitative.location.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          void import('../../lib/demo/recorder').then(({ recordSiteAnalysis }) =>
            recordSiteAnalysis({ lat, lng, context }),
          );
        }
      }

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
            // explicitly instead — see the style prop below.
            'absolute left-0 w-full border-0 bg-white'
      }
      // Full width, and full height minus the top bar so the bottom lands
      // exactly at the viewport edge (plain h-full would overflow by the bar).
      // 100% here is the app root, which is the *visible* viewport tall — on
      // iOS a viewport-unit height would have run the iframe off the bottom of
      // the screen behind the browser toolbar, taking the embedded map app's
      // own bottom controls with it.
      style={
        isMobile
          ? undefined
          : { top: 'var(--topbar-h)', height: 'calc(100% - var(--topbar-h))' }
      }
      // Permissions Policy: a cross-origin iframe gets NO gated API unless the
      // embedder delegates it here, and the embedded app can't opt itself in.
      // - geolocation: map-context's picker has a "my location" control
      //   (launcher.js). Without this it fails with a bare "location failed"
      //   that looks like a map-context bug but is caused by this attribute.
      // - fullscreen: the 3D atlas has a fullscreen toggle. This is the
      //   necessary half on our side; the atlas also runs in a nested iframe
      //   that map-context creates without `allowfullscreen`, so that button
      //   needs a matching change there before it works end to end.
      allow="clipboard-read; clipboard-write; geolocation; fullscreen"
    />
  );
};
