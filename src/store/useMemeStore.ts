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

interface MemeState {
  // Input
  memeDescription: string;
  setMemeDescription: (desc: string) => void;
  locationTag: string;
  setLocationTag: (tag: string) => void;
  engagementLevel: number;
  setEngagementLevel: (level: number) => void;

  // Selected archthesis meme (for sidebar thumbnail)
  selectedMemeImageUrl: string | null;
  selectedMemeTitle: string | null;
  setSelectedMeme: (imageUrl: string | null, title: string | null) => void;

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
  lastResult: LLMOperatorResult | null;
  lastError: string | null;

  // v2 two-pass state — populated only when passMode === 'two_pass'.
  // confidenceVector + model are stored for future UI; not rendered yet.
  passMode: PassMode;
  setPassMode: (mode: PassMode) => void;
  lastPass1: TranslationPass1 | null;
  lastPass2: TranslationPass2 | null;
  lastConfidenceVector: ConfidenceVector | null;
  lastModel: string | null;

  // Operator history (standalone mode)
  operators: OperatorRecord[];

  // Actions
  initWorkingCube: () => Promise<void>;
  translate: () => Promise<void>;
  revertLastOperator: () => void;
  reapplyWithTweaks: (tweakedResult: LLMOperatorResult) => void;

  // Assembly helpers
  getActiveOperators: () => OperatorRecord[];
  getActiveGeometryStack: () => THREE.BufferGeometry[];
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

  // Selected archthesis meme
  selectedMemeImageUrl: null,
  selectedMemeTitle: null,
  setSelectedMeme: (imageUrl, title) => set({ selectedMemeImageUrl: imageUrl, selectedMemeTitle: title }),

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
  setTargetCubeId: (id) => set({
    targetCubeId: id,
    lastResult: null,
    lastPass1: null,
    lastPass2: null,
    lastConfidenceVector: null,
    lastModel: null,
    lastCutterGeometry: null,
    lastError: null,
  }),
  cubeGeometryOverrides: {},
  cubeGeometryStacks: {},
  cubeOperators: {},

  // Cutter visualization
  lastCutterGeometry: null,
  cutterVisible: true,
  setCutterVisible: (visible) => set({ cutterVisible: visible }),

  // Translation state
  isTranslating: false,
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

  translate: async () => {
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

    set({
      isTranslating: true,
      lastError: null,
      lastResult: null,
      lastPass1: null,
      lastPass2: null,
      lastConfidenceVector: null,
      lastModel: null,
    });

    try {
      const passMode = get().passMode;
      let result: LLMOperatorResult;
      let pass1: TranslationPass1 | null = null;
      let pass2: TranslationPass2 | null = null;
      let confidenceVector: ConfidenceVector | null = null;
      let modelUsed: string | null = null;

      if (passMode === 'two_pass') {
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
        // Synthesize v1-shaped result from pass2 so the existing cutter
        // pipeline, CutterTweakPanel, and revertLastOperator all work
        // unchanged. applyLLMOperator only reads cutter + magnitude.
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

      // Apply the operator
      const newGeometry = applyLLMOperator(currentGeometry!, result);

      // Generate cutter geometry for visualization
      currentGeometry!.computeBoundingBox();
      const cutterGeo = currentGeometry!.boundingBox
        ? createCutterFromLLMOutput(result, currentGeometry!.boundingBox)
        : null;

      // Create operator record
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
          lastResult: result,
          lastPass1: pass1,
          lastPass2: pass2,
          lastConfidenceVector: confidenceVector,
          lastModel: modelUsed,
          lastCutterGeometry: cutterGeo,
          isTranslating: false,
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
        });
      }
    } catch (error) {
      set({
        lastError: error instanceof Error ? error.message : 'Translation failed',
        isTranslating: false,
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

      set({
        cubeGeometryOverrides: {
          ...get().cubeGeometryOverrides,
          [targetCubeId]: newGeometry,
        },
        cubeOperators: {
          ...get().cubeOperators,
          [targetCubeId]: cubeOps,
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
