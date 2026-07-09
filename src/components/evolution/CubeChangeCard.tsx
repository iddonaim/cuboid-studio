import React from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { viewFromOperatorRecord } from '../../lib/operators/recordView';
import { TranslationRecordSummary } from '../meme/TranslationRecord';

const floatingCls =
  'absolute top-4 right-4 bg-ink-100 border border-ink-200 rounded-lg p-4 w-[280px] max-h-[70vh] overflow-y-auto';
const dockedCls =
  'pointer-events-auto w-full bg-card border border-ink-200 rounded-lg p-4 shadow-[0_4px_20px_hsl(45_9%_13%/0.08)]';

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

  if (!targetCubeId) return null;
  const cube = placedCubes.find(c => c.id === targetCubeId);
  if (!cube) return null;

  const records = cubeOperators[targetCubeId] || [];
  // Newest change first.
  const ordered = [...records].reverse();

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
            <div
              key={record.id}
              className="p-2 rounded border border-ink-200 bg-ink-50"
            >
              <div className="flex items-baseline justify-between gap-1.5 mb-1.5">
                <span className="text-ink-800 text-[12px] font-semibold">
                  #{records.length - i}
                </span>
                <span className="text-ink-400 text-[10px]">
                  {new Date(record.createdAt).toLocaleDateString()}
                </span>
              </div>
              <TranslationRecordSummary
                view={viewFromOperatorRecord(
                  record,
                  // Only the latest change matches the cube's current
                  // geometry, so only it gets the cut-result thumbnail;
                  // older records show their meme instead.
                  i === 0
                    ? {
                        snapshotGeometry: cubeGeometryOverrides[targetCubeId] ?? null,
                        snapshotCutter: cubeTranslations[targetCubeId]?.cutterGeometry ?? null,
                      }
                    : {},
                )}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
