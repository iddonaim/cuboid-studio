import { create } from 'zustand';
import { encodeSpace, EncodedCube, SpatialReading } from '../lib/api/encodeSpace';
import { getActiveSiteContext } from '../lib/storage/siteContext';
import { PlacedCube } from '../lib/cube/types';
import { SavedState, savedStateToPlacedCubes } from '../lib/savedStates';
import { GRID_STRIDE, CUBE_SIZE } from '../lib/cube/constants';
import { useBuilderStore } from './useBuilderStore';
import { useLexiconStore } from './useLexiconStore';
import type { SpatialLexicon } from '../prompts/lexicon.default';

type EncodingMode = 'standalone' | 'merge' | 'remix';

function cloneReading(reading: SpatialReading): SpatialReading {
  return JSON.parse(JSON.stringify(reading)) as SpatialReading;
}

function readingsEqual(a: SpatialReading, b: SpatialReading): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clearReadingFields() {
  return {
    encodingReading: null as SpatialReading | null,
    encodingReadingOriginal: null as SpatialReading | null,
    readingEdited: false,
    encodingLexicon: null as SpatialLexicon | null,
    encodingLexiconId: null as string | null,
  };
}

/** Grid-snap each cube and drop collisions with the seed. Shared by a normal
 *  encode and the Model lab so a compared result renders identically to a
 *  live one. Y axis is offset by CUBE_SIZE/2 (ground level = 21, not 0). */
function processEncodedCubes(cubes: EncodedCube[], seedCubes: PlacedCube[]): EncodedCube[] {
  const snapAxis = (v: number, axis: number) =>
    axis === 1
      ? Math.round((v - CUBE_SIZE / 2) / GRID_STRIDE) * GRID_STRIDE + CUBE_SIZE / 2
      : Math.round(v / GRID_STRIDE) * GRID_STRIDE;
  const occupied = new Set(seedCubes.map((c) => c.position.join(',')));
  return cubes
    .map((cube) => ({
      ...cube,
      position: cube.position.map(snapAxis) as [number, number, number],
    }))
    .filter((cube) => !occupied.has(cube.position.join(',')));
}

/** One model's outcome in an encode comparison run. Nothing renders until the
 *  architect picks an entry via showComparisonEntry(). */
export interface EncodeComparisonEntry {
  modelId: string;
  label: string;
  status: 'running' | 'done' | 'error';
  error?: string;
  elapsedMs?: number;
  /** Model id the server actually used (echoed back by the API). */
  resolvedModel?: string | null;
  reading?: SpatialReading | null;
  reasoning?: string;
  /** Processed (grid-snapped, seed-filtered) cubes, ready to render as-is. */
  cubes?: EncodedCube[];
  lexicon?: SpatialLexicon | null;
  lexiconId?: string | null;
}

export interface UploadedEncodingImage {
  id: string;
  dataUrl: string;
  base64: string;
  mediaType: string;
  /** Small JPEG (~240px) persisted with saved compositions. */
  thumbnailDataUrl: string;
}

interface EncodingState {
  // Image (single-photo mode)
  uploadedImage: string | null;
  imageBase64: string | null;
  imageMediaType: string | null;
  imageThumbnail: string | null;
  setImage: (dataUrl: string, base64: string, mediaType: string, thumbnailDataUrl: string) => void;
  clearImage: () => void;
  /** True after a composition load restored thumbnails only (no full-res
   *  photo data, by design — keeps saves small). Encoding is disabled until
   *  the architect re-uploads the real photo(s). */
  imagesRestoredOnly: boolean;


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
  /** Working copy shown in the panel (may be architect-revised). */
  encodingReading: SpatialReading | null;
  /** Model-produced reading preserved for provenance; never mutated by edits. */
  encodingReadingOriginal: SpatialReading | null;
  /** True when working copy differs from the model original. */
  readingEdited: boolean;
  /** The full lexicon value used for this encode (captured at encode time). */
  encodingLexicon: SpatialLexicon | null;
  /** The Firestore id of the lexicon used, if it was a saved one. Null = DEFAULT_LEXICON. */
  encodingLexiconId: string | null;
  lastError: string | null;
  updateEncodingReading: (reading: SpatialReading) => void;

  // Mode & seed
  mode: EncodingMode;
  seedCubes: PlacedCube[];
  seedCubeIds: Set<string>;
  /**
   * Standalone edited-assembly preview toggle. After the user loads an encoded
   * result into the builder, edits it, and presses Done, the Encoding preview
   * shows the edited assembly (original cubes + additions). When false, the
   * cubes added in the builder are hidden so only the original encoded result
   * is shown (a simple "before / after" view). Defaults to true.
   */
  showAdditions: boolean;
  setShowAdditions: (show: boolean) => void;
  setMode: (mode: EncodingMode) => void;
  setSeedFromBuilder: () => void;
  setSeedFromSavedState: (savedState: SavedState) => void;

  // Seed-edit overlay: when true, the Encoding surface temporarily mounts the
  // Builder UI so the user can build / edit the merge seed inline.
  // Closing the overlay re-snapshots `placedCubes` into `seedCubes`.
  seedEditOpen: boolean;
  openSeedEdit: () => void;
  closeSeedEdit: () => void;

  // Model comparison (same photo(s) through several models, one preview canvas)
  encodeComparisonEntries: EncodeComparisonEntry[];
  isComparingEncode: boolean;
  runEncodeComparison: (models: { id: string; label: string }[]) => Promise<void>;
  /** Load one finished entry into the single preview (encodedCubes + reading),
   *  so the existing canvas and Load buttons operate on it unchanged. */
  showComparisonEntry: (modelId: string) => void;
  clearEncodeComparison: () => void;

  // Actions
  encode: () => Promise<void>;
  loadIntoBuilder: () => void;
}

export const useEncodingStore = create<EncodingState>((set, get) => ({
  // Image
  uploadedImage: null,
  imageBase64: null,
  imageMediaType: null,
  imageThumbnail: null,
  imagesRestoredOnly: false,
  setImage: (dataUrl, base64, mediaType, thumbnailDataUrl) => set({
    uploadedImage: dataUrl,
    imageBase64: base64,
    imageMediaType: mediaType,
    imageThumbnail: thumbnailDataUrl,
    imagesRestoredOnly: false,
    encodedCubes: null,
    encodingReasoning: null,
    ...clearReadingFields(),
    lastError: null,
  }),
  clearImage: () => set({
    uploadedImage: null,
    imageBase64: null,
    imageMediaType: null,
    imageThumbnail: null,
    imagesRestoredOnly: false,
    encodedCubes: null,
    encodingReasoning: null,
    ...clearReadingFields(),
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
          thumbnailDataUrl: state.imageThumbnail || state.uploadedImage,
        }],
        primaryImageId: id,
        uploadedImage: null,
        imageBase64: null,
        imageMediaType: null,
        imageThumbnail: null,
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
        imageThumbnail: primary.thumbnailDataUrl,
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
      imagesRestoredOnly: false,
      encodedCubes: null,
      encodingReasoning: null,
      ...clearReadingFields(),
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
      ...clearReadingFields(),
      lastError: null,
    };
  }),

  setPrimaryImage: (id) => set({ primaryImageId: id }),

  clearAllImages: () => set({
    uploadedImage: null,
    imageBase64: null,
    imageMediaType: null,
    imageThumbnail: null,
    imagesRestoredOnly: false,
    uploadedImages: [],
    primaryImageId: null,
    encodedCubes: null,
    encodingReasoning: null,
    ...clearReadingFields(),
    lastError: null,
  }),

  // Encoding state
  isEncoding: false,
  encodedCubes: null,
  encodingReasoning: null,
  encodingReading: null,
  encodingReadingOriginal: null,
  readingEdited: false,
  encodingLexicon: null,
  encodingLexiconId: null,
  lastError: null,

  updateEncodingReading: (reading) => {
    const { encodingReadingOriginal } = get();
    const readingEdited = encodingReadingOriginal
      ? !readingsEqual(reading, encodingReadingOriginal)
      : true;
    set({ encodingReading: reading, readingEdited });
  },

  // Mode & seed
  mode: 'standalone',
  seedCubes: [],
  seedCubeIds: new Set<string>(),
  showAdditions: true,
  setShowAdditions: (showAdditions) => set({ showAdditions }),

  setMode: (mode) => set({
    mode,
    seedCubes: [],
    seedCubeIds: new Set<string>(),
    showAdditions: true,
    encodedCubes: null,
    encodingReasoning: null,
    ...clearReadingFields(),
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

  // Model comparison
  encodeComparisonEntries: [],
  isComparingEncode: false,

  runEncodeComparison: async (models) => {
    const {
      multiPhotoEnabled,
      uploadedImages,
      primaryImageId,
      imageBase64,
      imageMediaType,
      imagesRestoredOnly,
    } = get();

    if (imagesRestoredOnly) {
      set({ lastError: 'This composition only has saved thumbnails — re-upload the photo(s) to encode.' });
      return;
    }

    const hasMulti = multiPhotoEnabled && uploadedImages.length > 0;
    const hasSingle = !multiPhotoEnabled && imageBase64;
    if (!hasMulti && !hasSingle) {
      set({ lastError: 'No image provided' });
      return;
    }
    if (models.length === 0) return;

    // Capture lexicon + site context once so every model reads under the same
    // conditions (the comparison is only meaningful if the inputs are fixed).
    const capturedLexiconId = useLexiconStore.getState().activeLexiconId;
    const capturedLexicon = useLexiconStore.getState().getActiveLexicon();
    const activeSite = getActiveSiteContext();
    const hasSiteCoords =
      activeSite && activeSite.quantitative.location.lat && activeSite.quantitative.location.lng;
    const siteContext = hasSiteCoords ? activeSite : undefined;
    const seedCubes = get().seedCubes;

    set({
      isComparingEncode: true,
      lastError: null,
      encodeComparisonEntries: models.map((m) => ({
        modelId: m.id,
        label: m.label,
        status: 'running' as const,
      })),
    });

    const update = (modelId: string, patch: Partial<EncodeComparisonEntry>) =>
      set({
        encodeComparisonEntries: get().encodeComparisonEntries.map((e) =>
          e.modelId === modelId ? { ...e, ...patch } : e
        ),
      });

    // All models run in parallel on the same inputs; failures stay per-entry so
    // one wrong model id never sinks the rest of the comparison.
    await Promise.all(
      models.map(async (m) => {
        const t0 = performance.now();
        try {
          const result = hasMulti
            ? await encodeSpace({
                images: uploadedImages.map((img) => ({
                  base64: img.base64,
                  mediaType: img.mediaType,
                  isPrimary: img.id === primaryImageId,
                })),
                siteContext,
                model: m.id,
              })
            : await encodeSpace({
                imageBase64: imageBase64!,
                imageMediaType: imageMediaType || 'image/jpeg',
                siteContext,
                model: m.id,
              });
          update(m.id, {
            status: 'done',
            elapsedMs: Math.round(performance.now() - t0),
            resolvedModel: result.model ?? null,
            reading: result.reading ?? null,
            reasoning: result.reasoning,
            cubes: processEncodedCubes(result.cubes, seedCubes),
            lexicon: capturedLexicon,
            lexiconId: capturedLexiconId,
          });
        } catch (error) {
          update(m.id, {
            status: 'error',
            elapsedMs: Math.round(performance.now() - t0),
            error: error instanceof Error ? error.message : 'Encoding failed',
          });
        }
      })
    );

    set({ isComparingEncode: false });
  },

  showComparisonEntry: (modelId) => {
    const entry = get().encodeComparisonEntries.find((e) => e.modelId === modelId);
    if (!entry || entry.status !== 'done' || !entry.cubes) return;
    const modelReading = entry.reading ?? null;
    // Match a normal encode: in standalone, drop any leftover edited-assembly
    // snapshot (`seedCubes`) so the preview shows THIS composition rather than
    // staying pinned to a prior load→edit round-trip (which would make the
    // 3D preview look unchanged when a result is shown).
    const clearStandaloneSeed =
      get().mode === 'standalone'
        ? { seedCubes: [] as PlacedCube[], seedCubeIds: new Set<string>() }
        : {};
    set({
      encodedCubes: entry.cubes,
      encodingReasoning: entry.reasoning ?? null,
      encodingReadingOriginal: modelReading,
      encodingReading: modelReading ? cloneReading(modelReading) : null,
      readingEdited: false,
      encodingLexicon: entry.lexicon ?? null,
      encodingLexiconId: entry.lexiconId ?? null,
      lastError: null,
      ...clearStandaloneSeed,
    });
  },

  clearEncodeComparison: () => set({ encodeComparisonEntries: [], isComparingEncode: false }),

  // Actions
  encode: async () => {
    const {
      multiPhotoEnabled,
      uploadedImages,
      primaryImageId,
      imageBase64,
      imageMediaType,
      imagesRestoredOnly,
    } = get();

    if (imagesRestoredOnly) {
      set({ lastError: 'This composition only has saved thumbnails — re-upload the photo(s) to encode.' });
      return;
    }

    const hasMulti = multiPhotoEnabled && uploadedImages.length > 0;
    const hasSingle = !multiPhotoEnabled && imageBase64;

    if (!hasMulti && !hasSingle) {
      set({ lastError: 'No image provided' });
      return;
    }

    // Capture the active lexicon now (synchronously) so provenance is consistent
    // even if the user switches lexicons while the encode is in flight.
    const capturedLexiconId = useLexiconStore.getState().activeLexiconId;
    const capturedLexicon = useLexiconStore.getState().getActiveLexicon();

    // Keep prior cubes / reasoning / reading visible until a new encode succeeds (L2 safety floor).
    // In standalone, drop any prior edited-assembly snapshot (`seedCubes`) so the
    // fresh encode isn't previewed against stale builder additions.
    const clearStandaloneSeed =
      get().mode === 'standalone'
        ? { seedCubes: [] as PlacedCube[], seedCubeIds: new Set<string>() }
        : {};
    set({ isEncoding: true, lastError: null, showAdditions: true, ...clearStandaloneSeed });

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
      const processed = processEncodedCubes(result.cubes, get().seedCubes);

      const modelReading = result.reading ?? null;
      set({
        encodedCubes: processed,
        encodingReasoning: result.reasoning,
        encodingReadingOriginal: modelReading,
        encodingReading: modelReading ? cloneReading(modelReading) : null,
        readingEdited: false,
        encodingLexicon: capturedLexicon,
        encodingLexiconId: capturedLexiconId,
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
