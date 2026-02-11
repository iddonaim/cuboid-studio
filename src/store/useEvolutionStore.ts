import { create } from 'zustand';
import type { LLMOperatorResult } from '../lib/operators/types';
import type { ArchthesisMeme } from '../types/archthesis';
import type { FetchMemesResponse } from '../types/archthesis';
import { mapMemeToCuboidInput } from '../lib/meme-mapper';
import { translateMeme } from '../lib/api/translateMeme';
import {
  computeCompressibility,
  compressionProgress,
  createSnapshot,
  CompressibilityScore,
  CompressibilitySnapshot,
} from '../lib/evolution/compressibility';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvolutionCandidate {
  id: string;
  memeId: string;
  memeDescription: string;
  memeImageUrl: string | null;
  targetCubeId: string;
  cutterConfig: LLMOperatorResult;

  // Fitness
  compressionProgress: number;
  userScore: number | null;
  combinedFitness: number;
}

export type TargetCubeStrategy = 'random' | 'least-compressed' | 'adaptive';

export interface EvolutionConfig {
  populationSize: number;        // candidates per generation (default 6)
  selectionPressure: number;     // weight of compression progress vs user choice (default 0.7)
  targetCubeStrategy: TargetCubeStrategy;
  memePoolFilter: string | null; // optional tag filter
}

interface EvolutionState {
  // Core state
  generation: number;
  candidates: EvolutionCandidate[];
  compressibilityLog: CompressibilitySnapshot[];
  config: EvolutionConfig;

  // Runtime
  isGenerating: boolean;
  selectedCandidateId: string | null;
  previewCandidateId: string | null;
  lastError: string | null;

  // Track last applied cube for undo
  lastAppliedCubeId: string | null;

  // Meme pool (pre-fetched batch for sampling)
  memePool: ArchthesisMeme[];
  isFetchingMemes: boolean;

  // Current baseline score (before this generation)
  baselineScore: CompressibilityScore | null;

  // Actions
  setConfig: (config: Partial<EvolutionConfig>) => void;
  fetchMemePool: () => Promise<void>;
  generateCandidates: () => Promise<void>;
  previewCandidate: (id: string | null) => void;
  selectCandidate: (id: string) => void;
  applySelected: () => Promise<void>;
  undoLastGeneration: () => void;
  reset: () => void;

  // Computed
  getCurrentScore: () => CompressibilityScore;
  getCompressibilityDelta: () => number;
}

const DEFAULT_CONFIG: EvolutionConfig = {
  populationSize: 6,
  selectionPressure: 0.7,
  targetCubeStrategy: 'least-compressed',
  memePoolFilter: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEvolutionStore = create<EvolutionState>((set, get) => ({
  // Core state
  generation: 0,
  candidates: [],
  compressibilityLog: [],
  config: { ...DEFAULT_CONFIG },

  // Runtime
  isGenerating: false,
  selectedCandidateId: null,
  previewCandidateId: null,
  lastError: null,

  // Track last applied cube for undo
  lastAppliedCubeId: null,

  // Meme pool
  memePool: [],
  isFetchingMemes: false,

  // Baseline
  baselineScore: null,

  // --- Actions ---

  setConfig: (partial) => set((state) => ({
    config: { ...state.config, ...partial },
  })),

  fetchMemePool: async () => {
    set({ isFetchingMemes: true, lastError: null });
    try {
      const res = await fetch('/api/fetch-memes?limit=50');
      if (!res.ok) throw new Error(`Failed to fetch memes: ${res.status}`);
      const data: FetchMemesResponse = await res.json();
      set({ memePool: data.memes, isFetchingMemes: false });
    } catch (err) {
      set({
        lastError: err instanceof Error ? err.message : 'Failed to fetch meme pool',
        isFetchingMemes: false,
      });
    }
  },

  generateCandidates: async () => {
    const state = get();
    if (state.isGenerating) return;
    if (state.memePool.length === 0) {
      set({ lastError: 'Meme pool is empty — fetch memes first' });
      return;
    }

    // Lazily import builder + meme stores to avoid circular deps
    const { useBuilderStore } = await import('./useBuilderStore');
    const { useMemeStore } = await import('./useMemeStore');
    const placedCubes = useBuilderStore.getState().placedCubes;
    const cubeOperators = useMemeStore.getState().cubeOperators;

    if (placedCubes.length === 0) {
      set({ lastError: 'Place some cubes in Builder mode first' });
      return;
    }

    set({ isGenerating: true, lastError: null, candidates: [] });

    // Snapshot current compressibility as baseline
    const baseline = computeCompressibility(placedCubes, cubeOperators);
    set({ baselineScore: baseline });

    // Pick target cubes
    const targetCubeIds = pickTargetCubes(
      placedCubes.map(c => c.id),
      cubeOperators,
      state.config.populationSize,
      state.config.targetCubeStrategy,
      placedCubes,
    );

    // Sample memes from pool
    const { config, memePool } = get();
    const filteredPool = config.memePoolFilter
      ? memePool.filter(m => m.tags.some(t =>
          t.toLowerCase().includes(config.memePoolFilter!.toLowerCase())
        ))
      : memePool;
    const pool = filteredPool.length > 0 ? filteredPool : memePool;

    // Fire parallel Claude calls
    const errors: string[] = [];
    const promises = targetCubeIds.map(async (cubeId, idx): Promise<EvolutionCandidate | null> => {
      const meme = pool[Math.floor(Math.random() * pool.length)];
      const input = mapMemeToCuboidInput(meme);

      try {
        const cutterConfig = await translateMeme({
          memeDescription: input.memeDescription,
          locationTag: input.locationTag,
          engagementLevel: input.engagementLevel,
          memeImageUrl: meme.imageUrl,
        });

        // Simulate applying this candidate and measure compression progress
        const simulatedOperators = {
          ...cubeOperators,
          [cubeId]: [
            ...(cubeOperators[cubeId] || []),
            {
              id: `evo-sim-${idx}`,
              source: 'meme' as const,
              operator: cutterConfig.operator,
              targets: cutterConfig.targets,
              magnitude: cutterConfig.magnitude,
              decay: cutterConfig.decay,
              createdAt: new Date().toISOString(),
              memeDescription: input.memeDescription,
              reasoning: cutterConfig.reasoning,
              cutter: cutterConfig.cutter,
            },
          ],
        };

        const afterScore = computeCompressibility(placedCubes, simulatedOperators);
        const progress = compressionProgress(baseline, afterScore);

        return {
          id: `evo-${Date.now()}-${idx}`,
          memeId: meme.id,
          memeDescription: input.memeDescription,
          memeImageUrl: meme.imageUrl,
          targetCubeId: cubeId,
          cutterConfig,
          compressionProgress: progress,
          userScore: null,
          combinedFitness: progress, // user score will blend in later
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Evolution candidate ${idx} failed:`, msg);
        errors.push(msg);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const candidates = results.filter((c): c is EvolutionCandidate => c !== null);

    // If ALL candidates failed, surface the error and don't increment generation
    if (candidates.length === 0) {
      const uniqueErrors = [...new Set(errors)];
      const summary = uniqueErrors.length === 1
        ? uniqueErrors[0]
        : `${uniqueErrors.length} different errors occurred`;
      set({
        candidates: [],
        isGenerating: false,
        lastError: `All ${targetCubeIds.length} candidates failed. ${summary}`,
      });
      return;
    }

    // Rank by compression progress (descending)
    candidates.sort((a, b) => b.compressionProgress - a.compressionProgress);

    // Build a warning if some (but not all) candidates failed
    const failedCount = targetCubeIds.length - candidates.length;
    const partialWarning = failedCount > 0
      ? `${failedCount} of ${targetCubeIds.length} candidates failed — showing ${candidates.length} results`
      : null;

    set({
      candidates,
      isGenerating: false,
      generation: get().generation + 1,
      lastError: partialWarning,
    });
  },

  previewCandidate: (id) => set({ previewCandidateId: id }),

  selectCandidate: (id) => {
    const { candidates, config } = get();
    const candidate = candidates.find(c => c.id === id);
    if (!candidate) return;

    // Blend user selection with compression progress
    const updated = candidates.map(c => ({
      ...c,
      userScore: c.id === id ? 1.0 : 0.0,
      combinedFitness:
        config.selectionPressure * c.compressionProgress +
        (1 - config.selectionPressure) * (c.id === id ? 1.0 : 0.0),
    }));

    set({ candidates: updated, selectedCandidateId: id });
  },

  applySelected: async () => {
    const { selectedCandidateId, candidates, baselineScore, generation, compressibilityLog } = get();
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (!candidate) {
      set({ lastError: 'No candidate selected' });
      return;
    }

    // Apply via the meme store's operator pipeline
    const { useMemeStore } = await import('./useMemeStore');
    const { useBuilderStore } = await import('./useBuilderStore');
    const memeStore = useMemeStore.getState();
    const placedCubes = useBuilderStore.getState().placedCubes;

    // Set up the meme store to target the right cube and apply
    memeStore.setTargetCubeId(candidate.targetCubeId);
    memeStore.setMemeDescription(candidate.memeDescription);

    // Build the operator record and apply geometry directly
    // (reuse the translate result we already have — no extra API call)
    const { applyLLMOperator, createCutterFromLLMOutput } = await import('../lib/operators/applyOperator');
    const { getVariationGeometryAsync } = await import('../lib/cube/csgUtils');
    const { CUBE_VARIATIONS } = await import('../lib/cube/specifications');

    const cubeId = candidate.targetCubeId;
    let currentGeometry = memeStore.cubeGeometryOverrides[cubeId];

    if (!currentGeometry) {
      const placedCube = placedCubes.find(c => c.id === cubeId);
      if (!placedCube) {
        set({ lastError: `Target cube ${cubeId} no longer exists in the assembly` });
        return;
      }
      const variation = CUBE_VARIATIONS.find(v => v.id === placedCube.variationId);
      if (!variation) {
        set({ lastError: `Variation for cube ${cubeId} not found` });
        return;
      }
      currentGeometry = await getVariationGeometryAsync(variation);
    }

    const newGeometry = applyLLMOperator(currentGeometry, candidate.cutterConfig);

    // Use the pre-cut geometry bounding box for cutter positioning
    currentGeometry.computeBoundingBox();
    const cutterGeo = currentGeometry.boundingBox
      ? createCutterFromLLMOutput(candidate.cutterConfig, currentGeometry.boundingBox)
      : null;

    const record = {
      id: crypto.randomUUID(),
      source: 'meme' as const,
      operator: candidate.cutterConfig.operator,
      targets: candidate.cutterConfig.targets,
      magnitude: candidate.cutterConfig.magnitude,
      decay: candidate.cutterConfig.decay,
      createdAt: new Date().toISOString(),
      memeDescription: candidate.memeDescription,
      reasoning: candidate.cutterConfig.reasoning,
      cutter: candidate.cutterConfig.cutter,
    };

    // Update meme store state directly
    const prevOverrides = memeStore.cubeGeometryOverrides;
    const prevStacks = memeStore.cubeGeometryStacks;
    const prevOps = memeStore.cubeOperators;

    useMemeStore.setState({
      cubeGeometryOverrides: { ...prevOverrides, [cubeId]: newGeometry },
      cubeGeometryStacks: {
        ...prevStacks,
        [cubeId]: [...(prevStacks[cubeId] || []), currentGeometry.clone()],
      },
      cubeOperators: {
        ...prevOps,
        [cubeId]: [...(prevOps[cubeId] || []), record],
      },
      lastResult: candidate.cutterConfig,
      lastCutterGeometry: cutterGeo,
    });

    // Log compressibility snapshot
    const updatedOps = useMemeStore.getState().cubeOperators;
    const afterScore = computeCompressibility(placedCubes, updatedOps);
    const prevTotal = baselineScore?.total ?? 0;
    const snapshot = createSnapshot(generation, afterScore, prevTotal);

    set({
      compressibilityLog: [...compressibilityLog, snapshot],
      candidates: [],
      selectedCandidateId: null,
      previewCandidateId: null,
      baselineScore: afterScore,
      lastAppliedCubeId: cubeId,
    });
  },

  undoLastGeneration: async () => {
    const { lastAppliedCubeId, compressibilityLog, generation } = get();

    // Revert geometry on the last applied cube via the meme store
    if (lastAppliedCubeId) {
      const { useMemeStore } = await import('./useMemeStore');
      const memeState = useMemeStore.getState();
      const stack = memeState.cubeGeometryStacks[lastAppliedCubeId] || [];
      const ops = memeState.cubeOperators[lastAppliedCubeId] || [];

      if (stack.length > 0 && ops.length > 0) {
        const previousGeometry = stack[stack.length - 1];
        const newOverrides = { ...memeState.cubeGeometryOverrides };

        if (stack.length === 1) {
          // Reverting to base geometry — remove override entirely
          delete newOverrides[lastAppliedCubeId];
        } else {
          newOverrides[lastAppliedCubeId] = previousGeometry;
        }

        useMemeStore.setState({
          cubeGeometryOverrides: newOverrides,
          cubeGeometryStacks: {
            ...memeState.cubeGeometryStacks,
            [lastAppliedCubeId]: stack.slice(0, -1),
          },
          cubeOperators: {
            ...memeState.cubeOperators,
            [lastAppliedCubeId]: ops.slice(0, -1),
          },
          lastResult: null,
          lastCutterGeometry: null,
        });
      }
    }

    set({
      candidates: [],
      selectedCandidateId: null,
      previewCandidateId: null,
      compressibilityLog: compressibilityLog.slice(0, -1),
      generation: Math.max(0, generation - 1),
      lastAppliedCubeId: null,
    });
  },

  reset: () => set({
    generation: 0,
    candidates: [],
    compressibilityLog: [],
    config: { ...DEFAULT_CONFIG },
    isGenerating: false,
    selectedCandidateId: null,
    previewCandidateId: null,
    lastError: null,
    baselineScore: null,
    lastAppliedCubeId: null,
  }),

  // --- Computed ---

  getCurrentScore: () => {
    // This is unused at render time — callers should use computeCompressibility directly
    // with store data from React hooks (see EvolutionPanel.tsx)
    return { geometricClustering: 0, spatialRegularity: 0, operatorSequence: 0, memeCoherence: 0, total: 0 };
  },

  getCompressibilityDelta: () => {
    const { compressibilityLog } = get();
    if (compressibilityLog.length === 0) return 0;
    return compressibilityLog[compressibilityLog.length - 1].delta;
  },
}));

// ---------------------------------------------------------------------------
// Target cube selection strategies
// ---------------------------------------------------------------------------

function pickTargetCubes(
  cubeIds: string[],
  cubeOperators: Record<string, import('../lib/operators/types').OperatorRecord[]>,
  count: number,
  strategy: TargetCubeStrategy,
  placedCubes: import('../lib/cube/types').PlacedCube[],
): string[] {
  if (cubeIds.length === 0) return [];
  const n = Math.min(count, cubeIds.length);

  switch (strategy) {
    case 'least-compressed': {
      // Score each cube by its operator count (fewer = less compressed = more interesting to target)
      const scored = cubeIds.map(id => ({
        id,
        opCount: (cubeOperators[id] || []).length,
      }));
      scored.sort((a, b) => a.opCount - b.opCount);

      // Take the least-operated cubes, with some randomness within ties
      const result: string[] = [];
      let i = 0;
      while (result.length < n && i < scored.length) {
        const tieGroup = [scored[i]];
        while (i + 1 < scored.length && scored[i + 1].opCount === scored[i].opCount) {
          i++;
          tieGroup.push(scored[i]);
        }
        // Shuffle the tie group
        for (let j = tieGroup.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [tieGroup[j], tieGroup[k]] = [tieGroup[k], tieGroup[j]];
        }
        for (const item of tieGroup) {
          if (result.length < n) result.push(item.id);
        }
        i++;
      }
      return result;
    }

    case 'adaptive': {
      // Hybrid: 50% least-compressed, 50% random
      const half = Math.ceil(n / 2);
      const leastCompressed = pickTargetCubes(cubeIds, cubeOperators, half, 'least-compressed', placedCubes);
      const remaining = cubeIds.filter(id => !leastCompressed.includes(id));
      const randomPicks = pickTargetCubes(remaining, cubeOperators, n - half, 'random', placedCubes);
      return [...leastCompressed, ...randomPicks];
    }

    case 'random':
    default: {
      const shuffled = [...cubeIds];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }
      return shuffled.slice(0, n);
    }
  }
}
