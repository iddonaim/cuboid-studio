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
  const imageThumbnails = encoding.multiPhotoEnabled
    ? encoding.uploadedImages.map(img => ({
        id: img.id,
        thumbnailDataUrl: img.thumbnailDataUrl,
        isPrimary: img.id === encoding.primaryImageId,
      }))
    : encoding.imageThumbnail
      ? [{ id: 'single', thumbnailDataUrl: encoding.imageThumbnail, isPrimary: true }]
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
          // The full re-run is unreproducible by design (photos are saved as
          // thumbnails only, and the LLM is nondeterministic) — so at least
          // the conditions of the translation are archived.
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
      // Underlay: thumbnail + fingerprint + registration only — the full-res
      // dataUrl is session-only, same policy as encode photos.
      ...(decode.underlay
        ? {
            underlay: {
              thumbnailDataUrl: decode.underlay.thumbnailDataUrl,
              imageHash: decode.underlay.imageHash,
              width: decode.underlay.width,
              height: decode.underlay.height,
              offsetX: decode.underlay.offsetX,
              offsetY: decode.underlay.offsetY,
              rotation: decode.underlay.rotation,
              scale: decode.underlay.scale,
            },
          }
        : {}),
    },
    siteContextSnapshot: getActiveSiteContext(),
  };
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
      // Photo thumbnails — display-only, no full-res base64 to re-encode with.
      multiPhotoEnabled: isMultiPhoto,
      uploadedImage: !isMultiPhoto && images[0] ? images[0].thumbnailDataUrl : null,
      imageBase64: null,
      imageMediaType: !isMultiPhoto && images[0] ? 'image/jpeg' : null,
      imageThumbnail: !isMultiPhoto && images[0] ? images[0].thumbnailDataUrl : null,
      uploadedImages: isMultiPhoto
        ? images.map(img => ({
            id: img.id,
            dataUrl: img.thumbnailDataUrl,
            base64: '',
            mediaType: 'image/jpeg',
            thumbnailDataUrl: img.thumbnailDataUrl,
          }))
        : [],
      primaryImageId: isMultiPhoto ? (images.find(img => img.isPrimary)?.id ?? images[0]?.id ?? null) : null,
      imagesRestoredOnly: images.length > 0,
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
    baseVariationId: p.baseVariationId,
    targetCubeId: p.targetCubeId,
    passMode: p.passMode,
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
  useDecodeStore.setState({
    canvasTiles: data.decode.canvasTiles,
    freestyle: data.decode.freestyle,
    // Underlay restores registered but thumbnail-only (dataUrl is never
    // persisted); re-importing the plan file restores full resolution.
    underlay: data.decode.underlay ? { ...data.decode.underlay, dataUrl: null } : null,
    selectedTileId: null,
    pendingPlacementVariationId: null,
  });

  // Landing mode: Decode if it has the only meaningful content, else Encode.
  const hasDecode = data.decode.canvasTiles.length > 0;
  const hasBuild = data.builderAssembly.placedCubes.length > 0 || data.encode != null;
  const landingMode: 'encoding' | 'decode' = hasDecode && !hasBuild ? 'decode' : 'encoding';
  return { landingMode };
}
