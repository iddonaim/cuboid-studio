import { create } from 'zustand';
import * as THREE from 'three';
import { LLMOperatorResult, OperatorRecord } from '../lib/operators/types';
import { translateMeme } from '../lib/api/translateMeme';
import { applyLLMOperator, createCutterFromLLMOutput } from '../lib/operators/applyOperator';
import { getVariationGeometryAsync } from '../lib/cube/csgUtils';
import { CUBE_VARIATIONS } from '../lib/cube/specifications';

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

  // Working cube
  baseVariationId: string;
  setBaseVariation: (variationId: string) => void;
  workingGeometry: THREE.BufferGeometry | null;
  geometryStack: THREE.BufferGeometry[];  // for revert

  // Cutter visualization
  lastCutterGeometry: THREE.BufferGeometry | null;

  // Translation state
  isTranslating: boolean;
  lastResult: LLMOperatorResult | null;
  lastError: string | null;

  // Operator history
  operators: OperatorRecord[];

  // Actions
  initWorkingCube: () => Promise<void>;
  translate: () => Promise<void>;
  revertLastOperator: () => void;
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

  // Working cube
  baseVariationId: 'v-00',
  setBaseVariation: (variationId) => {
    set({ baseVariationId: variationId, workingGeometry: null, geometryStack: [], operators: [] });
    get().initWorkingCube();
  },
  workingGeometry: null,
  geometryStack: [],

  // Cutter visualization
  lastCutterGeometry: null,

  // Translation state
  isTranslating: false,
  lastResult: null,
  lastError: null,

  // Operator history
  operators: [],

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
    const { memeDescription, locationTag, engagementLevel, workingGeometry } = get();
    if (!memeDescription.trim()) {
      set({ lastError: 'Please enter a meme description' });
      return;
    }
    if (!workingGeometry) {
      // Auto-init if needed
      await get().initWorkingCube();
      const freshGeo = get().workingGeometry;
      if (!freshGeo) {
        set({ lastError: 'Failed to initialize working cube' });
        return;
      }
    }

    set({ isTranslating: true, lastError: null, lastResult: null });

    try {
      const result = await translateMeme({
        memeDescription,
        locationTag: locationTag || null,
        engagementLevel,
      });

      const currentGeometry = get().workingGeometry!;

      // Save current geometry for revert
      const newStack = [...get().geometryStack, currentGeometry.clone()];

      // Apply the operator
      const newGeometry = applyLLMOperator(currentGeometry, result);

      // Generate cutter geometry for visualization
      currentGeometry.computeBoundingBox();
      const cutterGeo = currentGeometry.boundingBox
        ? createCutterFromLLMOutput(result, currentGeometry.boundingBox)
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

      set({
        workingGeometry: newGeometry,
        geometryStack: newStack,
        operators: [...get().operators, record],
        lastResult: result,
        lastCutterGeometry: cutterGeo,
        isTranslating: false,
      });
    } catch (error) {
      set({
        lastError: error instanceof Error ? error.message : 'Translation failed',
        isTranslating: false,
      });
    }
  },

  revertLastOperator: () => {
    const { geometryStack, operators } = get();
    if (geometryStack.length === 0 || operators.length === 0) return;

    const previousGeometry = geometryStack[geometryStack.length - 1];
    set({
      workingGeometry: previousGeometry,
      geometryStack: geometryStack.slice(0, -1),
      operators: operators.slice(0, -1),
      lastResult: null,
      lastCutterGeometry: null,
    });
  },
}));
