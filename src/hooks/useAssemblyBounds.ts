import { useMemo } from 'react';
import { useBuilderStore } from '../store/useBuilderStore';
import { useEncodingStore } from '../store/useEncodingStore';
import {
  assemblyBoundsFromPositions,
  type AssemblyBounds,
} from '../lib/viewport/assemblyBounds';

interface SceneFlags {
  showBuilderScene: boolean;
  showEncodingScene: boolean;
  showPataphysicalScene: boolean;
  showEvolutionScene: boolean;
}

/** Bounds/center for whichever scene is active in Viewport3D. */
export function useAssemblyBounds(flags: SceneFlags): AssemblyBounds {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const encodingMode = useEncodingStore(s => s.mode);

  const {
    showBuilderScene,
    showEncodingScene,
    showPataphysicalScene,
    showEvolutionScene,
  } = flags;

  return useMemo(() => {
    const positions: [number, number, number][] = [];

    if (showBuilderScene || showEvolutionScene) {
      for (const cube of placedCubes) positions.push(cube.position);
    } else if (showEncodingScene) {
      if (encodingMode !== 'standalone') {
        for (const cube of seedCubes) positions.push(cube.position);
      }
      if (encodedCubes) {
        for (const cube of encodedCubes) positions.push(cube.position);
      }
    } else if (showPataphysicalScene) {
      for (const cube of placedCubes) positions.push(cube.position);
    }

    return assemblyBoundsFromPositions(positions);
  }, [
    showBuilderScene,
    showEncodingScene,
    showPataphysicalScene,
    showEvolutionScene,
    placedCubes,
    encodedCubes,
    seedCubes,
    encodingMode,
  ]);
}
