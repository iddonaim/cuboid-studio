import React from 'react';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useIsMobile } from '../../hooks/useIsMobile';

interface EncodingResultPanelProps {
  /** Render as a card in the desktop Inspector rail instead of floating. */
  docked?: boolean;
}

export const EncodingResultPanel: React.FC<EncodingResultPanelProps> = ({ docked = false }) => {
  const isMobile = useIsMobile();
  const encodingReasoning = useEncodingStore(s => s.encodingReasoning);
  const isEncoding = useEncodingStore(s => s.isEncoding);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const mode = useEncodingStore(s => s.mode);

  const hasEncodeResult = encodedCubes !== null;
  const showPanel = isEncoding || hasEncodeResult;
  const isReencoding = isEncoding && hasEncodeResult;

  const wrapperCls = docked
    ? 'pointer-events-auto w-full bg-card border border-ink-200 rounded-lg p-4 shadow-[0_4px_20px_hsl(45_9%_13%/0.08)]'
    : `absolute right-4 z-20 bg-ink-100 border border-ink-200 rounded-lg p-4 w-[260px] ${isMobile ? 'top-4' : 'top-[42px]'}`;

  if (!showPanel) return null;

  if (isEncoding && !hasEncodeResult) {
    return (
      <div className={wrapperCls}>
        <p className="text-ink-600 text-[13px] m-0">Encoding space...</p>
      </div>
    );
  }

  return (
    <div
      className={`${wrapperCls} ${docked ? '' : 'max-h-[min(70vh,480px)] overflow-y-auto'} ${isReencoding ? 'opacity-60' : ''}`}
    >
      {isReencoding && (
        <p className="text-primary text-[11px] m-0 mb-2">Updating interpretation…</p>
      )}
      <p className="text-ink-900 text-sm mb-2">Space Encoded</p>
      {encodingReasoning ? (
        <div className="p-2 bg-ink-100 border border-ink-200 rounded text-ink-700 text-[12px] leading-relaxed italic">
          {encodingReasoning}
          {mode !== 'standalone' && seedCubes.length > 0 && (
            <p className="text-ink-600 text-[12px] mt-1.5 mb-0 not-italic">
              {seedCubes.length} preserved · {encodedCubes?.length ?? 0} added
            </p>
          )}
        </div>
      ) : (
        <p className="text-ink-500 text-[12px] m-0">No interpretation text returned.</p>
      )}
    </div>
  );
};
