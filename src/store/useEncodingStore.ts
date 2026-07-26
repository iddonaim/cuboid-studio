import { create } from 'zustand';
import { encodeSpace, EncodedCube, SpatialReading, SeedAssemblyCube } from '../lib/api/encodeSpace';
import { getActiveSiteContext } from '../lib/storage/siteContext';
import { PlacedCube } from '../lib/cube/types';
import { SavedState, savedStateToPlacedCubes } from '../lib/savedStates';
import { GRID_STRIDE, CUBE_SIZE } from '../lib/cube/constants';
import { useBuilderStore } from './useBuilderStore';
import { useLexiconStore } from './useLexiconStore';
import type { SpatialLexicon } from '../prompts/lexicon.default';
import type { OperatorRecord } from '../lib/operators/types';

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
    encodingModel: null as string | null,
    encodingPromptVersion: null as string | null,
    // Every caller of this helper also nulls encodedCubes, and these flags
    // only describe the current result — drop them alongside.
    remixResultReplacesSeed: false,
    resultApplied: false,
  };
}

/** Grid-snap a cube's position. Y is offset by CUBE_SIZE/2 (ground = 21). */
function snapCube(cube: EncodedCube): EncodedCube {
  const snapAxis = (v: number, axis: number) => {
    const snapped =
      axis === 1
        ? Math.round((v - CUBE_SIZE / 2) / GRID_STRIDE) * GRID_STRIDE + CUBE_SIZE / 2
        : Math.round(v / GRID_STRIDE) * GRID_STRIDE;
    return snapped === 0 ? 0 : snapped; // normalise -0 from negative rounding
  };
  return { ...cube, position: cube.position.map(snapAxis) as [number, number, number] };
}

/** Grid-snap each cube and drop collisions with the seed. Shared by a normal
 *  encode and the Model lab so a compared result renders identically to a
 *  live one. */
function processEncodedCubes(cubes: EncodedCube[], seedCubes: PlacedCube[]): EncodedCube[] {
  const occupied = new Set(seedCubes.map((c) => c.position.join(',')));
  const batch = Date.now();
  return cubes
    .map(snapCube)
    .filter((cube) => !occupied.has(cube.position.join(',')))
    .map((cube, i) => ({ ...cube, id: cube.id ?? `encoded-${batch}-${i}` }));
}

/**
 * Remix result processing. The model returns the COMPLETE reinterpreted
 * assembly (not additions), so nothing is filtered against the seed; instead
 * each cube is matched to the seed cell it lands on:
 *
 * - same cell + same variation → "kept": it inherits the seed cube's id, so
 *   its operator history and any id-keyed state carry forward automatically.
 * - same cell + different variation + `inheritOperators` → "transplant": new
 *   id, but `inheritFromSeedId` records whose operators to re-apply on load.
 * - everything else → a new cube with a fresh id.
 *
 * Exported for tests. If the model places two cubes in one cell, the first
 * wins (a cell can only hold one cube).
 */
export function processRemixResult(cubes: EncodedCube[], seedCubes: PlacedCube[]): EncodedCube[] {
  const seedByCell = new Map(seedCubes.map((c) => [c.position.join(','), c]));
  const batch = Date.now();
  const seen = new Set<string>();
  const out: EncodedCube[] = [];
  cubes.map(snapCube).forEach((cube, i) => {
    const cell = cube.position.join(',');
    if (seen.has(cell)) return;
    seen.add(cell);
    const seed = seedByCell.get(cell);
    if (seed && seed.variationId === cube.variationId) {
      out.push({ ...cube, id: seed.id, inheritFromSeedId: seed.id });
    } else if (seed && cube.inheritOperators) {
      out.push({ ...cube, id: cube.id ?? `encoded-${batch}-${i}`, inheritFromSeedId: seed.id });
    } else {
      out.push({ ...cube, id: cube.id ?? `encoded-${batch}-${i}` });
    }
  });
  return out;
}

/** Compress operator records into the enum-and-numbers summary the seed
 *  serialisation carries (the server whitelists exactly these fields). */
function summariseOperators(records: OperatorRecord[] | undefined) {
  if (!records || records.length === 0) return {};
  return {
    operators: records.map((r) => ({
      operator: r.operator,
      cutterType: r.cutter.type,
      cutterRotation: r.cutter.rotation,
      magnitude: r.magnitude,
    })),
  };
}

/** Merge/remix: summarise the seed assembly for the encode request so the
 *  model reads what's already placed instead of proposing cubes blind.
 *  Merge reads operator records from the live meme store (dynamic import —
 *  matches the pattern the evolution store uses to avoid circular deps);
 *  remix reads the snapshot taken when the saved seed was selected, since a
 *  saved state's operators are not in the live stores. Returns undefined in
 *  standalone / with an empty seed, keeping those requests byte-identical. */
async function buildSeedAssembly(
  mode: EncodingMode,
  seedCubes: PlacedCube[],
  seedOperators: Record<string, OperatorRecord[]> = {},
): Promise<SeedAssemblyCube[] | undefined> {
  if (mode === 'standalone' || seedCubes.length === 0) return undefined;
  let cubeOperators: Record<string, OperatorRecord[]>;
  if (mode === 'merge') {
    const { useMemeStore } = await import('./useMemeStore');
    cubeOperators = useMemeStore.getState().cubeOperators;
  } else {
    cubeOperators = seedOperators;
  }
  return seedCubes.map((c) => ({
    variationId: c.variationId,
    position: c.position,
    rotation: { x: c.rotation.x, y: c.rotation.y },
    operatorCount: cubeOperators[c.id]?.length ?? 0,
    ...summariseOperators(cubeOperators[c.id]),
  }));
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
  /** Grammar "# version" the server reported for this entry's encode. */
  promptVersion?: string | null;
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
  /** Model id the server reported for the current encode result (provenance). */
  encodingModel: string | null;
  /** Grammar-template "# version" the server reported for the current encode. */
  encodingPromptVersion: string | null;
  lastError: string | null;
  updateEncodingReading: (reading: SpatialReading) => void;

  // Mode & seed
  mode: EncodingMode;
  seedCubes: PlacedCube[];
  seedCubeIds: Set<string>;
  /** Remix: operator records of the selected saved seed, keyed by cube id.
   *  Snapshotted when the seed is picked (a saved state's operators live in
   *  the save, not the live stores). Feeds the encode request's per-cut
   *  summary and the keep/transplant inheritance on load. */
  seedOperators: Record<string, OperatorRecord[]>;
  /** True when the current encode result is a remix reinterpretation — the
   *  full assembly, which REPLACES the seed on load instead of overlaying it.
   *  Only set when the server confirmed the remix grammar section ran
   *  (`remixApplied`), so a not-yet-pasted section degrades to overlay. */
  remixResultReplacesSeed: boolean;
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

  /** True once the current encode result has been applied into the assembly
   *  (via Apply / Edit / Apply-memes). Reset whenever a new result arrives or
   *  the inputs change, so the panel knows whether to offer "Apply" or the
   *  post-apply follow-ups. */
  resultApplied: boolean;

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
  encodingModel: null,
  encodingPromptVersion: null,
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
  seedOperators: {},
  remixResultReplacesSeed: false,
  resultApplied: false,
  showAdditions: true,
  setShowAdditions: (showAdditions) => set({ showAdditions }),

  // Switching modes resets only the mode-specific seed. The encode result
  // (cubes + reading + provenance) survives the switch — it cost an API call,
  // and clearing it here silently destroyed work on a single tab click. It is
  // replaced by the next successful encode or cleared with the image.
  setMode: (mode) => set({
    mode,
    seedCubes: [],
    seedCubeIds: new Set<string>(),
    seedOperators: {},
    showAdditions: true,
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
    // Snapshot the save's operator records too — remix sends them to the
    // model and re-applies them to kept/transplanted cubes on load.
    const seedOperators: Record<string, OperatorRecord[]> = {};
    for (const cube of savedState.data.cubes) {
      if (!cube.operators || cube.operators.length === 0) continue;
      seedOperators[cube.id] = cube.operators.map((op) => ({
        id: op.id,
        source: 'meme' as const,
        operator: op.operator as OperatorRecord['operator'],
        targets: op.targets as OperatorRecord['targets'],
        magnitude: op.magnitude,
        decay: op.decay,
        createdAt: op.createdAt,
        memeDescription: op.memeDescription,
        reasoning: op.reasoning,
        cutter: op.cutter as OperatorRecord['cutter'],
      }));
    }
    set({
      seedCubes: cubes,
      seedCubeIds: new Set(cubes.map(c => c.id)),
      seedOperators,
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
    // Captured once so every compared model sees the same seed summary.
    // Comparison stays merge-only: the (archived) Model lab has no handling
    // for remix's replace-the-seed result semantics.
    const seedAssembly =
      get().mode === 'merge' ? await buildSeedAssembly('merge', seedCubes) : undefined;

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
                seedAssembly,
              })
            : await encodeSpace({
                imageBase64: imageBase64!,
                imageMediaType: imageMediaType || 'image/jpeg',
                siteContext,
                model: m.id,
                seedAssembly,
              });
          update(m.id, {
            status: 'done',
            elapsedMs: Math.round(performance.now() - t0),
            resolvedModel: result.model ?? null,
            promptVersion: result.promptVersion ?? null,
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
      encodingModel: entry.resolvedModel ?? entry.modelId,
      encodingPromptVersion: entry.promptVersion ?? null,
      resultApplied: false,
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
      // Merge/remix: send the seed so the model builds against it (merge) or
      // reinterprets it (remix). Standalone sends nothing.
      const mode = get().mode;
      const seedAssembly = await buildSeedAssembly(mode, get().seedCubes, get().seedOperators);
      const seedMode = mode === 'remix' ? ('remix' as const) : ('merge' as const);

      const result = hasMulti
        ? await encodeSpace({
            images: uploadedImages.map((img) => ({
              base64: img.base64,
              mediaType: img.mediaType,
              isPrimary: img.id === primaryImageId,
            })),
            siteContext,
            seedAssembly,
            seedMode,
          })
        : await encodeSpace({
            imageBase64: imageBase64!,
            imageMediaType: imageMediaType || 'image/jpeg',
            siteContext,
            seedAssembly,
            seedMode,
          });

      // Remix v2 (server confirmed the remix grammar ran): the result is the
      // complete reinterpreted assembly — match cubes to seed cells for
      // keep/transplant inheritance instead of dropping collisions. Anything
      // else keeps the legacy path: snap + drop seed collisions (overlay).
      const isRemixReplace = get().mode === 'remix' && result.remixApplied === true;
      const processed = isRemixReplace
        ? processRemixResult(result.cubes, get().seedCubes)
        : processEncodedCubes(result.cubes, get().seedCubes);

      const modelReading = result.reading ?? null;
      set({
        encodedCubes: processed,
        remixResultReplacesSeed: isRemixReplace,
        encodingReasoning: result.reasoning,
        encodingReadingOriginal: modelReading,
        encodingReading: modelReading ? cloneReading(modelReading) : null,
        readingEdited: false,
        encodingLexicon: capturedLexicon,
        encodingLexiconId: capturedLexiconId,
        encodingModel: result.model ?? null,
        encodingPromptVersion: result.promptVersion ?? null,
        resultApplied: false,
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
    const { encodedCubes, mode, seedCubes, remixResultReplacesSeed, seedOperators } = get();
    if (!encodedCubes || encodedCubes.length === 0) return;
    set({ resultApplied: true });

    // Reuse the result's stable ids (older saved compositions may predate
    // them, hence the fallback) so loading the same result twice — or via
    // both Load buttons — keeps identical cube ids, and id-keyed state
    // (operator history, evolution candidates) stays valid.
    const fallbackBatch = Date.now();
    const newPlacedCubes: PlacedCube[] = encodedCubes.map((cube, i) => ({
      id: cube.id ?? `encoded-${fallbackBatch}-${i}`,
      variationId: cube.variationId,
      position: cube.position,
      rotation: {
        x: (cube.rotation.x as 0 | 1 | 2 | 3) || 0,
        y: (cube.rotation.y as 0 | 1 | 2 | 3) || 0,
      },
    }));

    const store = useBuilderStore.getState();

    // Remix v2: the result IS the assembly — it replaces the seed rather than
    // overlaying it. Operator history the model kept or transplanted is then
    // re-applied asynchronously (geometry rebuilding is CSG work).
    if (mode === 'remix' && remixResultReplacesSeed) {
      store.setPlacedCubes(newPlacedCubes);
      store.pushToHistory(newPlacedCubes);
      void applyInheritedSeedOperators(encodedCubes, seedOperators);
      return;
    }

    const base =
      mode === 'merge' ? store.placedCubes : mode === 'remix' ? seedCubes : [];
    // Skip cubes already present (same id or same occupied cell) so repeated
    // loads never stack duplicates into one grid cell.
    const usedIds = new Set(base.map(c => c.id));
    const usedCells = new Set(base.map(c => c.position.join(',')));
    const additions = newPlacedCubes.filter(
      c => !usedIds.has(c.id) && !usedCells.has(c.position.join(','))
    );
    const result = [...base, ...additions];
    store.setPlacedCubes(result);
    store.pushToHistory(result);
  },
}));

/**
 * Remix load, step two: carry the seed's operator history onto the cubes that
 * kept or transplanted it. `inheritFromSeedId` (assigned by
 * processRemixResult) says whose records each cube inherits; the records are
 * replayed against the cube's base variation geometry — the same rebuild a
 * composition load does — so the cuts reappear on the new assembly, and the
 * explanation cards stay intact. Per-cube state is overwritten, not appended,
 * so re-loading the same result twice can't double-cut anything.
 */
async function applyInheritedSeedOperators(
  encodedCubes: EncodedCube[],
  seedOperators: Record<string, OperatorRecord[]>,
) {
  const inherited: Record<string, OperatorRecord[]> = {};
  const variations: Record<string, string> = {};
  for (const cube of encodedCubes) {
    if (!cube.id || !cube.inheritFromSeedId) continue;
    const records = seedOperators[cube.inheritFromSeedId];
    if (!records || records.length === 0) continue;
    inherited[cube.id] = records;
    variations[cube.id] = cube.variationId;
  }
  if (Object.keys(inherited).length === 0) return;

  // Dynamic imports: composition.ts and the meme store both reach back into
  // this store at module level.
  const { rebuildAssemblyGeometry } = await import('../lib/projects/composition');
  const { useMemeStore } = await import('./useMemeStore');
  const rebuilt = await rebuildAssemblyGeometry(variations, inherited);
  const meme = useMemeStore.getState();
  useMemeStore.setState({
    cubeOperators: { ...meme.cubeOperators, ...inherited },
    cubeGeometryOverrides: { ...meme.cubeGeometryOverrides, ...rebuilt.cubeGeometryOverrides },
    cubeGeometryStacks: { ...meme.cubeGeometryStacks, ...rebuilt.cubeGeometryStacks },
    cubeTranslations: { ...meme.cubeTranslations, ...rebuilt.cubeTranslations },
  });
}
