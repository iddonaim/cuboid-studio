/**
 * Composition snapshot + restore.
 *
 * `captureComposition()` reads serialisable state out of every store and the
 * active site context into a single plain-JSON CompositionData object.
 *
 * `restoreComposition()` writes that state back into all stores. The only
 * non-trivial part is the Pataphysical geometry: cut meshes live as
 * THREE.BufferGeometry (not serialisable), so we DON'T store them — instead we
 * re-apply the saved operator records to the base cube geometry to rebuild the
 * identical meshes on load.
 */
import * as THREE from 'three';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useMemeStore } from '../../store/useMemeStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { useDecodeStore } from '../../store/useDecodeStore';
import { getActiveSiteContext, setActiveSiteContext } from '../storage/siteContext';
import { CUBE_VARIATIONS } from '../cube/specifications';
import { getVariationGeometryAsync } from '../cube/csgUtils';
import { applyLLMOperator, createCutterFromLLMOutput } from '../operators/applyOperator';
import type { CubeTranslation } from '../../store/useMemeStore';
import { DEFAULT_LEXICON } from '../../prompts/lexicon.default';
import type { OperatorRecord, LLMOperatorResult } from '../operators/types';
import type { CompositionData } from './types';
import { fetchPhoto, uploadPhoto } from './photoStorage';

/** OperatorRecord carries every field applyLLMOperator needs. */
function recordToResult(record: OperatorRecord): LLMOperatorResult {
  return {
    operator: record.operator,
    targets: record.targets,
    magnitude: record.magnitude,
    decay: record.decay,
    cutter: record.cutter,
    reasoning: record.reasoning,
  };
}

/** Read the complete working state into a plain-JSON snapshot. */
export function captureComposition(): CompositionData {
  const builder = useBuilderStore.getState();
  const encoding = useEncodingStore.getState();
  const meme = useMemeStore.getState();
  const evolution = useEvolutionStore.getState();
  const decode = useDecodeStore.getState();

  const hasUploadedPhotos = encoding.multiPhotoEnabled
    ? encoding.uploadedImages.length > 0
    : Boolean(encoding.uploadedImage);

  const hasEncodeState =
    encoding.encodedCubes !== null || encoding.seedCubes.length > 0 || hasUploadedPhotos;

  // Small thumbnails of whatever photo(s) are currently loaded — restored-only
  // thumbnails (from a prior load) carry forward unchanged on re-save.
  // `storagePath` rides along when the full-resolution original is already in
  // Storage (a prior save, or a load that restored it), so a re-save never
  // re-uploads the same photograph.
  const imageThumbnails = encoding.multiPhotoEnabled
    ? encoding.uploadedImages.map(img => ({
        id: img.id,
        thumbnailDataUrl: img.thumbnailDataUrl,
        isPrimary: img.id === encoding.primaryImageId,
        ...(img.storagePath ? { storagePath: img.storagePath } : {}),
      }))
    : encoding.imageThumbnail
      ? [{
          id: 'single',
          thumbnailDataUrl: encoding.imageThumbnail,
          isPrimary: true,
          ...(encoding.imageStoragePath ? { storagePath: encoding.imageStoragePath } : {}),
        }]
      : [];

  return {
    builderAssembly: {
      placedCubes: builder.placedCubes,
      selectedIdx: builder.selectedIdx,
      rulesEnabled: builder.rulesEnabled,
      strictRulesEnabled: builder.strictRulesEnabled,
    },
    encode: hasEncodeState
      ? {
          encodedCubes: encoding.encodedCubes,
          encodingReasoning: encoding.encodingReasoning,
          mode: encoding.mode,
          seedCubes: encoding.seedCubes,
          // Remix state — how to interpret encodedCubes on load (replace vs
          // overlay). The seed's operator records are the builder assembly's,
          // already persisted under pataphysical, so nothing extra is written.
          ...(encoding.remixResultReplacesSeed ? { remixResultReplacesSeed: true } : {}),
          // Thumbnails of the photo(s) that informed this encode — only
          // written when at least one is loaded.
          ...(imageThumbnails.length > 0 ? { images: imageThumbnails } : {}),
          // Provenance: which model + grammar version produced this encode.
          // The LLM is nondeterministic, so a re-run is never byte-identical —
          // but with the photograph now stored at full resolution, the inputs
          // themselves are archived rather than only described.
          ...(encoding.encodingModel ? { model: encoding.encodingModel } : {}),
          ...(encoding.encodingPromptVersion
            ? { promptVersion: encoding.encodingPromptVersion }
            : {}),
          // Reading + lexicon provenance — only written when a reading exists.
          ...(encoding.encodingReading
            ? {
                reading: encoding.encodingReading,
                readingOriginal: encoding.encodingReadingOriginal ?? undefined,
                readingEdited: encoding.readingEdited,
                // By-value snapshot: self-describing even if the lexicon later changes.
                lexiconSnapshot: JSON.parse(
                  JSON.stringify(encoding.encodingLexicon ?? DEFAULT_LEXICON),
                ),
                // Reference to the saved lexicon, if one was active at encode time.
                ...(encoding.encodingLexiconId
                  ? { lexiconId: encoding.encodingLexiconId }
                  : {}),
              }
            : {}),
        }
      : null,
    pataphysical: {
      memeDescription: meme.memeDescription,
      locationTag: meme.locationTag,
      engagementLevel: meme.engagementLevel,
      selectedMemeImageUrl: meme.selectedMemeImageUrl,
      selectedMemeTitle: meme.selectedMemeTitle,
      selectedMemeSource: meme.selectedMemeSource ?? null,
      baseVariationId: meme.baseVariationId,
      targetCubeId: meme.targetCubeId,
      passMode: meme.passMode,
      operators: meme.operators,
      cubeOperators: meme.cubeOperators,
      lastPass1: meme.lastPass1,
      lastPass2: meme.lastPass2,
      lastConfidenceVector: meme.lastConfidenceVector,
      lastModel: meme.lastModel,
    },
    evolution: {
      subMode: evolution.subMode,
      generation: evolution.generation,
      candidates: evolution.candidates,
      compressibilityLog: evolution.compressibilityLog,
      config: evolution.config,
      baselineScore: evolution.baselineScore,
      lastAppliedCubeId: evolution.lastAppliedCubeId,
    },
    decode: {
      canvasTiles: decode.canvasTiles,
      freestyle: decode.freestyle,
      // Underlay stack: thumbnail + fingerprint + registration inline, with a
      // `storagePath` when the full-resolution original is already stored (see
      // persistCompositionPhotos). Top of the stack first.
      ...(decode.underlays.length > 0
        ? {
            underlays: decode.underlays.map(layer => ({
              id: layer.id,
              source: layer.source,
              label: layer.label,
              visible: layer.visible,
              opacity: layer.opacity,
              ...(layer.storagePath ? { storagePath: layer.storagePath } : {}),
              thumbnailDataUrl: layer.thumbnailDataUrl,
              imageHash: layer.imageHash,
              width: layer.width,
              height: layer.height,
              offsetX: layer.offsetX,
              offsetY: layer.offsetY,
              rotation: layer.rotation,
              scale: layer.scale,
            })),
          }
        : {}),
    },
    siteContextSnapshot: getActiveSiteContext(),
  };
}

/**
 * Upload any photo in this snapshot that isn't in Storage yet, and stamp its
 * path onto the snapshot (and back into the encoding store, so the next save
 * of the same composition reuses the upload).
 *
 * Call between `captureComposition()` and writing the document. Failures are
 * swallowed inside `uploadPhoto` — a photo that won't upload leaves the
 * snapshot exactly as it was before Storage existed: thumbnail only.
 */
export async function persistCompositionPhotos(
  ownerId: string,
  data: CompositionData,
): Promise<CompositionData> {
  const images = data.encode?.images;
  if (!ownerId || !images || images.length === 0) return data;

  const encoding = useEncodingStore.getState();
  const recorded: Record<string, string> = {};

  await Promise.all(
    images.map(async image => {
      if (image.storagePath) return; // already stored by an earlier save
      const source = image.id === 'single'
        ? { base64: encoding.imageBase64, mediaType: encoding.imageMediaType }
        : (() => {
            const match = encoding.uploadedImages.find(img => img.id === image.id);
            return { base64: match?.base64 ?? null, mediaType: match?.mediaType ?? null };
          })();
      if (!source.base64) return; // thumbnail-only photo from an older save
      const path = await uploadPhoto(ownerId, source.base64, source.mediaType || 'image/jpeg');
      if (path) {
        image.storagePath = path;
        recorded[image.id] = path;
      }
    }),
  );

  if (Object.keys(recorded).length > 0) {
    encoding.recordPhotoStoragePaths(recorded);
  }

  await persistUnderlayImages(ownerId, data);
  return data;
}

/**
 * Upload any underlay whose original isn't stored yet, and stamp the path onto
 * both the snapshot and the live layer. Without this a reopened sheet draws
 * its 240px thumbnail — registered, but far too coarse to draw against.
 */
async function persistUnderlayImages(ownerId: string, data: CompositionData): Promise<void> {
  const layers = data.decode.underlays;
  if (!ownerId || !layers || layers.length === 0) return;

  const decode = useDecodeStore.getState();
  const uploaded: Record<string, string> = {};

  await Promise.all(
    layers.map(async layer => {
      if (layer.storagePath || !layer.id) return;
      const live = decode.underlays.find(u => u.id === layer.id);
      const dataUrl = live?.dataUrl;
      if (!dataUrl) return; // restored thumbnail-only layer; nothing to upload
      const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      if (!match) return;
      const path = await uploadPhoto(ownerId, match[2], match[1]);
      if (path) {
        layer.storagePath = path;
        uploaded[layer.id] = path;
      }
    }),
  );

  if (Object.keys(uploaded).length > 0) {
    useDecodeStore.setState({
      underlays: decode.underlays.map(u =>
        uploaded[u.id] ? { ...u, storagePath: uploaded[u.id] } : u
      ),
    });
  }
}

/** Every stored-photo path a composition owns — for cleanup on delete. */
export function compositionPhotoPaths(data: CompositionData): string[] {
  return [
    ...(data.encode?.images ?? []).map(image => image.storagePath),
    ...(data.decode.underlays ?? []).map(layer => layer.storagePath),
  ].filter((path): path is string => Boolean(path));
}

/** Rebuild the standalone working-cube geometry by replaying its operators. */
async function rebuildStandaloneGeometry(
  baseVariationId: string,
  operators: OperatorRecord[],
): Promise<{ workingGeometry: THREE.BufferGeometry | null; geometryStack: THREE.BufferGeometry[] }> {
  const variation = CUBE_VARIATIONS.find(v => v.id === baseVariationId);
  if (!variation) return { workingGeometry: null, geometryStack: [] };

  let current = await getVariationGeometryAsync(variation);
  const stack: THREE.BufferGeometry[] = [];
  for (const record of operators) {
    stack.push(current.clone());
    current = applyLLMOperator(current, recordToResult(record));
  }
  return { workingGeometry: current, geometryStack: stack };
}

/**
 * Rebuild per-cube geometry overrides + stacks by replaying each cube's
 * operators against its base variation geometry. Exported: the encoding
 * store reuses it to re-apply kept/transplanted seed operators after a
 * remix load.
 */
export async function rebuildAssemblyGeometry(
  placedCubeVariations: Record<string, string>,
  cubeOperators: Record<string, OperatorRecord[]>,
): Promise<{
  cubeGeometryOverrides: Record<string, THREE.BufferGeometry>;
  cubeGeometryStacks: Record<string, THREE.BufferGeometry[]>;
  cubeTranslations: Record<string, CubeTranslation>;
}> {
  const overrides: Record<string, THREE.BufferGeometry> = {};
  const stacks: Record<string, THREE.BufferGeometry[]> = {};
  const translations: Record<string, CubeTranslation> = {};

  for (const [cubeId, records] of Object.entries(cubeOperators)) {
    if (!records || records.length === 0) continue;
    const variationId = placedCubeVariations[cubeId];
    const variation = variationId
      ? CUBE_VARIATIONS.find(v => v.id === variationId)
      : undefined;
    if (!variation) continue;

    let current = await getVariationGeometryAsync(variation);
    const stack: THREE.BufferGeometry[] = [];
    for (const record of records) {
      stack.push(current.clone());
      current = applyLLMOperator(current, recordToResult(record));
    }
    overrides[cubeId] = current;
    stacks[cubeId] = stack;

    // Rebuild the "explanation card" snapshot from the last record so
    // clicking this cube after a load restores the readable result +
    // cutter wireframe. Records saved before provenance fields existed
    // degrade gracefully (no pass1/pass2/meme image, but cutter + reasoning
    // always survive).
    const last = records[records.length - 1];
    const preCut = stack[stack.length - 1];
    preCut.computeBoundingBox();
    const lastResult = recordToResult(last);
    translations[cubeId] = {
      result: lastResult,
      pass1: last.pass1 ?? null,
      pass2: last.pass2 ?? null,
      confidenceVector: last.confidenceVector ?? null,
      model: last.model ?? null,
      cutterGeometry: preCut.boundingBox
        ? createCutterFromLLMOutput(lastResult, preCut.boundingBox)
        : null,
      memeDescription: last.memeDescription,
      memeTitle: last.memeTitle ?? null,
      memeImageUrl: last.memeImageUrl ?? null,
    };
  }

  return { cubeGeometryOverrides: overrides, cubeGeometryStacks: stacks, cubeTranslations: translations };
}

/**
 * Restore a composition into every store. Async because it rebuilds cut
 * geometry. Returns a suggested landing mode for the caller to switch to.
 */
export async function restoreComposition(
  data: CompositionData,
): Promise<{ landingMode: 'encoding' | 'decode' }> {
  // --- Site context (restore first so encode/other reads see it) ---
  if (data.siteContextSnapshot) {
    setActiveSiteContext(data.siteContextSnapshot);
  }

  // --- Builder ---
  const builder = useBuilderStore.getState();
  builder.setPlacedCubes(data.builderAssembly.placedCubes);
  useBuilderStore.setState({
    selectedIdx: data.builderAssembly.selectedIdx,
    rulesEnabled: data.builderAssembly.rulesEnabled,
    strictRulesEnabled: data.builderAssembly.strictRulesEnabled,
    selectedCubeId: null,
    selectedCubeIds: [],
    // Reset undo history to the restored assembly so undo can't escape it.
    history: [data.builderAssembly.placedCubes],
    historyIndex: 0,
  });

  // --- Encode ---
  if (data.encode) {
    const images = data.encode.images ?? [];
    const isMultiPhoto = images.length > 1;

    // Pull the full-resolution originals back from Storage, in parallel.
    // Anything without a path (saved before photos were stored, or saved with
    // no bucket configured) resolves to null and keeps its thumbnail.
    const restoredPhotos = await Promise.all(
      images.map(async image => {
        if (!image.storagePath) return null;
        const photo = await fetchPhoto(image.storagePath);
        if (!photo) return null;
        return {
          base64: photo.base64,
          mediaType: photo.mediaType,
          dataUrl: `data:${photo.mediaType};base64,${photo.base64}`,
        };
      }),
    );
    const allPhotosRestored =
      images.length > 0 && restoredPhotos.every(photo => photo !== null);

    useEncodingStore.setState({
      encodedCubes: data.encode.encodedCubes,
      encodingReasoning: data.encode.encodingReasoning,
      mode: data.encode.mode,
      seedCubes: data.encode.seedCubes,
      seedCubeIds: new Set(data.encode.seedCubes.map(c => c.id)),
      remixResultReplacesSeed: data.encode.remixResultReplacesSeed ?? false,
      // Reading provenance — gracefully absent on pre-L3 compositions.
      encodingReading: data.encode.reading ?? null,
      encodingReadingOriginal: data.encode.readingOriginal ?? null,
      // Restore the saved boolean directly — do not recompute from a comparison,
      // as reconstruction risks provenance errors after a round-trip.
      readingEdited: data.encode.readingEdited ?? false,
      // Lexicon provenance — restore so a re-save after load preserves the snapshot.
      encodingLexicon: data.encode.lexiconSnapshot ?? null,
      encodingLexiconId: data.encode.lexiconId ?? null,
      // Model + prompt provenance — absent on pre-provenance compositions.
      encodingModel: data.encode.model ?? null,
      encodingPromptVersion: data.encode.promptVersion ?? null,
      // Photos: the full-resolution originals come back from Storage when the
      // save carried them (`restoredPhotos`, resolved above). Anything the
      // fetch couldn't produce falls back to its thumbnail, which is display
      // -only — so encoding stays blocked unless EVERY photo came back whole,
      // since a half-restored set would encode against missing images.
      multiPhotoEnabled: isMultiPhoto,
      uploadedImage: !isMultiPhoto && images[0]
        ? (restoredPhotos[0]?.dataUrl ?? images[0].thumbnailDataUrl)
        : null,
      imageBase64: !isMultiPhoto ? (restoredPhotos[0]?.base64 ?? null) : null,
      imageMediaType: !isMultiPhoto && images[0]
        ? (restoredPhotos[0]?.mediaType ?? 'image/jpeg')
        : null,
      imageThumbnail: !isMultiPhoto && images[0] ? images[0].thumbnailDataUrl : null,
      imageStoragePath: !isMultiPhoto ? (images[0]?.storagePath ?? null) : null,
      uploadedImages: isMultiPhoto
        ? images.map((img, i) => ({
            id: img.id,
            dataUrl: restoredPhotos[i]?.dataUrl ?? img.thumbnailDataUrl,
            base64: restoredPhotos[i]?.base64 ?? '',
            mediaType: restoredPhotos[i]?.mediaType ?? 'image/jpeg',
            thumbnailDataUrl: img.thumbnailDataUrl,
            ...(img.storagePath ? { storagePath: img.storagePath } : {}),
          }))
        : [],
      primaryImageId: isMultiPhoto ? (images.find(img => img.isPrimary)?.id ?? images[0]?.id ?? null) : null,
      imagesRestoredOnly: images.length > 0 && !allPhotosRestored,
    });
  }

  // --- Pataphysical (meme) + geometry rebuild ---
  const p = data.pataphysical;
  const placedCubeVariations: Record<string, string> = {};
  for (const cube of data.builderAssembly.placedCubes) {
    placedCubeVariations[cube.id] = cube.variationId;
  }

  const [standalone, assembly] = await Promise.all([
    rebuildStandaloneGeometry(p.baseVariationId, p.operators),
    rebuildAssemblyGeometry(placedCubeVariations, p.cubeOperators),
  ]);

  useMemeStore.setState({
    memeDescription: p.memeDescription,
    locationTag: p.locationTag,
    engagementLevel: p.engagementLevel,
    selectedMemeImageUrl: p.selectedMemeImageUrl,
    selectedMemeTitle: p.selectedMemeTitle,
    // Older snapshots predate the source field — a selected meme back then
    // could only have come from archthesis.
    selectedMemeSource: p.selectedMemeSource
      ?? (p.selectedMemeImageUrl ? 'archthesis' : null),
    baseVariationId: p.baseVariationId,
    targetCubeId: p.targetCubeId,
    // The single/two-pass toggle is retired from the UI (two-pass is the
    // committed reading), so a composition saved in single-pass mode must not
    // silently re-enter it — there would be no visible way back.
    passMode: 'two_pass',
    operators: p.operators,
    cubeOperators: p.cubeOperators,
    workingGeometry: standalone.workingGeometry,
    geometryStack: standalone.geometryStack,
    cubeGeometryOverrides: assembly.cubeGeometryOverrides,
    cubeGeometryStacks: assembly.cubeGeometryStacks,
    cubeTranslations: assembly.cubeTranslations,
    lastPass1: p.lastPass1,
    lastPass2: p.lastPass2,
    lastConfidenceVector: p.lastConfidenceVector,
    lastModel: p.lastModel,
    lastResult: null,
    lastCutterGeometry: null,
    lastError: null,
    isTranslating: false,
    translationPhase: 'idle',
  });

  // --- Evolution ---
  useEvolutionStore.setState({
    subMode: data.evolution.subMode,
    generation: data.evolution.generation,
    candidates: data.evolution.candidates,
    compressibilityLog: data.evolution.compressibilityLog,
    config: data.evolution.config,
    baselineScore: data.evolution.baselineScore,
    lastAppliedCubeId: data.evolution.lastAppliedCubeId,
    selectedCandidateId: null,
    previewCandidateId: null,
    isGenerating: false,
    generationPhase: null,
    lastError: null,
  });

  // --- Decode ---
  // Underlay stack, with the legacy single field folded in. Full-resolution
  // originals come back from Storage in parallel; anything without a path (an
  // older save, or no bucket configured) keeps its thumbnail.
  const storedUnderlays = data.decode.underlays
    ?? (data.decode.underlay ? [data.decode.underlay] : []);
  const restoredUnderlays = await Promise.all(
    storedUnderlays.map(async layer => {
      if (!layer.storagePath) return null;
      const photo = await fetchPhoto(layer.storagePath);
      return photo ? `data:${photo.mediaType};base64,${photo.base64}` : null;
    }),
  );

  useDecodeStore.setState({
    canvasTiles: data.decode.canvasTiles,
    freestyle: data.decode.freestyle,
    // Underlay restores registered but thumbnail-only (dataUrl is never
    // persisted); re-importing the plan file restores full resolution.
    // Underlays: the stack as saved, or a legacy single underlay read in as a
    // one-item stack. `dataUrl` starts null and the full-resolution originals
    // are fetched below — until they land, each layer draws its thumbnail.
    underlays: storedUnderlays.map((layer, i) => ({
      id: layer.id ?? crypto.randomUUID(),
      source: layer.source ?? 'plan',
      label: layer.label ?? (layer.source === 'capture' ? 'Capture' : 'Plan'),
      visible: layer.visible ?? true,
      opacity: layer.opacity ?? 1,
      ...(layer.storagePath ? { storagePath: layer.storagePath } : {}),
      dataUrl: restoredUnderlays[i] ?? null,
      thumbnailDataUrl: layer.thumbnailDataUrl,
      imageHash: layer.imageHash,
      width: layer.width,
      height: layer.height,
      offsetX: layer.offsetX,
      offsetY: layer.offsetY,
      rotation: layer.rotation,
      scale: layer.scale,
    })),
    armedUnderlayId: null,
    selectedTileId: null,
    pendingPlacementVariationId: null,
  });

  // Landing mode: Decode if it has the only meaningful content, else Encode.
  const hasDecode = data.decode.canvasTiles.length > 0;
  const hasBuild = data.builderAssembly.placedCubes.length > 0 || data.encode != null;
  const landingMode: 'encoding' | 'decode' = hasDecode && !hasBuild ? 'decode' : 'encoding';
  return { landingMode };
}
