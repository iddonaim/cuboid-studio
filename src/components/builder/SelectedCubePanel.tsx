import React from 'react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Button } from '@/components/ui/button';

export const SelectedCubePanel: React.FC = () => {
  const selectedCubeIds = useBuilderStore(s => s.selectedCubeIds);
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const handleDelete = useBuilderStore(s => s.handleDelete);
  const rotateSelectedCube = useBuilderStore(s => s.rotateSelectedCube);
  const isMobile = useIsMobile();

  if (selectedCubeIds.length === 0) return null;

  const singleCube = selectedCubeIds.length === 1
    ? placedCubes.find(c => c.id === selectedCubeIds[0])
    : null;

  return (
    <div className={`absolute top-4 right-4 bg-slate-900 border border-slate-700 rounded-lg p-4 ${isMobile ? 'w-40' : 'w-48'}`}>
      <p className="text-white text-sm mb-1">
        {selectedCubeIds.length === 1 ? 'Selected Cube' : `${selectedCubeIds.length} Cubes`}
      </p>
      {singleCube && (
        <p className="text-slate-500 text-[11px] mb-3">{singleCube.variationId}</p>
      )}

      {isMobile && singleCube && (
        <div className="flex gap-1.5 mb-2">
          <Button
            onClick={() => rotateSelectedCube('y')}
            title="Rotate around Y axis"
            className="flex-1 h-auto py-2.5 bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 text-lg leading-none"
          >
            ↻
          </Button>
          <Button
            onClick={() => rotateSelectedCube('x')}
            title="Tip around X axis"
            className="flex-1 h-auto py-2.5 bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 text-lg leading-none"
          >
            ↺
          </Button>
        </div>
      )}

      <Button
        onClick={handleDelete}
        className={`w-full h-auto ${isMobile ? 'py-3' : 'py-2'} text-xs bg-red-900 hover:bg-red-800 text-white border-0`}
      >
        {selectedCubeIds.length === 1 ? 'Delete' : `Delete ${selectedCubeIds.length}`}
      </Button>
    </div>
  );
};
