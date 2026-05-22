import { create } from 'zustand';
import { encodeSpace, EncodedCube } from '../lib/api/encodeSpace';
import { PlacedCube } from '../lib/cube/types';
import { SavedState, savedStateToPlacedCubes } from '../lib/savedStates';
import { GRID_STRIDE, CUBE_SIZE } from '../lib/cube/constants';
import { useBuilderStore } from './useBuilderStore';

type EncodingMode = 'standalone' | 'merge' | 'remix';

interface EncodingState {
  // Image
  uploadedImage: string | null;
  imageBase64: string | null;
  imageMediaType: string | null;
  setImage: (dataUrl: string, base64: string, mediaType: string) => void;
  clearImage: () => void;

  // Encoding state
  isEncoding: boolean;
  encodedCubes: EncodedCube[] | null;
  encodingReasoning: string | null;
  lastError: string | null;

  // Mode & seed
  mode: EncodingMode;
  seedCubes: PlacedCube[];
  seedCubeIds: Set<string>;
  setMode: (mode: EncodingMode) => void;
  setSeedFromBuilder: () => void;
  setSeedFromSavedState: (savedState: SavedState) => void;

  // Seed-edit overlay: when true, the Encoding surface temporarily mounts the
  // Builder UI so the user can build / edit the merge seed inline.
  // Closing the overlay re-snapshots `placedCubes` into `seedCubes`.
  seedEditOpen: boolean;
  openSeedEdit: () => void;
  closeSeedEdit: () => void;

  // Actions
  encode: () => Promise<void>;
  loadIntoBuilder: () => void;
}

export const useEncodingStore = create<EncodingState>((set, get) => ({
  // Image
  uploadedImage: null,
  imageBase64: null,
  imageMediaType: null,
  setImage: (dataUrl, base64, mediaType) => set({
    uploadedImage: dataUrl,
    imageBase64: base64,
    imageMediaType: mediaType,
    encodedCubes: null,
    encodingReasoning: null,
    lastError: null,
  }),
  clearImage: () => set({
    uploadedImage: null,
    imageBase64: null,
    imageMediaType: null,
    encodedCubes: null,
    encodingReasoning: null,
    lastError: null,
  }),

  // Encoding state
  isEncoding: false,
  encodedCubes: null,
  encodingReasoning: null,
  lastError: null,

  // Mode & seed
  mode: 'standalone',
  seedCubes: [],
  seedCubeIds: new Set<string>(),

  setMode: (mode) => set({
    mode,
    seedCubes: [],
    seedCubeIds: new Set<string>(),
    encodedCubes: null,
    encodingReasoning: null,
    lastError: null,
  }),

  setSeedFromBuilder: () => {
    const cubes = useBuilderStore.getState().placedCubes;
    set({
      seedCubes: [...cubes],
      seedCubeIds: new Set(cubes.map(c => c.id)),
    });
  },

  setSeedFromSavedState: (savedState: SavedState) => {
    const cubes = savedStateToPlacedCubes(savedState);
    set({
      seedCubes: cubes,
      seedCubeIds: new Set(cubes.map(c => c.id)),
    });
  },

  seedEditOpen: false,
  openSeedEdit: () => set({ seedEditOpen: true }),
  closeSeedEdit: () => {
    const cubes = useBuilderStore.getState().placedCubes;
    set({
      seedEditOpen: false,
      seedCubes: [...cubes],
      seedCubeIds: new Set(cubes.map(c => c.id)),
    });
  },

  // Actions
  encode: async () => {
    const { imageBase64, imageMediaType } = get();
    if (!imageBase64) {
      set({ lastError: 'No image provided' });
      return;
    }

    set({ isEncoding: true, lastError: null, encodedCubes: null, encodingReasoning: null });

    try {
      const result = await encodeSpace({
        imageBase64,
        imageMediaType: imageMediaType || 'image/jpeg',
      });

      // Grid-snap each position and remove collisions with seed cubes.
      // Y axis is offset by CUBE_SIZE/2 (ground level = 21, not 0).
      const snapAxis = (v: number, axis: number) =>
        axis === 1
          ? Math.round((v - CUBE_SIZE / 2) / GRID_STRIDE) * GRID_STRIDE + CUBE_SIZE / 2
          : Math.round(v / GRID_STRIDE) * GRID_STRIDE;

      const occupied = new Set(get().seedCubes.map(c => c.position.join(',')));
      const processed = result.cubes
        .map(cube => ({
          ...cube,
          position: cube.position.map(snapAxis) as [number, number, number],
        }))
        .filter(cube => !occupied.has(cube.position.join(',')));

      set({
        encodedCubes: processed,
        encodingReasoning: result.reasoning,
        isEncoding: false,
      });
    } catch (error) {
      set({
        lastError: error instanceof Error ? error.message : 'Encoding failed',
        isEncoding: false,
      });
    }
  },

  loadIntoBuilder: () => {
    const { encodedCubes, mode, seedCubes } = get();
    if (!encodedCubes || encodedCubes.length === 0) return;

    const newPlacedCubes: PlacedCube[] = encodedCubes.map((cube, i) => ({
      id: `encoded-${Date.now()}-${i}`,
      variationId: cube.variationId,
      position: cube.position,
      rotation: {
        x: (cube.rotation.x as 0 | 1 | 2 | 3) || 0,
        y: (cube.rotation.y as 0 | 1 | 2 | 3) || 0,
      },
    }));

    const store = useBuilderStore.getState();
    let result: PlacedCube[];
    if (mode === 'merge') {
      result = [...store.placedCubes, ...newPlacedCubes];
    } else if (mode === 'remix') {
      result = [...seedCubes, ...newPlacedCubes];
    } else {
      result = newPlacedCubes;
    }
    store.setPlacedCubes(result);
    store.pushToHistory(result);
  },
}));
