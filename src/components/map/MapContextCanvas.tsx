import React, { useEffect, useMemo } from 'react';
import { SiteContextData } from '../../lib/storage/siteContext';
import { useIsMobile } from '../../hooks/useIsMobile';

const DEFAULT_MAP_CONTEXT_URL = 'https://map-context-production.up.railway.app';

interface AnalysisCompleteMessage {
  type: 'analysis-complete';
  data: SiteContextData;
}

function isAnalysisCompleteMessage(value: unknown): value is AnalysisCompleteMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<AnalysisCompleteMessage>;
  return message.type === 'analysis-complete' && typeof message.data === 'object' && message.data !== null;
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
      onAnalysisComplete(event.data.data);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mapContextUrl, onAnalysisComplete]);

  return (
    <>
      <iframe
        src={mapContextUrl}
        title="Map context analysis"
        className={
          isMobile
            ? 'absolute inset-0 w-full h-full border-0 bg-white'
            : 'absolute top-[42px] left-0 right-0 bottom-0 w-full h-full border-0 bg-white'
        }
        allow="clipboard-read; clipboard-write"
      />
      <a
        href={`${mapContextUrl}/atlas`}
        target="_blank"
        rel="noopener noreferrer"
        title="Open the explorable 3D Tel Aviv atlas in a new tab"
        className="absolute bottom-5 right-4 z-10 flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/90 px-4 py-2 text-xs font-semibold text-neutral-100 shadow-lg backdrop-blur hover:border-amber-400/70 hover:text-amber-300"
      >
        <span aria-hidden>🏙</span>
        <span>3D Atlas — Tel Aviv</span>
      </a>
    </>
  );
};
