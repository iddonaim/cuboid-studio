# Evolution Mode — Architecture Specification

## For Claude Code: Cuboid Studio Feature Implementation

> **Status note (2026-07):** the core of this spec has been **built and shipped** —
> the compressibility engine runs with four sub-scores (geometric clustering,
> spatial regularity, operator sequence, meme coherence). Two axes described in
> earlier drafts (CSG tree edit distance, topological genus) were never implemented
> and remain aspirational. See [`CONTEXT.md`](CONTEXT.md) for what's live today.

---

## Theoretical Foundation

This mode takes Jürgen Schmidhuber's **compression progress drive** (2008) as the scaffolding for its fitness function. The core principle:

> **Interestingness ≈ first derivative of compressibility.**
> Reward configurations that yield the steepest learning curve — not the most beautiful (static) or most random (noise), but the most *learnable*.

> ⚠ **Two honesty notes on this whole document** *(added 2026-07-28, verified at
> origin/main):*
>
> 1. **Schmidhuber is re-interpreted here, not implemented.** The shipping
>    compressor is a **static four-sub-score signature** (geometric clustering
>    0.3, spatial regularity 0.3, operator-sequence n-grams 0.2, meme coherence
>    0.2), and "compression progress" is the delta between two such scores. There
>    is no learning compressor. Claim the re-interpretation — it is stronger than
>    pretending, and the delta really is computed.
> 2. **This is not a genetic algorithm and never became one.** No population, no
>    crossover, no mutation, no inheritance. The shipped loop is a
>    **single-lineage guided search with the architect in the loop**. Crossover
>    was refused deliberately: single lineage keeps a human answerable for each
>    step. `generation` and `populationSize` below are real identifiers in the
>    live code (`populationSize` default 6) and are *not* GA residue — the
>    banned vocabulary is anything implying crossover or inheritance.

### Key Equations (from Schmidhuber 2008)

**Subjective Beauty** `B(D, O(t))` — proportional to how compactly observer O can encode data D at time t.

**Interestingness** as first derivative:

```
I(D, O(t)) ∼ ∂B(D, O(t)) / ∂t
```

**Compression progress reward** (discrete):

```
r_int(t+1) = C(p(t), h(≤t+1)) - C(p(t+1), h(≤t+1))
```

The difference in compression performance between old and new compressor on the same history = intrinsic reward.

---

## How This Maps to Cuboid Studio

### Domain Translation

| Schmidhuber Concept | Cuboid Studio Implementation |
|---|---|
| **History h(≤t)** | Ordered sequence of all meme operations applied to the assembly |
| **Data D** | Current assembly state (cube positions + geometry overrides) |
| **Compressor p(t)** | A function measuring structural regularity across the assembly |
| **Compression progress r_int** | Change in compressibility score after a meme operation |
| **Observer O** | The architect. ⚠ Their selections decide *what is applied*, but no longer feed a fitness score — `userScore` / `combinedFitness` / `selectionPressure` were computed and never read, and were removed (PR #115). Returns only if selection spans generations; see the FUTURE WORK block below. *(Verified at origin/main 2026-07-28.)* |
| **Action selector** | The evolution engine proposing candidate operations |

### The Two Failure Modes to Avoid

1. **"Dark room"** — Assembly converges to uniform repetition. Fully compressed, zero progress possible. *Boring.*
2. **"White noise"** — Random cuts everywhere, no shared structure. Incompressible, zero progress possible. *Also boring.*

The sweet spot: **structured novelty** — operations that introduce previously unknown regularities discoverable across cubes.

---

## Data Structures

### Mapping to Actual Codebase

| Spec concept | Actual codebase location |
|---|---|
| `cubeState.geometryOverride` | `useMemeStore.cubeGeometryOverrides[cubeId]` |
| `cubeState.operatorHistory` | `useMemeStore.cubeOperators[cubeId]: OperatorRecord[]` |
| `assembly.cubes` | `useBuilderStore.placedCubes: PlacedCube[]` |
| Cutter params per operation | `OperatorRecord.cutter: LLMCutterResult` (type, proportions, position, rotation) |
| Meme reference per operation | `OperatorRecord.memeDescription` + `selectedMemeImageUrl` in meme store |

### New: Evolution State

```typescript
interface EvolutionCandidate {
  id: string;
  memeId: string;               // from archthesis meme pool
  memeDescription: string;
  targetCubeIds: string[];      // which cubes this operation targets
  cutterConfig: LLMOperatorResult;  // proposed boolean cut parameters

  // Fitness scores
  compressionProgress: number;  // computed by compressibility engine

  // FUTURE WORK (removed from the implementation 2026-07): a blended fitness
  // (userScore from selection + compressionProgress, weighted by a
  // selectionPressure config) was carried on candidates but never read by
  // ranking or apply. It comes back when selection spans generations — i.e.
  // when the previous generation's blended fitness biases the next
  // generation's target-cube choice or meme sampling.
  // userScore: number | null;  // from user selection (null = not yet rated)
  // combinedFitness: number;   // weighted sum
}

interface CompressibilityEntry {
  generation: number;
  timestamp: number;
  score: number;                // assembly compressibility at this point
  delta: number;                // change from previous (= compression progress)
}

interface EvolutionConfig {
  populationSize: number;       // candidates shown per generation (default 6)
  // selectionPressure: number; // FUTURE WORK — weight of compression progress
                                // vs user choice; removed with the unread
                                // blended-fitness path (see above)
  targetCubeStrategy: 'random' | 'least-compressed' | 'adaptive';
  memePoolFilter: string | null; // optional: restrict to meme tag subset
}

interface EvolutionState {
  generation: number;
  candidates: EvolutionCandidate[];
  compressibilityLog: CompressibilityEntry[];
  config: EvolutionConfig;
  isGenerating: boolean;
  selectedCandidateId: string | null;

  // Actions
  generateCandidates: () => Promise<void>;
  selectCandidate: (id: string) => void;
  applySelected: () => void;
  undoLastGeneration: () => void;
  setConfig: (config: Partial<EvolutionConfig>) => void;
}
```

---

## Compressibility Engine

Four sub-scores, each capturing a different type of regularity:

### 1. Geometric Clustering (weight: 0.3)
Represent each cube's operator history as a feature vector from `OperatorRecord.cutter` (type=4 options, proportions=3 floats, position=3 floats, rotation=3 floats → 13D per operation). Cluster cubes by similarity. More cubes per cluster = more compressible.

### 2. Spatial Regularity (weight: 0.3)
Check for axis symmetry, row/column consistency, gradient patterns across the grid. Grid positions from `placedCubes` make this efficient.

### 3. Operator Sequence Compressibility (weight: 0.2)
Concatenate operator classes across cubes. Measure n-gram repetition ratio. More repetition = higher score.

### 4. Meme Coherence (weight: 0.2)
Group cubes by last applied meme. Measure within-group variance on cutter parameters. Low variance = consistent translation = compressible.

---

## Evolution Loop

Per generation: snapshot → generate N candidates (parallel Claude calls) → present ranked by compression progress → user selects → apply → log → adapt strategy.

### Target Cube Strategies
- `random` — uniform random. Good baseline.
- `least-compressed` — target cubes with highest local entropy.
- `adaptive` — learns which regions yield most progress.

### Meme Selection Options
- **Open** — any meme from archthesis pool
- **Thematic** — user constrains by tag
- **Sequential** — chronological order of meme creation

---

## UI Design Decisions

### Candidate Preview Approach
The 250px sidebar can't hold 6 Three.js canvases. Best approach: **sequential preview in main viewport**. Sidebar shows ranked list with scores. Click a candidate → main viewport shows that candidate's result overlaid on assembly. "Apply" button confirms selection.

### Compressibility Timeline
Small SVG sparkline in sidebar. No heavy charting library needed. Slope = interestingness.

---

## Implementation Order

1. `src/lib/evolution/compressibility.ts` — Pure scoring functions, testable independently
2. `src/store/useEvolutionStore.ts` — Zustand store for generation tracking
3. Candidate generation — Client-side parallel calls to existing `/api/translate-meme`
4. `src/components/evolution/EvolutionPanel.tsx` — Sidebar UI with candidate list
5. Compressibility sparkline chart
6. Adaptive strategies

## Technical Notes

- Batch Claude calls: fire from client side in parallel (avoids Vercel 10s timeout)
- ~6 calls/generation × ~15 generations/session = ~90 API calls (~$0.30-0.90/session)
- Random meme access: pre-fetch batch from archthesis at evolution session start, sample from that
- All files should be TypeScript (.ts/.tsx), not .js/.jsx as the spec originally listed
