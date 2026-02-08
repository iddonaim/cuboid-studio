import { create } from 'zustand';
import { encodeSpace, EncodedCube } from '../lib/api/encodeSpace';
import { PlacedCube } from '../lib/cube/types';
import { DEFAULT_ROTATION } from '../lib/cube/connectionRules';

interface EncodingState {
  // Image
  uploadedImage: string | null;      // data URL for preview
  imageBase64: string | null;        // raw base64 for API
  imageMediaType: string | null;
  setImage: (dataUrl: string, base64: string, mediaType: string) => void;
  clearImage: () => void;

  // Encoding state
  isEncoding: boolean;
  encodedCubes: EncodedCube[] | null;
  encodingReasoning: string | null;
  lastError: string | null;

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

      set({
        encodedCubes: result.cubes,
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
    const { encodedCubes } = get();
    if (!encodedCubes || encodedCubes.length === 0) return;

    // Convert EncodedCubes to PlacedCubes
    const placedCubes: PlacedCube[] = encodedCubes.map((cube, i) => ({
      id: `encoded-${Date.now()}-${i}`,
      variationId: cube.variationId,
      position: cube.position,
      rotation: {
        x: (cube.rotation.x as 0 | 1 | 2 | 3) || 0,
        y: (cube.rotation.y as 0 | 1 | 2 | 3) || 0,
      },
    }));

    // Import builder store dynamically to avoid circular deps
    import('./useBuilderStore').then(({ useBuilderStore }) => {
      const store = useBuilderStore.getState();
      store.setPlacedCubes(placedCubes);
      store.pushToHistory(placedCubes);
    });
  },
}));
