import { create } from 'zustand';
import { encodeSpace, EncodedCube } from '../lib/api/encodeSpace';
import { getActiveSiteContext } from '../lib/storage/siteContext';
import { PlacedCube } from '../lib/cube/types';
import { SavedState, savedStateToPlacedCubes } from '../lib/savedStates';
import { GRID_STRIDE, CUBE_SIZE } from '../lib/cube/constants';
import { useBuilderStore } from './useBuilderStore';

type EncodingMode = 'standalone' | 'merge' | 'remix';

export interface UploadedEncodingImage {
  id: string;
  dataUrl: string;
  base64: string;
  mediaType: string;
}

interface EncodingState {
  // Image (single-photo mode)
  uploadedImage: string | null;
  imageBase64: string | null;
  imageMediaType: string | null;
  setImage: (dataUrl: string, base64: string, mediaType: string) => void;
  clearImage: () => void;

  // Multi-photo mode
  multiPhotoEnabled: boolean;
  uploadedImages: UploadedEncodingImage[];
  primaryImageId: string | null;
  setMultiPhotoEnabled: (enabled: boolean) => void;
  addImages: (images: UploadedEncodingImage[]) => void;
  removeImage: (id: string) => void;
  setPrimaryImage: (id: string) => void;
  clearAllImages: () => void;

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

  multiPhotoEnabled: false,
  uploadedImages: [],
  primaryImageId: null,

  setMultiPhotoEnabled: (enabled) => {
    const state = get();
    if (enabled && !state.multiPhotoEnabled && state.uploadedImage && state.imageBase64) {
      const id = `img-${Date.now()}`;
      set({
        multiPhotoEnabled: true,
        uploadedImages: [{
          id,
          dataUrl: state.uploadedImage,
          base64: state.imageBase64,
          mediaType: state.imageMediaType || 'image/jpeg',
        }],
        primaryImageId: id,
        uploadedImage: null,
        imageBase64: null,
        imageMediaType: null,
      });
      return;
    }
    if (!enabled && state.uploadedImages.length > 0) {
      const primary = state.uploadedImages.find(img => img.id === state.primaryImageId)
        ?? state.uploadedImages[0];
      set({
        multiPhotoEnabled: false,
        uploadedImage: primary.dataUrl,
        imageBase64: primary.base64,
        imageMediaType: primary.mediaType,
        uploadedImages: [],
        primaryImageId: null,
      });
      return;
    }
    set({ multiPhotoEnabled: enabled });
  },

  addImages: (images) => set((state) => {
    const merged = [...state.uploadedImages, ...images].slice(0, 7);
    const primaryImageId = state.primaryImageId ?? merged[0]?.id ?? null;
    return {
      uploadedImages: merged,
      primaryImageId,
      encodedCubes: null,
      encodingReasoning: null,
      lastError: null,
    };
  }),

  removeImage: (id) => set((state) => {
    const uploadedImages = state.uploadedImages.filter(img => img.id !== id);
    let primaryImageId = state.primaryImageId;
    if (primaryImageId === id) {
      primaryImageId = uploadedImages[0]?.id ?? null;
    }
    return {
      uploadedImages,
      primaryImageId,
      encodedCubes: null,
      encodingReasoning: null,
      lastError: null,
    };
  }),

  setPrimaryImage: (id) => set({ primaryImageId: id }),

  clearAllImages: () => set({
    uploadedImage: null,
    imageBase64: null,
    imageMediaType: null,
    uploadedImages: [],
    primaryImageId: null,
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
    const {
      multiPhotoEnabled,
      uploadedImages,
      primaryImageId,
      imageBase64,
      imageMediaType,
    } = get();

    const hasMulti = multiPhotoEnabled && uploadedImages.length > 0;
    const hasSingle = !multiPhotoEnabled && imageBase64;

    if (!hasMulti && !hasSingle) {
      set({ lastError: 'No image provided' });
      return;
    }

    set({ isEncoding: true, lastError: null, encodedCubes: null, encodingReasoning: null });

    const activeSite = getActiveSiteContext();
    const hasSiteCoords =
      activeSite &&
      activeSite.quantitative.location.lat &&
      activeSite.quantitative.location.lng;
    const siteContext = hasSiteCoords ? activeSite : undefined;

    try {
      const result = hasMulti
        ? await encodeSpace({
            images: uploadedImages.map((img) => ({
              base64: img.base64,
              mediaType: img.mediaType,
              isPrimary: img.id === primaryImageId,
            })),
            siteContext,
          })
        : await encodeSpace({
            imageBase64: imageBase64!,
            imageMediaType: imageMediaType || 'image/jpeg',
            siteContext,
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
