import { create } from 'zustand';
import * as THREE from 'three';
import {
  LLMOperatorResult,
  OperatorRecord,
  TranslationPass1,
  TranslationPass2,
  ConfidenceVector,
} from '../lib/operators/types';
import { translateMeme, translateMemeTwoPass } from '../lib/api/translateMeme';
import { applyLLMOperator, createCutterFromLLMOutput } from '../lib/operators/applyOperator';
import { getVariationGeometryAsync } from '../lib/cube/csgUtils';
import { CUBE_VARIATIONS } from '../lib/cube/specifications';

export type PassMode = 'single' | 'two_pass';

/** Where the selected meme came from — labels the sidebar card. */
export type MemeSource = 'archthesis' | 'external';

/** A finished translation handed to translate() instead of calling the LLM —
 *  used by the model-comparison panel to apply a chosen candidate through the
 *  exact same geometry/record pipeline as a live translation. */
export interface PrecomputedTranslation {
  result: LLMOperatorResult;
  pass1: TranslationPass1 | null;
  pass2: TranslationPass2 | null;
  confidenceVector: ConfidenceVector | null;
  model: string | null;
  /** Prompt-file "# version" of the run that produced this translation. */
  promptVersion?: string | null;
}

/** One model's outcome in a comparison run. Nothing is applied to geometry
 *  until the architect explicitly picks an entry. */
export interface ComparisonEntry {
  modelId: string;
  label: string;
  status: 'running' | 'done' | 'error';
  error?: string;
  elapsedMs?: number;
  /** Model id the server actually used (echoed back by the API). */
  resolvedModel?: string | null;
  /** Prompt-file "# version" the server reported for this run. */
  promptVersion?: string | null;
  pass1?: TranslationPass1;
  pass2?: TranslationPass2;
  confidenceVector?: ConfidenceVector | null;
  result?: LLMOperatorResult;
}

interface MemeState {
  // Input
  memeDescription: string;
  setMemeDescription: (desc: string) => void;
  locationTag: string;
  setLocationTag: (tag: string) => void;
  engagementLevel: number;
  setEngagementLevel: (level: number) => void;

  // Selected meme (for sidebar thumbnail) — from archthesis or an external URL
  selectedMemeImageUrl: string | null;
  selectedMemeTitle: string | null;
  selectedMemeSource: MemeSource | null;
  setSelectedMeme: (imageUrl: string | null, title: string | null, source?: MemeSource) => void;

  // Standalone working cube (used when no assembly exists)
  baseVariationId: string;
  setBaseVariation: (variationId: string) => void;
  workingGeometry: THREE.BufferGeometry | null;
  geometryStack: THREE.BufferGeometry[];  // for revert

  // Assembly targeting (used when builder has placed cubes)
  targetCubeId: string | null;
  setTargetCubeId: (id: string | null) => void;
  cubeGeometryOverrides: Record<string, THREE.BufferGeometry>;
  cubeGeometryStacks: Record<string, THREE.BufferGeometry[]>;
  cubeOperators: Record<string, OperatorRecord[]>;

  // Cutter visualization
  lastCutterGeometry: THREE.BufferGeometry | null;
  cutterVisible: boolean;
  setCutterVisible: (visible: boolean) => void;

  // Translation state
  isTranslating: boolean;
  /** Cosmetic two-phase loading label during v2 translation */
  translationPhase: 'idle' | 'reading' | 'geometry';
  lastResult: LLMOperatorResult | null;
  lastError: string | null;

  // v2 two-pass state — populated only when passMode === 'two_pass'.
  passMode: PassMode;
  setPassMode: (mode: PassMode) => void;
  lastPass1: TranslationPass1 | null;
  lastPass2: TranslationPass2 | null;
  lastConfidenceVector: ConfidenceVector | null;
  lastModel: string | null;

  // Operator history (standalone mode)
  operators: OperatorRecord[];

  /** Latest full translation per assembly cube, so re-selecting a cube
   *  restores the readable result and an editable cutter — the data always
   *  existed, it just used to be thrown away on deselect. */
  cubeTranslations: Record<string, CubeTranslation>;

  // Model comparison (same meme through several models side by side)
  comparisonEntries: ComparisonEntry[];
  isComparing: boolean;
  /** The lab's most recent apply: which cube (or 'standalone') and which
   *  operator record it created. Lets the next lab apply SWAP readings
   *  (undo its own previous cut first) instead of stacking cuts — validated
   *  against the live operator stack, so manual work is never auto-undone. */
  comparisonAppliedMark: { key: string; recordId: string } | null;
  runModelComparison: (models: { id: string; label: string }[]) => Promise<void>;
  applyComparisonEntry: (modelId: string) => Promise<void>;
  clearComparison: () => void;

  // Actions
  initWorkingCube: () => Promise<void>;
  translate: (precomputed?: PrecomputedTranslation) => Promise<void>;
  revertLastOperator: () => void;
  reapplyWithTweaks: (tweakedResult: LLMOperatorResult) => void;

  // Assembly helpers
  getActiveOperators: () => OperatorRecord[];
  getActiveGeometryStack: () => THREE.BufferGeometry[];
}

export interface CubeTranslation {
  result: LLMOperatorResult;
  pass1: TranslationPass1 | null;
  pass2: TranslationPass2 | null;
  confidenceVector: ConfidenceVector | null;
  model: string | null;
  cutterGeometry: THREE.BufferGeometry | null;
  /** The meme that drove this translation, so re-selecting the cube shows
   *  the source alongside the geometric result. */
  memeDescription?: string;
  memeTitle?: string | null;
  memeImageUrl?: string | null;
}

/** Helper to load base geometry for a placed cube by its variation ID */
async function loadBaseGeometry(variationId: string): Promise<THREE.BufferGeometry | null> {
  const variation = CUBE_VARIATIONS.find(v => v.id === variationId);
  if (!variation) return null;
  return getVariationGeometryAsync(variation);
}

export const useMemeStore = create<MemeState>((set, get) => ({
  // Input
  memeDescription: '',
  setMemeDescription: (desc) => set({ memeDescription: desc }),
  locationTag: '',
  setLocationTag: (tag) => set({ locationTag: tag }),
  engagementLevel: 50,
  setEngagementLevel: (level) => set({ engagementLevel: level }),

  // Selected meme
  selectedMemeImageUrl: null,
  selectedMemeTitle: null,
  selectedMemeSource: null,
  setSelectedMeme: (imageUrl, title, source) => set({
    selectedMemeImageUrl: imageUrl,
    selectedMemeTitle: title,
    selectedMemeSource: imageUrl ? (source ?? 'archthesis') : null,
  }),

  // Standalone working cube
  baseVariationId: 'v-00',
  setBaseVariation: (variationId) => {
    set({ baseVariationId: variationId, workingGeometry: null, geometryStack: [], operators: [] });
    get().initWorkingCube();
  },
  workingGeometry: null,
  geometryStack: [],

  // Assembly targeting
  targetCubeId: null,
  setTargetCubeId: (id) => {
    // Re-selecting a cube that has been translated brings its latest
    // result (and tweakable cutter) back instead of a blank panel.
    const stored = id ? get().cubeTranslations[id] : undefined;
    set({
      targetCubeId: id,
      lastResult: stored?.result ?? null,
      lastPass1: stored?.pass1 ?? null,
      lastPass2: stored?.pass2 ?? null,
      lastConfidenceVector: stored?.confidenceVector ?? null,
      lastModel: stored?.model ?? null,
      lastCutterGeometry: stored?.cutterGeometry ?? null,
      lastError: null,
    });
  },
  cubeGeometryOverrides: {},
  cubeGeometryStacks: {},
  cubeOperators: {},
  cubeTranslations: {},

  // Cutter visualization
  lastCutterGeometry: null,
  cutterVisible: true,
  setCutterVisible: (visible) => set({ cutterVisible: visible }),

  // Translation state
  isTranslating: false,
  translationPhase: 'idle',
  lastResult: null,
  lastError: null,

  // v2 two-pass state
  passMode: 'two_pass',
  setPassMode: (mode) => set({ passMode: mode }),
  lastPass1: null,
  lastPass2: null,
  lastConfidenceVector: null,
  lastModel: null,

  // Operator history (standalone)
  operators: [],

  // Model comparison
  comparisonEntries: [],
  isComparing: false,
  comparisonAppliedMark: null,

  runModelComparison: async (models) => {
    const { memeDescription, locationTag, engagementLevel, selectedMemeImageUrl } = get();
    if (!memeDescription.trim()) {
      set({ lastError: 'Please enter a meme description' });
      return;
    }
    if (models.length === 0) return;

    set({
      isComparing: true,
      lastError: null,
      comparisonEntries: models.map((m) => ({
        modelId: m.id,
        label: m.label,
        status: 'running' as const,
      })),
    });

    const update = (modelId: string, patch: Partial<ComparisonEntry>) =>
      set({
        comparisonEntries: get().comparisonEntries.map((e) =>
          e.modelId === modelId ? { ...e, ...patch } : e
        ),
      });

    // All models run in parallel on the same inputs; failures stay per-entry
    // so one wrong model id never sinks the rest of the comparison.
    await Promise.all(
      models.map(async (m) => {
        const t0 = performance.now();
        try {
          const twoPass = await translateMemeTwoPass({
            memeDescription,
            locationTag: locationTag || null,
            engagementLevel,
            memeImageUrl: selectedMemeImageUrl,
            model: m.id,
          });
          const result: LLMOperatorResult = {
            operator: twoPass.pass2.operator,
            targets: twoPass.pass2.targets,
            magnitude: twoPass.pass2.magnitude,
            decay: twoPass.pass2.decay,
            cutter: {
              type: twoPass.pass2.cutter.type,
              proportions: twoPass.pass2.cutter.proportions,
              position: twoPass.pass2.cutter.position,
              rotation: twoPass.pass2.cutter.rotation,
            },
            reasoning: twoPass.pass2.reasoning,
          };
          update(m.id, {
            status: 'done',
            elapsedMs: Math.round(performance.now() - t0),
            resolvedModel: twoPass.model,
            promptVersion: twoPass.promptVersion ?? null,
            pass1: twoPass.pass1,
            pass2: twoPass.pass2,
            confidenceVector: twoPass.pass2.confidence_vector,
            result,
          });
        } catch (error) {
          update(m.id, {
            status: 'error',
            elapsedMs: Math.round(performance.now() - t0),
            error: error instanceof Error ? error.message : 'Translation failed',
          });
        }
      })
    );

    set({ isComparing: false });
  },

  applyComparisonEntry: async (modelId) => {
    const entry = get().comparisonEntries.find((e) => e.modelId === modelId);
    if (!entry || entry.status !== 'done' || !entry.result) return;

    // Swap, don't stack: if the lab's previous apply is still the newest
    // change on the same target, undo it before applying the new reading.
    // The record-id check makes this conservative — any manual translation,
    // tweak, or revert since then breaks the match and nothing is undone.
    const activeKey = get().targetCubeId ?? 'standalone';
    const mark = get().comparisonAppliedMark;
    const opsBefore = get().getActiveOperators();
    const top = opsBefore[opsBefore.length - 1];
    if (mark && mark.key === activeKey && top && top.id === mark.recordId) {
      get().revertLastOperator();
    }

    const opsAtApply = get().getActiveOperators().length;
    await get().translate({
      result: entry.result,
      pass1: entry.pass1 ?? null,
      pass2: entry.pass2 ?? null,
      confidenceVector: entry.confidenceVector ?? null,
      model: entry.resolvedModel ?? entry.modelId,
      promptVersion: entry.promptVersion ?? null,
    });

    // Only remember the apply if it actually landed (translate() swallows
    // its own errors into lastError, so check the stack grew).
    const opsAfter = get().getActiveOperators();
    const newTop = opsAfter[opsAfter.length - 1];
    if (opsAfter.length === opsAtApply + 1 && newTop) {
      set({ comparisonAppliedMark: { key: activeKey, recordId: newTop.id } });
    } else {
      set({ comparisonAppliedMark: null });
    }
  },

  clearComparison: () => set({ comparisonEntries: [], isComparing: false }),

  // Assembly helpers
  getActiveOperators: () => {
    const { targetCubeId, cubeOperators, operators } = get();
    if (targetCubeId) return cubeOperators[targetCubeId] || [];
    return operators;
  },
  getActiveGeometryStack: () => {
    const { targetCubeId, cubeGeometryStacks, geometryStack } = get();
    if (targetCubeId) return cubeGeometryStacks[targetCubeId] || [];
    return geometryStack;
  },

  // Actions
  initWorkingCube: async () => {
    const { baseVariationId } = get();
    const variation = CUBE_VARIATIONS.find(v => v.id === baseVariationId);
    if (!variation) return;

    try {
      const geometry = await getVariationGeometryAsync(variation);
      set({ workingGeometry: geometry, geometryStack: [], operators: [] });
    } catch (error) {
      console.error('Failed to init working cube:', error);
    }
  },

  translate: async (precomputed?: PrecomputedTranslation) => {
    // Shape-guard: if this ever gets wired directly to an onClick, React would
    // pass a MouseEvent here — only trust a payload that looks like ours.
    const pre =
      precomputed && typeof precomputed === 'object' && 'result' in precomputed
        ? precomputed
        : undefined;

    const { memeDescription, locationTag, engagementLevel, targetCubeId } = get();
    if (!memeDescription.trim()) {
      set({ lastError: 'Please enter a meme description' });
      return;
    }

    // Determine which geometry to operate on
    let currentGeometry: THREE.BufferGeometry | null = null;
    let placedCubeVariationId: string | null = null;

    if (targetCubeId) {
      // Assembly mode: get the target cube's current geometry
      const override = get().cubeGeometryOverrides[targetCubeId];
      if (override) {
        currentGeometry = override;
      } else {
        // Need to load base geometry — get variationId from builder store
        // We import dynamically to avoid circular deps
        const { useBuilderStore } = await import('./useBuilderStore');
        const placedCube = useBuilderStore.getState().placedCubes.find(c => c.id === targetCubeId);
        if (!placedCube) {
          set({ lastError: 'Target cube not found in assembly' });
          return;
        }
        placedCubeVariationId = placedCube.variationId;
        currentGeometry = await loadBaseGeometry(placedCube.variationId);
        if (!currentGeometry) {
          set({ lastError: 'Failed to load target cube geometry' });
          return;
        }
      }
    } else {
      // Standalone mode
      currentGeometry = get().workingGeometry;
      if (!currentGeometry) {
        await get().initWorkingCube();
        currentGeometry = get().workingGeometry;
        if (!currentGeometry) {
          set({ lastError: 'Failed to initialize working cube' });
          return;
        }
      }
    }

    const passMode = get().passMode;
    set({
      isTranslating: true,
      translationPhase: 'reading',
      lastError: null,
      lastResult: null,
      lastPass1: null,
      lastPass2: null,
      lastConfidenceVector: null,
      lastModel: null,
    });

    try {
      let result: LLMOperatorResult;
      let pass1: TranslationPass1 | null = null;
      let pass2: TranslationPass2 | null = null;
      let confidenceVector: ConfidenceVector | null = null;
      let modelUsed: string | null = null;
      let promptVersionUsed: string | null = null;

      if (pre) {
        // Applying an already-completed translation (from the comparison
        // panel) — skip the LLM call, keep everything downstream identical.
        result = pre.result;
        pass1 = pre.pass1;
        pass2 = pre.pass2;
        confidenceVector = pre.confidenceVector;
        modelUsed = pre.model;
        promptVersionUsed = pre.promptVersion ?? null;
      } else if (passMode === 'two_pass') {
        const twoPass = await translateMemeTwoPass({
          memeDescription,
          locationTag: locationTag || null,
          engagementLevel,
          memeImageUrl: get().selectedMemeImageUrl,
        });
        pass1 = twoPass.pass1;
        pass2 = twoPass.pass2;
        confidenceVector = twoPass.pass2.confidence_vector;
        modelUsed = twoPass.model;
        promptVersionUsed = twoPass.promptVersion ?? null;
        // Synthesize v1-shaped result from pass2 so the existing cutter
        // pipeline, CutterTweakPanel, and revertLastOperator all work
        // unchanged. applyLLMOperator only reads `cutter`.
        result = {
          operator: twoPass.pass2.operator,
          targets: twoPass.pass2.targets,
          magnitude: twoPass.pass2.magnitude,
          decay: twoPass.pass2.decay,
          cutter: {
            type: twoPass.pass2.cutter.type,
            proportions: twoPass.pass2.cutter.proportions,
            position: twoPass.pass2.cutter.position,
            rotation: twoPass.pass2.cutter.rotation,
          },
          reasoning: twoPass.pass2.reasoning,
        };
      } else {
        result = await translateMeme({
          memeDescription,
          locationTag: locationTag || null,
          engagementLevel,
          memeImageUrl: get().selectedMemeImageUrl,
        });
      }

      if (passMode === 'two_pass' && !pre) {
        set({ translationPhase: 'geometry' });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Apply the operator
      const newGeometry = applyLLMOperator(currentGeometry!, result);

      // Generate cutter geometry for visualization
      currentGeometry!.computeBoundingBox();
      const cutterGeo = currentGeometry!.boundingBox
        ? createCutterFromLLMOutput(result, currentGeometry!.boundingBox)
        : null;

      // Create operator record. Provenance fields (meme identity + full
      // two-pass reasoning) ride along so the change stays explainable when
      // revisited later — including after a save/load round-trip. Conditional
      // spreads keep undefined out of the record (Firestore rejects it).
      const selectedTitle = get().selectedMemeTitle;
      const selectedImage = get().selectedMemeImageUrl;
      const record: OperatorRecord = {
        id: crypto.randomUUID(),
        source: 'meme',
        operator: result.operator,
        targets: result.targets,
        magnitude: result.magnitude,
        decay: result.decay,
        createdAt: new Date().toISOString(),
        memeDescription,
        reasoning: result.reasoning,
        cutter: result.cutter,
        origin: 'pataphysical',
        ...(selectedTitle ? { memeTitle: selectedTitle } : {}),
        ...(selectedImage ? { memeImageUrl: selectedImage } : {}),
        ...(pass1 ? { pass1 } : {}),
        ...(pass2 ? { pass2 } : {}),
        ...(confidenceVector ? { confidenceVector } : {}),
        ...(modelUsed ? { model: modelUsed } : {}),
        ...(promptVersionUsed ? { promptVersion: promptVersionUsed } : {}),
      };

      if (targetCubeId) {
        // Assembly mode: update per-cube data
        const prevOverrides = get().cubeGeometryOverrides;
        const prevStacks = get().cubeGeometryStacks;
        const prevOps = get().cubeOperators;

        set({
          cubeGeometryOverrides: {
            ...prevOverrides,
            [targetCubeId]: newGeometry,
          },
          cubeGeometryStacks: {
            ...prevStacks,
            [targetCubeId]: [...(prevStacks[targetCubeId] || []), currentGeometry!.clone()],
          },
          cubeOperators: {
            ...prevOps,
            [targetCubeId]: [...(prevOps[targetCubeId] || []), record],
          },
          cubeTranslations: {
            ...get().cubeTranslations,
            [targetCubeId]: {
              result,
              pass1,
              pass2,
              confidenceVector,
              model: modelUsed,
              cutterGeometry: cutterGeo,
              memeDescription,
              memeTitle: selectedTitle,
              memeImageUrl: selectedImage,
            },
          },
          lastResult: result,
          lastPass1: pass1,
          lastPass2: pass2,
          lastConfidenceVector: confidenceVector,
          lastModel: modelUsed,
          lastCutterGeometry: cutterGeo,
          isTranslating: false,
          translationPhase: 'idle',
        });
      } else {
        // Standalone mode
        const newStack = [...get().geometryStack, currentGeometry!.clone()];
        set({
          workingGeometry: newGeometry,
          geometryStack: newStack,
          operators: [...get().operators, record],
          lastResult: result,
          lastPass1: pass1,
          lastPass2: pass2,
          lastConfidenceVector: confidenceVector,
          lastModel: modelUsed,
          lastCutterGeometry: cutterGeo,
          isTranslating: false,
          translationPhase: 'idle',
        });
      }
    } catch (error) {
      set({
        lastError: error instanceof Error ? error.message : 'Translation failed',
        isTranslating: false,
        translationPhase: 'idle',
      });
    }
  },

  revertLastOperator: () => {
    const { targetCubeId } = get();

    if (targetCubeId) {
      // Assembly mode: revert on target cube
      const stacks = get().cubeGeometryStacks;
      const ops = get().cubeOperators;
      const stack = stacks[targetCubeId] || [];
      const cubeOps = ops[targetCubeId] || [];
      if (stack.length === 0 || cubeOps.length === 0) return;

      const previousGeometry = stack[stack.length - 1];
      const newOverrides = { ...get().cubeGeometryOverrides };

      if (stack.length === 1) {
        // Reverting to base geometry — remove override entirely
        delete newOverrides[targetCubeId];
      } else {
        newOverrides[targetCubeId] = previousGeometry;
      }

      const remainingTranslations = { ...get().cubeTranslations };
      delete remainingTranslations[targetCubeId];

      set({
        cubeGeometryOverrides: newOverrides,
        cubeGeometryStacks: {
          ...stacks,
          [targetCubeId]: stack.slice(0, -1),
        },
        cubeOperators: {
          ...ops,
          [targetCubeId]: cubeOps.slice(0, -1),
        },
        cubeTranslations: remainingTranslations,
        lastResult: null,
        lastPass1: null,
        lastPass2: null,
        lastConfidenceVector: null,
        lastModel: null,
        lastCutterGeometry: null,
      });
    } else {
      // Standalone mode
      const { geometryStack, operators } = get();
      if (geometryStack.length === 0 || operators.length === 0) return;

      const previousGeometry = geometryStack[geometryStack.length - 1];
      set({
        workingGeometry: previousGeometry,
        geometryStack: geometryStack.slice(0, -1),
        operators: operators.slice(0, -1),
        lastResult: null,
        lastPass1: null,
        lastPass2: null,
        lastConfidenceVector: null,
        lastModel: null,
        lastCutterGeometry: null,
      });
    }
  },

  reapplyWithTweaks: (tweakedResult: LLMOperatorResult) => {
    const { targetCubeId } = get();

    if (targetCubeId) {
      // Assembly mode
      const stacks = get().cubeGeometryStacks;
      const ops = get().cubeOperators;
      const stack = stacks[targetCubeId] || [];
      if (stack.length === 0) return;

      const preCutGeometry = stack[stack.length - 1];
      const newGeometry = applyLLMOperator(preCutGeometry, tweakedResult);

      preCutGeometry.computeBoundingBox();
      const cutterGeo = preCutGeometry.boundingBox
        ? createCutterFromLLMOutput(tweakedResult, preCutGeometry.boundingBox)
        : null;

      const cubeOps = [...(ops[targetCubeId] || [])];
      if (cubeOps.length > 0) {
        const last = cubeOps[cubeOps.length - 1];
        cubeOps[cubeOps.length - 1] = {
          ...last,
          magnitude: tweakedResult.magnitude,
          cutter: tweakedResult.cutter,
        };
      }

      const prevSnapshot = get().cubeTranslations[targetCubeId];
      set({
        cubeGeometryOverrides: {
          ...get().cubeGeometryOverrides,
          [targetCubeId]: newGeometry,
        },
        cubeOperators: {
          ...get().cubeOperators,
          [targetCubeId]: cubeOps,
        },
        cubeTranslations: {
          ...get().cubeTranslations,
          [targetCubeId]: {
            result: tweakedResult,
            pass1: prevSnapshot?.pass1 ?? get().lastPass1,
            pass2: prevSnapshot?.pass2 ?? get().lastPass2,
            confidenceVector: prevSnapshot?.confidenceVector ?? get().lastConfidenceVector,
            model: prevSnapshot?.model ?? get().lastModel,
            cutterGeometry: cutterGeo,
          },
        },
        lastResult: tweakedResult,
        lastCutterGeometry: cutterGeo,
      });
    } else {
      // Standalone mode
      const { geometryStack, operators } = get();
      if (geometryStack.length === 0) return;

      const preCutGeometry = geometryStack[geometryStack.length - 1];
      const newGeometry = applyLLMOperator(preCutGeometry, tweakedResult);

      preCutGeometry.computeBoundingBox();
      const cutterGeo = preCutGeometry.boundingBox
        ? createCutterFromLLMOutput(tweakedResult, preCutGeometry.boundingBox)
        : null;

      const updatedOperators = [...operators];
      if (updatedOperators.length > 0) {
        const last = updatedOperators[updatedOperators.length - 1];
        updatedOperators[updatedOperators.length - 1] = {
          ...last,
          magnitude: tweakedResult.magnitude,
          cutter: tweakedResult.cutter,
        };
      }

      set({
        workingGeometry: newGeometry,
        operators: updatedOperators,
        lastResult: tweakedResult,
        lastCutterGeometry: cutterGeo,
      });
    }
  },
}));
