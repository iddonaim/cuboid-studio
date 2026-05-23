import React, { useMemo, useState } from 'react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import { useDecodeStore } from '../../store/useDecodeStore';
import { downloadAssemblyJSON } from '../../lib/export/assemblyExport';
import { downloadDecodeGridSvg } from '../../lib/decode/decodeSvgExport';
import { variation2dPath } from '../../lib/decode/variation2dPath';
import { Button } from '@/components/ui/button';
import { PlacedCube } from '../../lib/cube/types';

const NO_ASSEMBLY_TITLE = 'No assembly to export';

function operatorCount(cubeOperators: Record<string, unknown[]>, cubeId: string): number {
  return cubeOperators[cubeId]?.length ?? 0;
}

const VariationTile: React.FC<{
  cube: PlacedCube;
  selected: boolean;
  opCount: number;
  onSelect: () => void;
}> = ({ cube, selected, opCount, onSelect }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const src = variation2dPath(cube.variationId);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-stretch rounded-md border bg-slate-900 p-2 text-left cursor-pointer transition-colors ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/40'
          : 'border-slate-700 hover:border-slate-500'
      }`}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded bg-slate-800">
        {!imgFailed ? (
          <img
            src={src}
            alt={cube.variationId}
            className="h-full w-full object-contain"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-slate-700 text-slate-400">
            <span className="font-mono text-[10px]">{cube.variationId}</span>
          </div>
        )}
        {opCount > 0 && (
          <span
            className="absolute right-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-semibold text-violet-100"
            style={{ background: 'rgba(139, 92, 246, 0.85)' }}
            title={`${opCount} operator${opCount === 1 ? '' : 's'} applied`}
          >
            {opCount}
          </span>
        )}
      </div>
      <span className="mt-1.5 text-center font-mono text-[10px] text-slate-400">
        {cube.variationId}
      </span>
    </button>
  );
};

export const DecodePanel: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const selectedCubeId = useDecodeStore(s => s.selectedCubeId);
  const setSelectedCubeId = useDecodeStore(s => s.setSelectedCubeId);

  const hasCubes = placedCubes.length > 0;

  const operatorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cube of placedCubes) {
      counts[cube.id] = operatorCount(cubeOperators, cube.id);
    }
    return counts;
  }, [placedCubes, cubeOperators]);

  const evolvedCubes = useMemo(
    () =>
      placedCubes.filter(c => operatorCount(cubeOperators, c.id) > 0),
    [placedCubes, cubeOperators],
  );

  const handleDownload2d = () => {
    if (!hasCubes) return;
    downloadDecodeGridSvg(placedCubes, operatorCounts);
  };

  const handleDownload3d = () => {
    if (!hasCubes) return;
    void downloadAssemblyJSON();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          onClick={handleDownload2d}
          disabled={!hasCubes}
          title={!hasCubes ? NO_ASSEMBLY_TITLE : undefined}
          className={`flex-1 h-auto py-2 text-[11px] border border-slate-700 ${
            hasCubes
              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              : 'bg-slate-950 text-slate-600 cursor-default'
          }`}
        >
          Download 2D (SVG)
        </Button>
        <Button
          onClick={handleDownload3d}
          disabled={!hasCubes}
          title={!hasCubes ? NO_ASSEMBLY_TITLE : undefined}
          className={`flex-1 h-auto py-2 text-[11px] border border-slate-700 ${
            hasCubes
              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              : 'bg-slate-950 text-slate-600 cursor-default'
          }`}
        >
          Download 3D (JSON)
        </Button>
      </div>

      {placedCubes.length === 0 ? (
        <p className="text-slate-500 text-[11px]">No cubes in the assembly yet.</p>
      ) : (
        <div className="max-h-[min(50vh,320px)] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {placedCubes.map(cube => (
            <VariationTile
              key={cube.id}
              cube={cube}
              selected={selectedCubeId === cube.id}
              opCount={operatorCounts[cube.id] ?? 0}
              onSelect={() => setSelectedCubeId(cube.id)}
            />
          ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Evolved
        </h3>
        {evolvedCubes.length === 0 ? (
          <p className="text-slate-600 text-[10px]">No evolved cubes yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {evolvedCubes.map(cube => {
              const count = operatorCounts[cube.id] ?? 0;
              return (
                <li
                  key={cube.id}
                  className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-400"
                >
                  <span>{cube.variationId}</span>
                  <span className="text-violet-400">{count} op{count === 1 ? '' : 's'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
