import React from 'react';
import { useEncodingStore } from '../../store/useEncodingStore';
import { remixDecisions } from '../../lib/encoding/remixDecisions';
import { MobileCanvasCard } from '../layout/MobileCanvasCard';

interface EncodingResultPanelProps {
  /** Render as a card in the desktop Inspector rail instead of the phone's canvas card. */
  docked?: boolean;
}

export const EncodingResultPanel: React.FC<EncodingResultPanelProps> = ({ docked = false }) => {
  const encodingReasoning = useEncodingStore(s => s.encodingReasoning);
  const isEncoding = useEncodingStore(s => s.isEncoding);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const mode = useEncodingStore(s => s.mode);
  const remixResultReplacesSeed = useEncodingStore(s => s.remixResultReplacesSeed);

  const hasEncodeResult = encodedCubes !== null;
  const showPanel = isEncoding || hasEncodeResult;
  const isReencoding = isEncoding && hasEncodeResult;

  if (!showPanel) return null;

  if (isEncoding && !hasEncodeResult) {
    return docked ? (
      <div className="pointer-events-auto w-full rounded-lg border border-ink-200 bg-card p-4 shadow-[0_4px_20px_hsl(45_9%_13%/0.08)]">
        <p className="m-0 text-[13px] text-ink-600">Encoding space...</p>
      </div>
    ) : (
      <MobileCanvasCard label="Encoding space…" expandable={false} />
    );
  }

  // Shared between both layouts — only the frame around it differs.
  const body = (
    <>
      {isReencoding && (
        <p className="m-0 mb-2 text-[11px] text-primary">Updating interpretation…</p>
      )}
      {encodingReasoning ? (
        <div className="rounded border border-ink-200 bg-ink-100 p-2 text-[12px] italic leading-relaxed text-ink-700">
          {encodingReasoning}
          {/* Merge adds to the seed, so "preserved · added" describes it. A
              remix rewrites the seed — counting all of it as preserved and the
              whole result as added is simply untrue, so it reports what the
              model actually decided. */}
          {mode === 'merge' && seedCubes.length > 0 && (
            <p className="mb-0 mt-1.5 text-[12px] not-italic text-ink-600">
              {seedCubes.length} preserved · {encodedCubes?.length ?? 0} added
            </p>
          )}
          {mode === 'remix' && remixResultReplacesSeed && encodedCubes && (
            <p className="mb-0 mt-1.5 text-[12px] not-italic text-ink-600">
              {(() => {
                const d = remixDecisions(encodedCubes, seedCubes);
                return `${d.carried.length} carried · ${d.transplanted.length} transplanted · ${d.added.length} new · ${d.discarded.length} discarded`;
              })()}
            </p>
          )}
        </div>
      ) : (
        <p className="m-0 text-[12px] text-ink-500">No interpretation text returned.</p>
      )}
    </>
  );

  if (!docked) {
    return (
      <MobileCanvasCard
        label="Space encoded"
        detail={isReencoding ? 'updating…' : undefined}
      >
        {body}
      </MobileCanvasCard>
    );
  }

  return (
    <div
      className={`pointer-events-auto w-full rounded-lg border border-ink-200 bg-card p-4 shadow-[0_4px_20px_hsl(45_9%_13%/0.08)] ${
        isReencoding ? 'opacity-60' : ''
      }`}
    >
      <p className="mb-2 text-sm text-ink-900">Space Encoded</p>
      {body}
    </div>
  );
};
