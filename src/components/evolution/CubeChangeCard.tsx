import React, { useState, useEffect } from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import type { OperatorRecord } from '../../lib/operators/types';
import { ConfidenceVectorDisplay } from '../meme/OperatorResultPanel';

const floatingCls =
  'absolute top-4 right-4 bg-ink-100 border border-ink-200 rounded-lg p-4 w-[280px] max-h-[70vh] overflow-y-auto';
const dockedCls =
  'pointer-events-auto w-full bg-card border border-ink-200 rounded-lg p-4 shadow-[0_4px_20px_hsl(45_9%_13%/0.08)]';

const originLabel = (record: OperatorRecord): string =>
  record.origin === 'evolution' ? 'Evolve' : record.origin === 'pataphysical' ? 'Pataphysical' : 'Meme';

/** One applied change, collapsed to a single row; click to expand. */
const ChangeEntry: React.FC<{
  record: OperatorRecord;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}> = ({ record, index, expanded, onToggle }) => (
  <div className="rounded border border-ink-200 bg-ink-50 overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full p-2 flex items-center justify-between gap-1.5 cursor-pointer bg-transparent border-0 text-left"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {record.memeImageUrl && (
          <img
            src={record.memeImageUrl}
            alt=""
            className="w-7 h-7 object-cover rounded border border-ink-200 flex-shrink-0"
          />
        )}
        <span className="text-ink-800 text-[12px] font-semibold flex-shrink-0">#{index + 1}</span>
        <span className="px-1.5 py-px rounded bg-ink-200 text-ink-700 text-[11px] flex-shrink-0">
          {record.operator}
        </span>
        <span className="px-1.5 py-px rounded bg-ink-100 border border-ink-200 text-ink-500 text-[10px] uppercase tracking-wide flex-shrink-0">
          {originLabel(record)}
        </span>
      </div>
      <span className="text-ink-400 text-[11px] flex-shrink-0">{expanded ? '−' : '+'}</span>
    </button>

    {expanded && (
      <div className="px-2 pb-2 border-t border-ink-200 pt-2">
        {/* Source meme */}
        {record.memeImageUrl && (
          <img
            src={record.memeImageUrl}
            alt={record.memeTitle || 'source meme'}
            className="w-full max-h-40 object-contain rounded border border-ink-200 bg-white mb-1.5"
          />
        )}
        <p className="text-ink-700 text-[11px] leading-snug mb-2 m-0">
          {record.memeTitle || record.memeDescription.split('\n')[0]}
        </p>

        {/* The change itself */}
        <div className="mb-1.5">
          <span className="text-ink-500 text-[11px]">Cutter: </span>
          <span className="text-ink-700 text-[11px]">{record.cutter.type}</span>
          <span className="text-ink-500 text-[11px] ml-2">mag: </span>
          <span className="text-ink-700 text-[11px]">{record.magnitude.toFixed(2)}</span>
        </div>
        <div className="mb-1.5">
          <span className="text-ink-500 text-[11px]">Targets: </span>
          <span className="text-ink-600 text-[11px]">{record.targets.join(', ')}</span>
        </div>

        {/* Why the model made this cut */}
        {record.pass1?.meme_summary && (
          <p className="text-ink-700 text-[11px] leading-relaxed mb-1.5 m-0">
            {record.pass1.meme_summary}
          </p>
        )}
        {record.pass2?.cutter.geometry_reasoning && (
          <p className="text-ink-500 text-[10px] leading-relaxed mb-1.5 m-0">
            {record.pass2.cutter.geometry_reasoning}
          </p>
        )}
        {record.reasoning && (
          <p className="text-ink-500 text-[10px] leading-relaxed mb-1.5 m-0 italic">
            {record.reasoning}
          </p>
        )}

        {record.confidenceVector && (
          <ConfidenceVectorDisplay
            vector={record.confidenceVector}
            note={record.pass2?.confidence_note}
          />
        )}

        <p className="text-ink-400 text-[10px] m-0">
          {new Date(record.createdAt).toLocaleString()}
        </p>
      </div>
    )}
  </div>
);

/**
 * Inspector card for the cube currently selected in the Evolution (Evolve)
 * viewport: the full record of every change applied to it — which meme drove
 * each cut, the cutter used, and the model's reasoning. This is the "go back
 * and see why this cube looks the way it does" surface; the geometry alone
 * doesn't carry that.
 */
export const CubeChangeCard: React.FC<{ docked?: boolean }> = ({ docked = false }) => {
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const setTargetCubeId = useMemeStore(s => s.setTargetCubeId);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const placedCubes = useBuilderStore(s => s.placedCubes);
  // null = "auto": the newest change starts open so the explanation is
  // visible immediately on click. '' = everything collapsed by the user.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => setExpandedId(null), [targetCubeId]);

  if (!targetCubeId) return null;
  const cube = placedCubes.find(c => c.id === targetCubeId);
  if (!cube) return null;

  const records = cubeOperators[targetCubeId] || [];
  // Newest change first.
  const ordered = [...records].reverse();
  const latestId = ordered[0]?.id ?? null;
  const openId = expandedId === null ? latestId : expandedId;

  return (
    <div className={docked ? dockedCls : floatingCls}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className="text-ink-900 text-sm m-0">Cube changes</p>
          <p className="text-ink-500 text-[11px] m-0">
            {cube.variationId} · {records.length === 0
              ? 'unchanged'
              : `${records.length} ${records.length === 1 ? 'change' : 'changes'}`}
          </p>
        </div>
        <button
          onClick={() => setTargetCubeId(null)}
          title="Close"
          className="text-ink-400 hover:text-ink-700 text-[14px] leading-none bg-transparent border-0 cursor-pointer px-1"
        >
          ×
        </button>
      </div>

      {records.length === 0 ? (
        <p className="text-ink-500 text-[11px] leading-relaxed mt-2 m-0">
          This cube hasn't been changed yet — it's still the original variation.
          Applied evolution candidates and pataphysical translations will show
          up here.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 mt-2">
          {ordered.map((record, i) => (
            <ChangeEntry
              key={record.id}
              record={record}
              index={records.length - 1 - i}
              expanded={openId === record.id}
              onToggle={() => setExpandedId(openId === record.id ? '' : record.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
