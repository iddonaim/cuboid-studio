import React from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useRecordViewerStore } from '../../store/useRecordViewerStore';
import { viewFromOperatorRecord } from '../../lib/operators/recordView';
import type { OperatorRecord } from '../../lib/operators/types';
import { ContextOpacitySlider } from '../meme/ContextOpacitySlider';
import { MobileCanvasCard } from '../layout/MobileCanvasCard';

const dockedCls =
  'pointer-events-auto w-full bg-card border border-ink-200 rounded-lg p-4 shadow-[0_4px_20px_hsl(45_9%_13%/0.08)]';

const originLabel = (record: OperatorRecord): string =>
  record.origin === 'evolution' ? 'Evolve' : record.origin === 'pataphysical' ? 'Pataphysical' : 'Meme';

/**
 * Inspector card for the cube currently selected in the Evolution (Evolve)
 * viewport: the record of every change applied to it — which meme drove each
 * cut and the operator used. This is the "go back and see why this cube looks
 * the way it does" surface; each row opens the shared full-reading drawer
 * with the complete two-pass reasoning.
 */
export const CubeChangeCard: React.FC<{ docked?: boolean }> = ({ docked = false }) => {
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const setTargetCubeId = useMemeStore(s => s.setTargetCubeId);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const cubeGeometryOverrides = useMemeStore(s => s.cubeGeometryOverrides);
  const cubeTranslations = useMemeStore(s => s.cubeTranslations);
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const openViewer = useRecordViewerStore(s => s.open);

  if (!targetCubeId) return null;
  const cube = placedCubes.find(c => c.id === targetCubeId);
  if (!cube) return null;

  const records = cubeOperators[targetCubeId] || [];
  // Newest change first.
  const ordered = [...records].reverse();

  const openRecord = (record: OperatorRecord, isLatest: boolean) => {
    // Only the latest change matches the cube's current geometry, so only it
    // gets the cut-result thumbnail; older records show their meme instead.
    openViewer(
      viewFromOperatorRecord(
        record,
        isLatest
          ? {
              snapshotGeometry: cubeGeometryOverrides[targetCubeId] ?? null,
              snapshotCutter: cubeTranslations[targetCubeId]?.cutterGeometry ?? null,
            }
          : {},
      ),
    );
  };

  const subtitle = `${cube.variationId} · ${
    records.length === 0
      ? 'unchanged'
      : `${records.length} ${records.length === 1 ? 'change' : 'changes'}`
  }`;

  const body = (
    <>
      {/* Fade the rest of the composition while this cube is the subject */}
      <div className="mb-2">
        <ContextOpacitySlider />
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
            <button
              key={record.id}
              onClick={() => openRecord(record, i === 0)}
              title="Open full reading"
              className="w-full p-2 flex items-center justify-between gap-1.5 cursor-pointer text-left rounded border border-ink-200 bg-ink-50 hover:bg-ink-100 transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {record.memeImageUrl && (
                  <img
                    src={record.memeImageUrl}
                    alt=""
                    className="w-7 h-7 object-cover rounded border border-ink-200 flex-shrink-0"
                  />
                )}
                <span className="text-ink-800 text-[12px] font-semibold flex-shrink-0">
                  #{records.length - i}
                </span>
                <span className="px-1.5 py-px rounded bg-ink-200 text-ink-700 text-[11px] flex-shrink-0">
                  {record.operator}
                </span>
                <span className="px-1.5 py-px rounded bg-ink-100 border border-ink-200 text-ink-500 text-[10px] uppercase tracking-wide flex-shrink-0">
                  {originLabel(record)}
                </span>
              </div>
              <span className="text-ink-400 text-[12px] flex-shrink-0">›</span>
            </button>
          ))}
        </div>
      )}
    </>
  );

  // Phone: a chip that opens into a drawer, rather than a 280px Inspector card
  // floated over a 390px canvas. See MobileCanvasCard.
  if (!docked) {
    return (
      <MobileCanvasCard
        label="Cube changes"
        detail={subtitle}
        onDismiss={() => setTargetCubeId(null)}
      >
        {body}
      </MobileCanvasCard>
    );
  }

  return (
    <div className={dockedCls}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className="text-ink-900 text-sm m-0">Cube changes</p>
          <p className="text-ink-500 text-[11px] m-0">{subtitle}</p>
        </div>
        <button
          onClick={() => setTargetCubeId(null)}
          title="Close"
          className="text-ink-400 hover:text-ink-700 text-[14px] leading-none bg-transparent border-0 cursor-pointer px-1"
        >
          ×
        </button>
      </div>
      {body}
    </div>
  );
};
