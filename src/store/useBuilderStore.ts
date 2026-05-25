import { create } from 'zustand';
import {
  Rotation,
  AxisRotation,
  DEFAULT_ROTATION,
  findValidRotationsAtPosition,
  findRotationIndex,
  getAllRotations,
  rotationsEqual,
  PlacedCubeInfo,
} from '../lib/cube/connectionRules';
import { CUBE_VARIATIONS, CubeVariation } from '../lib/cube/specifications';
import { CUBE_SIZE, GRID_STRIDE } from '../lib/cube/constants';
import { PlacedCube, FaceHoverInfo } from '../lib/cube/types';

interface BuilderState {
  // Variation selection
  selectedIdx: number;
  setSelectedIdx: (idx: number) => void;

  // Placed cubes
  placedCubes: PlacedCube[];
  setPlacedCubes: (cubes: PlacedCube[]) => void;

  // Hover state
  hoverPos: [number, number, number] | null;
  setHoverPos: (pos: [number, number, number] | null) => void;
  hoverInfo: FaceHoverInfo | null;
  setHoverInfo: (info: FaceHoverInfo | null) => void;

  // Preview
  previewRotation: Rotation;
  setPreviewRotation: (rotation: Rotation | ((prev: Rotation) => Rotation)) => void;

  // Selection
  selectedCubeId: string | null;
  setSelectedCubeId: (id: string | null) => void;

  // Tool state
  pickerActive: boolean;
  setPickerActive: (active: boolean) => void;

  // Rules
  rulesEnabled: boolean;
  setRulesEnabled: (enabled: boolean) => void;
  strictRulesEnabled: boolean;
  setStrictRulesEnabled: (enabled: boolean) => void;

  // Generation (CSG mode)
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;

  // PWA
  deferredPrompt: any;
  setDeferredPrompt: (prompt: any) => void;
  showInstallButton: boolean;
  setShowInstallButton: (show: boolean) => void;

  // History (undo/redo)
  history: PlacedCube[][];
  historyIndex: number;
  pushToHistory: (cubes: PlacedCube[]) => void;
  undo: () => void;
  redo: () => void;

  // Actions
  handlePlace: () => void;
  confirmPlacement: () => void;
  handleDelete: () => void;
  handleClearAll: () => void;
  handleAutoFill: (count: number) => void;
  rotateSelectedCube: (axis: 'x' | 'y') => void;

  // Computed helpers
  getSelectedVariation: () => CubeVariation;
  getValidRotations: () => Rotation[];
  getPlacementValidity: () => { valid: boolean; rotation: Rotation };
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  // Variation selection
  selectedIdx: 0,
  setSelectedIdx: (idx) => set({ selectedIdx: idx }),

  // Placed cubes
  placedCubes: [],
  setPlacedCubes: (cubes) => set({ placedCubes: cubes }),

  // Hover state
  hoverPos: null,
  setHoverPos: (pos) => set({ hoverPos: pos }),
  hoverInfo: null,
  setHoverInfo: (info) => set({ hoverInfo: info }),

  // Preview
  previewRotation: DEFAULT_ROTATION,
  setPreviewRotation: (rotationOrFn) => set((state) => ({
    previewRotation: typeof rotationOrFn === 'function'
      ? rotationOrFn(state.previewRotation)
      : rotationOrFn
  })),

  // Selection
  selectedCubeId: null,
  setSelectedCubeId: (id) => set({ selectedCubeId: id }),

  // Tool state
  pickerActive: true,
  setPickerActive: (active) => set({ pickerActive: active }),

  // Rules
  rulesEnabled: true,
  setRulesEnabled: (enabled) => set({ rulesEnabled: enabled }),
  strictRulesEnabled: false,
  setStrictRulesEnabled: (enabled) => set({ strictRulesEnabled: enabled }),

  // Generation
  isGenerating: true,
  setIsGenerating: (generating) => set({ isGenerating: generating }),

  // PWA
  deferredPrompt: null,
  setDeferredPrompt: (prompt) => set({ deferredPrompt: prompt }),
  showInstallButton: false,
  setShowInstallButton: (show) => set({ showInstallButton: show }),

  // History
  history: [[]],
  historyIndex: 0,
  pushToHistory: (cubes) => set((state) => {
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(cubes);
    return {
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),
  undo: () => set((state) => {
    if (state.historyIndex <= 0) return state;
    const newIndex = state.historyIndex - 1;
    return {
      historyIndex: newIndex,
      placedCubes: state.history[newIndex],
      selectedCubeId: null,
    };
  }),
  redo: () => set((state) => {
    if (state.historyIndex >= state.history.length - 1) return state;
    const newIndex = state.historyIndex + 1;
    return {
      historyIndex: newIndex,
      placedCubes: state.history[newIndex],
      selectedCubeId: null,
    };
  }),

  // Computed helpers
  getSelectedVariation: () => CUBE_VARIATIONS[get().selectedIdx],

  getValidRotations: () => {
    const { rulesEnabled, hoverPos, placedCubes, strictRulesEnabled } = get();
    const selectedVariation = get().getSelectedVariation();

    if (!rulesEnabled || !hoverPos) {
      return getAllRotations();
    }

    const cubeInfos: PlacedCubeInfo[] = placedCubes.map(c => ({
      variationId: c.variationId,
      position: c.position,
      rotation: c.rotation,
    }));

    return findValidRotationsAtPosition(
      hoverPos,
      selectedVariation.id,
      cubeInfos,
      GRID_STRIDE,
      strictRulesEnabled && rulesEnabled
    );
  },

  getPlacementValidity: () => {
    const { hoverPos, previewRotation } = get();
    if (!hoverPos) return { valid: true, rotation: previewRotation };

    const validRotations = get().getValidRotations();
    const isCurrentValid = findRotationIndex(validRotations, previewRotation) !== -1;
    if (isCurrentValid) {
      return { valid: true, rotation: previewRotation };
    }
    if (validRotations.length > 0) {
      return { valid: true, rotation: validRotations[0] };
    }
    return { valid: false, rotation: previewRotation };
  },

  // Actions
  handlePlace: () => {
    const state = get();
    if (!state.hoverPos) return;

    const validity = state.getPlacementValidity();
    if (state.rulesEnabled && !validity.valid) return;

    const occupied = state.placedCubes.some(c =>
      c.position[0] === state.hoverPos![0] &&
      c.position[1] === state.hoverPos![1] &&
      c.position[2] === state.hoverPos![2]
    );
    if (!occupied) {
      const newCubes = [...state.placedCubes, {
        id: `cube-${Date.now()}`,
        variationId: state.getSelectedVariation().id,
        position: state.hoverPos!,
        rotation: validity.rotation,
      }];
      set({ placedCubes: newCubes });
      state.pushToHistory(newCubes);
    }
  },

  confirmPlacement: () => {
    const state = get();
    state.handlePlace();
    set({ hoverPos: null, hoverInfo: null });
  },

  handleDelete: () => {
    const state = get();
    if (state.selectedCubeId) {
      const newCubes = state.placedCubes.filter(c => c.id !== state.selectedCubeId);
      set({ placedCubes: newCubes, selectedCubeId: null });
      state.pushToHistory(newCubes);
    }
  },

  handleClearAll: () => {
    const state = get();
    if (state.placedCubes.length > 0) {
      set({ placedCubes: [], selectedCubeId: null });
      state.pushToHistory([]);
    }
  },

  rotateSelectedCube: (axis) => {
    const state = get();
    if (!state.selectedCubeId) return;

    const cubeIndex = state.placedCubes.findIndex(c => c.id === state.selectedCubeId);
    if (cubeIndex === -1) return;

    const cube = state.placedCubes[cubeIndex];
    const newRotation: Rotation = axis === 'y'
      ? { ...cube.rotation, y: ((cube.rotation.y + 1) % 4) as AxisRotation }
      : { ...cube.rotation, x: ((cube.rotation.x + 1) % 4) as AxisRotation };

    if (state.rulesEnabled) {
      const otherCubes: PlacedCubeInfo[] = state.placedCubes
        .filter(c => c.id !== state.selectedCubeId)
        .map(c => ({
          variationId: c.variationId,
          position: c.position,
          rotation: c.rotation,
        }));

      const validRotations = findValidRotationsAtPosition(
        cube.position,
        cube.variationId,
        otherCubes,
        GRID_STRIDE,
        state.strictRulesEnabled && state.rulesEnabled
      );

      const isValid = findRotationIndex(validRotations, newRotation) !== -1;
      if (!isValid) {
        if (validRotations.length > 0) {
          const currentIdx = findRotationIndex(validRotations, cube.rotation);
          const nextRotation = currentIdx === -1
            ? validRotations[0]
            : validRotations[(currentIdx + 1) % validRotations.length];
          const newCubes = [...state.placedCubes];
          newCubes[cubeIndex] = { ...cube, rotation: nextRotation };
          state.pushToHistory(newCubes);
          set({ placedCubes: newCubes });
        }
        return;
      }
    }

    const newCubes = [...state.placedCubes];
    newCubes[cubeIndex] = { ...cube, rotation: newRotation };
    state.pushToHistory(newCubes);
    set({ placedCubes: newCubes });
  },

  handleAutoFill: (count) => {
    const state = get();
    let currentCubes = [...state.placedCubes];
    let seedCubeId = state.selectedCubeId;

    if (currentCubes.length === 0) {
      const randomVariation = CUBE_VARIATIONS[Math.floor(Math.random() * CUBE_VARIATIONS.length)];
      const seedCube: PlacedCube = {
        id: `cube-${Date.now()}`,
        variationId: randomVariation.id,
        position: [0, CUBE_SIZE / 2, 0],
        rotation: DEFAULT_ROTATION,
      };
      currentCubes.push(seedCube);
      seedCubeId = seedCube.id;
    }

    let frontierIds: Set<string> = seedCubeId
      ? new Set([seedCubeId])
      : new Set(currentCubes.map(c => c.id));

    for (let i = 0; i < count; i++) {
      const candidates: { position: [number, number, number]; variationId: string; rotation: Rotation }[] = [];
      const frontierCubes = currentCubes.filter(c => frontierIds.has(c.id));
      const adjacentPositions = new Set<string>();

      for (const cube of frontierCubes) {
        const [x, y, z] = cube.position;
        const neighbors: [number, number, number][] = [
          [x + GRID_STRIDE, y, z],
          [x - GRID_STRIDE, y, z],
          [x, y + GRID_STRIDE, z],
          [x, y - GRID_STRIDE, z],
          [x, y, z + GRID_STRIDE],
          [x, y, z - GRID_STRIDE],
        ];

        for (const pos of neighbors) {
          if (pos[1] < CUBE_SIZE / 2) continue;
          const occupied = currentCubes.some(c =>
            Math.abs(c.position[0] - pos[0]) < 1 &&
            Math.abs(c.position[1] - pos[1]) < 1 &&
            Math.abs(c.position[2] - pos[2]) < 1
          );
          if (occupied) continue;
          adjacentPositions.add(JSON.stringify(pos));
        }
      }

      for (const posStr of adjacentPositions) {
        const position = JSON.parse(posStr) as [number, number, number];
        for (const variation of CUBE_VARIATIONS) {
          const cubeInfos: PlacedCubeInfo[] = currentCubes.map(c => ({
            variationId: c.variationId,
            position: c.position,
            rotation: c.rotation,
          }));

          const validRotations = findValidRotationsAtPosition(
            position,
            variation.id,
            cubeInfos,
            GRID_STRIDE,
            state.strictRulesEnabled
          );

          for (const rotation of validRotations) {
            candidates.push({ position, variationId: variation.id, rotation });
          }
        }
      }

      if (candidates.length === 0) {
        console.log(`Auto-fill stopped after ${i} placements - no valid positions found`);
        break;
      }

      const choice = candidates[Math.floor(Math.random() * candidates.length)];
      const newCube: PlacedCube = {
        id: `cube-${Date.now()}-${i}`,
        variationId: choice.variationId,
        position: choice.position,
        rotation: choice.rotation,
      };
      currentCubes.push(newCube);
      frontierIds.add(newCube.id);
    }

    state.pushToHistory(currentCubes);
    set({ placedCubes: currentCubes, selectedCubeId: null });
  },
}));
