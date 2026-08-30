import { create } from 'zustand';
import type { LLMOperatorResult, TranslationPass1, TranslationPass2 } from '../lib/operators/types';
import type { ArchthesisMeme } from '../types/archthesis';
import type { FetchMemesResponse } from '../types/archthesis';
import { translateMemeTwoPass } from '../lib/api/translateMeme';
import {
  buildSimulatedOperatorRecord,
  planGeneration,
  scoreCandidateProgress,
  type TargetCubeStrategy,
} from '../lib/evolution/generation';
import { isDemoMode } from '../lib/demo/demoMode';
import { isDemoRecordMode } from '../lib/demo/recorder';
import {
  computeCompressibility,
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
  memeTitle?: string;
  memeImageUrl: string | null;
  targetCubeId: string;
  cutterConfig: LLMOperatorResult;
  pass1?: TranslationPass1;
  /** Full pass-2 output (geometry reasoning + confidence vector), kept so an
   *  applied candidate stays fully explainable when its cube is re-inspected. */
  pass2?: TranslationPass2;
  /** Model id the server reported for this candidate's translation. */
  model?: string;
  /** Prompt-file "# version" the server reported. */
  promptVersion?: string;

  // Fitness: candidates are ranked by raw compression progress. (A blended
  // user-score fitness existed here once but nothing downstream ever read it
  // — see EVOLUTION_SPEC.md "future work" for the generational version.)
  compressionProgress: number;
}

// Target selection + generation planning moved to src/lib/evolution/generation.ts
// (pure, importable headlessly by the research harness — R2 refactor,
// approved 2026-08-30). Re-exported so existing import sites keep working.
export type { TargetCubeStrategy };

/**
 * Evolution's internal sub-mode.
 *
 * - 'evolve'       : the canonical Evolution panel (compressibility-driven candidates).
 * - 'pataphysical' : the meme-translation surface (former top-level Pataphysical mode)
 *                    re-parented here as a contextual sub-mode.
 */
export type EvolutionSubMode = 'evolve' | 'pataphysical';

export interface EvolutionConfig {
  populationSize: number;        // candidates per generation (default 6)
  targetCubeStrategy: TargetCubeStrategy;
  memePoolFilter: string | null; // optional tag filter
}

interface EvolutionState {
  // Sub-mode (internal toggle within Evolution)
  subMode: EvolutionSubMode;
  setSubMode: (m: EvolutionSubMode) => void;

  // Core state
  generation: number;
  candidates: EvolutionCandidate[];
  compressibilityLog: CompressibilitySnapshot[];
  config: EvolutionConfig;

  // Runtime
  isGenerating: boolean;
  generationPhase: 'reading' | 'scoring' | null;
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

// Offline-demo replay cursor: which recorded "Generate candidates" round the
// next click serves. Module-level on purpose — it must never be persisted
// into saved compositions, and a page reload resetting it is exactly the
// rehearsal behaviour we want (reload → the choreography starts over).
let demoEvolveRoundIndex = 0;

const DEFAULT_CONFIG: EvolutionConfig = {
  populationSize: 6,
  // Fixed — the strategy selector was retired from the Settings UI; the other
  // strategies ('random', 'adaptive') remain implemented below for code use.
  targetCubeStrategy: 'least-compressed',
  memePoolFilter: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEvolutionStore = create<EvolutionState>((set, get) => ({
  // Sub-mode
  subMode: 'evolve' as EvolutionSubMode,
  setSubMode: (m) => set({ subMode: m }),

  // Core state
  generation: 0,
  candidates: [],
  compressibilityLog: [],
  config: { ...DEFAULT_CONFIG },

  // Runtime
  isGenerating: false,
  generationPhase: null,
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
      // Offline demo: the pool comes from the bundle (replayed rounds don't
      // sample it, but the panel's meme strip still needs something to show).
      if (isDemoMode()) {
        const { fetchDemoMemes } = await import('../lib/demo/bundle');
        const data = await fetchDemoMemes({ limit: 50, offset: 0, sort: 'recent' });
        set({ memePool: data.memes, isFetchingMemes: false });
        return;
      }
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

    // Offline demo: replay the recorded rounds in click order, driving the
    // same phase states the live path does so the beat looks identical.
    if (isDemoMode()) {
      set({ isGenerating: true, generationPhase: 'reading', lastError: null, candidates: [] });
      try {
        const { getDemoEvolveRound } = await import('../lib/demo/bundle');
        const candidates = await getDemoEvolveRound(demoEvolveRoundIndex);
        // Live rounds take a while (parallel AI calls); pace the replay so it
        // reads as work happening, not as a cached flash.
        await new Promise(r => setTimeout(r, 1600));
        set({ generationPhase: 'scoring' });
        await new Promise(r => setTimeout(r, 350));
        demoEvolveRoundIndex += 1;
        set({
          candidates,
          isGenerating: false,
          generationPhase: null,
          generation: get().generation + 1,
          lastError: null,
        });
      } catch (err) {
        set({
          candidates: [],
          isGenerating: false,
          generationPhase: null,
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

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
      set({ lastError: 'Place some cubes in the assembly first' });
      return;
    }

    set({ isGenerating: true, generationPhase: 'reading', lastError: null, candidates: [] });

    // Snapshot current compressibility as baseline
    const baseline = computeCompressibility(placedCubes, cubeOperators);
    set({ baselineScore: baseline });

    // Resolve this generation's assignments (target cubes + sampled memes)
    // through the pure generation lib — same logic as before, extracted so
    // the research harness can replay a step without importing this store.
    const { config: liveConfig, memePool } = get();
    const assignments = planGeneration({
      placedCubes,
      cubeOperators,
      populationSize: state.config.populationSize,
      targetCubeStrategy: state.config.targetCubeStrategy,
      memePool,
      memePoolFilter: liveConfig.memePoolFilter,
    });

    // Fire parallel Claude calls
    const errors: string[] = [];
    const promises = assignments.map(async ({ index: idx, targetCubeId: cubeId, meme, input }): Promise<EvolutionCandidate | null> => {
      try {
        const twoPassResult = await translateMemeTwoPass({
          memeDescription: input.memeDescription,
          locationTag: input.locationTag,
          engagementLevel: input.engagementLevel,
          memeImageUrl: meme.imageUrl,
        });
        const cutterConfig: LLMOperatorResult = twoPassResult.pass2;
        const pass1 = twoPassResult.pass1;
        const pass2 = twoPassResult.pass2;

        // Simulate applying this candidate and measure compression progress
        const progress = scoreCandidateProgress({
          placedCubes,
          cubeOperators,
          baseline,
          targetCubeId: cubeId,
          simulatedRecord: buildSimulatedOperatorRecord({
            index: idx,
            cutterConfig,
            memeDescription: input.memeDescription,
          }),
        });

        return {
          id: `evo-${Date.now()}-${idx}`,
          memeId: meme.id,
          memeDescription: input.memeDescription,
          memeTitle: meme.topText || meme.description?.slice(0, 50) || meme.id,
          memeImageUrl: meme.imageUrl,
          targetCubeId: cubeId,
          cutterConfig,
          pass1,
          pass2,
          // Provenance — conditional so Firestore never sees undefined.
          ...(twoPassResult.model ? { model: twoPassResult.model } : {}),
          ...(twoPassResult.promptVersion ? { promptVersion: twoPassResult.promptVersion } : {}),
          compressionProgress: progress,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Evolution candidate ${idx} failed:`, msg);
        errors.push(msg);
        return null;
      }
    });

    const results = await Promise.all(promises);

    // Transition to scoring phase briefly before rendering results
    set({ generationPhase: 'scoring' });
    await new Promise(r => setTimeout(r, 350));

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
        generationPhase: null,
        lastError: `All ${assignments.length} candidates failed. ${summary}`,
      });
      return;
    }

    // Rank by compression progress (descending)
    candidates.sort((a, b) => b.compressionProgress - a.compressionProgress);

    // ?demoRecord: capture the full ranked round for offline replay.
    if (isDemoRecordMode() && candidates.length > 0) {
      const { recordEvolveRound } = await import('../lib/demo/recorder');
      recordEvolveRound({ candidates });
    }

    // Build a warning if some (but not all) candidates failed
    const failedCount = assignments.length - candidates.length;
    const partialWarning = failedCount > 0
      ? `${failedCount} of ${assignments.length} candidates failed — showing ${candidates.length} results`
      : null;

    set({
      candidates,
      isGenerating: false,
      generationPhase: null,
      generation: get().generation + 1,
      lastError: partialWarning,
    });
  },

  previewCandidate: (id) => set({ previewCandidateId: id }),

  selectCandidate: (id) => {
    if (!get().candidates.some(c => c.id === id)) return;
    set({ selectedCandidateId: id });
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

    // Target the applied cube so the viewport highlights it and its change
    // card opens. Deliberately do NOT copy the candidate's meme into the meme
    // store's input fields — those belong to the Pataphysical creation form,
    // and pre-filling them there made an applied Evolve candidate look like a
    // pending Pataphysical translation. Provenance already rides on the
    // operator record and cubeTranslations below.
    memeStore.setTargetCubeId(candidate.targetCubeId);

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

    // Provenance rides along on the record (meme identity + full two-pass
    // reasoning) so the change stays explainable when the cube is clicked
    // later — including after a save/load round-trip. Conditional spreads
    // keep undefined out of the record (Firestore rejects undefined fields).
    const confidenceVector = candidate.pass2?.confidence_vector ?? null;
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
      origin: 'evolution' as const,
      ...(candidate.memeTitle ? { memeTitle: candidate.memeTitle } : {}),
      ...(candidate.memeImageUrl ? { memeImageUrl: candidate.memeImageUrl } : {}),
      ...(candidate.pass1 ? { pass1: candidate.pass1 } : {}),
      ...(candidate.pass2 ? { pass2: candidate.pass2 } : {}),
      ...(confidenceVector ? { confidenceVector } : {}),
      ...(candidate.model ? { model: candidate.model } : {}),
      ...(candidate.promptVersion ? { promptVersion: candidate.promptVersion } : {}),
    };

    // Update meme store state directly. cubeTranslations gets the same
    // snapshot pataphysical translations write, so re-selecting this cube
    // (in either sub-mode) restores the full explanation card + cutter.
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
      cubeTranslations: {
        ...memeStore.cubeTranslations,
        [cubeId]: {
          result: candidate.cutterConfig,
          pass1: candidate.pass1 ?? null,
          pass2: candidate.pass2 ?? null,
          confidenceVector,
          model: candidate.model ?? null,
          cutterGeometry: cutterGeo,
          memeDescription: candidate.memeDescription,
          memeTitle: candidate.memeTitle ?? null,
          memeImageUrl: candidate.memeImageUrl,
        },
      },
      lastResult: candidate.cutterConfig,
      lastPass1: candidate.pass1 ?? null,
      lastPass2: candidate.pass2 ?? null,
      lastConfidenceVector: confidenceVector,
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

        // Drop the stored explanation snapshot along with the geometry
        // (mirrors revertLastOperator in the meme store).
        const remainingTranslations = { ...memeState.cubeTranslations };
        delete remainingTranslations[lastAppliedCubeId];

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
          cubeTranslations: remainingTranslations,
          lastResult: null,
          lastPass1: null,
          lastPass2: null,
          lastConfidenceVector: null,
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

  reset: () => {
    demoEvolveRoundIndex = 0;
    set({
      generation: 0,
      candidates: [],
      compressibilityLog: [],
      config: { ...DEFAULT_CONFIG },
      isGenerating: false,
      generationPhase: null,
      selectedCandidateId: null,
      previewCandidateId: null,
      lastError: null,
      baselineScore: null,
      lastAppliedCubeId: null,
    });
  },

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

// Target cube selection lives in src/lib/evolution/generation.ts
// (pickTargetCubes) — moved there, behavior unchanged, so the research
// harness can use it without importing this store.
