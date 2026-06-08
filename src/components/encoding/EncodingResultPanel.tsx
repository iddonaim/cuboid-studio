import React from 'react';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useIsMobile } from '../../hooks/useIsMobile';

export const EncodingResultPanel: React.FC = () => {
  const isMobile = useIsMobile();
  const encodingReasoning = useEncodingStore(s => s.encodingReasoning);
  const isEncoding = useEncodingStore(s => s.isEncoding);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const mode = useEncodingStore(s => s.mode);

  const hasEncodeResult = encodedCubes !== null;
  const showPanel = isEncoding || hasEncodeResult;
  const isReencoding = isEncoding && hasEncodeResult;

  if (!showPanel) return null;

  if (isEncoding && !hasEncodeResult) {
    return (
      <div
        className={`absolute right-4 z-20 bg-slate-950 border border-slate-700 rounded-lg p-4 w-[260px] ${
          isMobile ? 'top-4' : 'top-[42px]'
        }`}
      >
        <p className="text-slate-400 text-xs m-0">Encoding space...</p>
      </div>
    );
  }

  return (
    <div
      className={`absolute right-4 z-20 bg-slate-950 border border-slate-700 rounded-lg p-4 w-[260px] max-h-[min(70vh,480px)] overflow-y-auto ${
        isMobile ? 'top-4' : 'top-[42px]'
      } ${isReencoding ? 'opacity-60' : ''}`}
    >
      {isReencoding && (
        <p className="text-sky-300/90 text-[10px] m-0 mb-2">Updating interpretation…</p>
      )}
      <p className="text-white text-sm mb-2">Space Encoded</p>
      {encodingReasoning ? (
        <div className="p-2 bg-slate-800 border border-slate-700 rounded text-slate-300 text-[11px] leading-relaxed italic">
          {encodingReasoning}
          {mode !== 'standalone' && seedCubes.length > 0 && (
            <p className="text-slate-400 text-[11px] mt-1.5 mb-0 not-italic">
              {seedCubes.length} preserved · {encodedCubes?.length ?? 0} added
            </p>
          )}
        </div>
      ) : (
        <p className="text-slate-500 text-[11px] m-0">No interpretation text returned.</p>
      )}
    </div>
  );
};
