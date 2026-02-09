/**
 * Compressibility Engine — Evolution Mode
 * ========================================
 *
 * # The idea in plain words
 *
 * We want the evolution engine to prefer *interesting* changes — not random
 * noise, and not boring repetition either.  The insight (from Schmidhuber,
 * 2008) is that "interestingness" can be measured as the *speed at which
 * something becomes easier to describe*.
 *
 * Think of it like this: if you look at a building facade and at first it
 * seems chaotic, but then you notice a hidden pattern (oh — every third
 * window is round!), the moment of noticing that pattern is the interesting
 * moment.  The facade just became more compressible in your mind.
 *
 * So we measure how "describable" (compressible) the whole assembly is, and
 * then we reward operations that *increase* that describability.  This steers
 * evolution away from two failure modes:
 *
 *   - **The "dark room"**: everything is the same.  Already fully described,
 *     nothing new to learn.  Score is high but can't go higher.  Boring.
 *
 *   - **"White noise"**: every cube is randomly different.  No patterns to
 *     find, score stays low forever.  Also boring.
 *
 * The sweet spot is *structured novelty*: operations that introduce
 * previously unknown regularities that can be discovered across cubes.
 *
 *
 * # How we measure compressibility
 *
 * We look at four different kinds of "pattern" in the assembly and blend
 * them into a single score from 0 (no patterns) to 1 (fully regular).
 *
 *
 * ## 1. Geometric Clustering (30% of total score)
 *
 * "Do the boolean cuts on different cubes look alike?"
 *
 * For each cube that has been cut, we describe all its cuts as a list of
 * numbers (what shape was used, how big, where it was placed, how it was
 * rotated — 13 numbers per cut, averaged across the cube's history).
 *
 * Then we compare every pair of cubes: the more similar their cut-profiles
 * are, the more compressible.  If you applied the same meme to 5 cubes and
 * they all got similar sphere cuts, this score goes up.
 *
 * Technically: cosine similarity on 13-dimensional feature vectors averaged
 * over all pairwise comparisons.
 *
 *
 * ## 2. Spatial Regularity (30% of total score)
 *
 * "Are the cuts arranged in spatial patterns — rows, columns, symmetry?"
 *
 * We check two things:
 *
 *   a) **Row/column consistency** (60% of this sub-score): group cubes that
 *      share the same X, Y, or Z coordinate.  Within each group, do they
 *      tend to have the same *type* of cut?  If all cubes in a row got
 *      "inversion" operations, that's a pattern we can describe concisely.
 *
 *   b) **Mirror symmetry** (40% of this sub-score): for each axis, check if
 *      cubes have mirror-image partners with the same operation type.  If the
 *      left side of the assembly mirrors the right, that's compressible.
 *
 *
 * ## 3. Operator Sequence (20% of total score)
 *
 * "Are the same sequences of operations repeating across cubes?"
 *
 * We line up all the operation types that have been applied across all cubes
 * into one long sequence, then look for repeated subsequences (n-grams of
 * length 1, 2, and 3).  If the same pair of operations keeps appearing,
 * that's a pattern.  More repetition = higher score.
 *
 * Example: if three different cubes each got "inversion → drift", that
 * two-step pattern appears three times — very compressible.
 *
 *
 * ## 4. Meme Coherence (20% of total score)
 *
 * "When the same meme is applied to different cubes, does Claude translate
 * it consistently?"
 *
 * We group cubes by the last meme that was applied to them.  Within each
 * group, we measure how similar the resulting cut parameters are.  If the
 * same meme always produces roughly the same size/position of cut, that's
 * consistent — and consistent translations are compressible.
 *
 * Low variance within a meme group = high coherence.  We use exp(-variance)
 * so the score smoothly goes from ~1 (identical cuts) to ~0 (wildly different).
 *
 *
 * # How "interestingness" works
 *
 * Before applying a candidate operation, we snapshot the assembly's total
 * compressibility score.  After applying it, we measure again.  The
 * difference is the **compression progress**:
 *
 *   interestingness = score_after − score_before
 *
 * Positive = the assembly just became more describable = interesting.
 * Negative = it became more random/chaotic = not interesting.
 * Zero     = no change in describability = neutral.
 *
 * The evolution engine ranks candidates by this delta and presents the most
 * interesting ones first.
 *
 *
 * # Technical summary
 *
 * Four sub-scores, each normalised to [0, 1]:
 *
 *   1. Geometric Clustering  (weight 0.3) — feature-vector cosine similarity
 *   2. Spatial Regularity    (weight 0.3) — axis consistency + mirror symmetry
 *   3. Operator Sequence     (weight 0.2) — n-gram repetition ratio
 *   4. Meme Coherence        (weight 0.2) — within-group parameter variance
 *
 * Total = weighted sum.  Compression progress = delta of total.
 */

import type { PlacedCube } from '../cube/types';
import type { OperatorRecord, CutterType, OperatorClass } from '../operators/types';
import { GRID_STRIDE } from '../cube/constants';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CompressibilityScore {
  total: number;
  geometricClustering: number;
  spatialRegularity: number;
  operatorSequence: number;
  memeCoherence: number;
}

export interface CompressibilitySnapshot {
  generation: number;
  timestamp: number;
  score: CompressibilityScore;
  delta: number; // change in total from previous snapshot
}

const WEIGHTS = {
  geometricClustering: 0.3,
  spatialRegularity: 0.3,
  operatorSequence: 0.2,
  memeCoherence: 0.2,
} as const;

/**
 * Compute full compressibility score for the current assembly state.
 *
 * @param placedCubes   - cubes from the builder store
 * @param cubeOperators - per-cube operator history from the meme store
 */
export function computeCompressibility(
  placedCubes: PlacedCube[],
  cubeOperators: Record<string, OperatorRecord[]>,
): CompressibilityScore {
  // Only score cubes that have at least one operator applied
  const operatedCubeIds = placedCubes
    .map(c => c.id)
    .filter(id => (cubeOperators[id]?.length ?? 0) > 0);

  // If fewer than 2 operated cubes, there's nothing meaningful to compress
  if (operatedCubeIds.length < 2) {
    return {
      total: 0,
      geometricClustering: 0,
      spatialRegularity: 0,
      operatorSequence: 0,
      memeCoherence: 0,
    };
  }

  const gc = scoreGeometricClustering(operatedCubeIds, cubeOperators);
  const sr = scoreSpatialRegularity(placedCubes, operatedCubeIds, cubeOperators);
  const os = scoreOperatorSequence(operatedCubeIds, cubeOperators);
  const mc = scoreMemeCoherence(operatedCubeIds, cubeOperators);

  const total =
    WEIGHTS.geometricClustering * gc +
    WEIGHTS.spatialRegularity * sr +
    WEIGHTS.operatorSequence * os +
    WEIGHTS.memeCoherence * mc;

  return {
    total,
    geometricClustering: gc,
    spatialRegularity: sr,
    operatorSequence: os,
    memeCoherence: mc,
  };
}

/**
 * Compute compression progress between two assembly states.
 * Positive = interesting (assembly became more compressible).
 */
export function compressionProgress(
  before: CompressibilityScore,
  after: CompressibilityScore,
): number {
  return after.total - before.total;
}

/**
 * Create a snapshot for the compressibility log.
 */
export function createSnapshot(
  generation: number,
  score: CompressibilityScore,
  previousTotal: number,
): CompressibilitySnapshot {
  return {
    generation,
    timestamp: Date.now(),
    score,
    delta: score.total - previousTotal,
  };
}

// ---------------------------------------------------------------------------
// Sub-score 1: Geometric Clustering (0.3)
// ---------------------------------------------------------------------------
//
// Plain english:
//   Each boolean cut is described by 13 numbers (shape type, size, position,
//   rotation).  For each cube, we average all its cuts into a single 13-number
//   "fingerprint".  Then we compare every pair of cubes' fingerprints — the
//   more similar they are on average, the higher this score.
//
// Technical:
//   Per operator: cutterType (one-hot 4D) + proportions (3D) + position (3D) +
//   rotation (3D) = 13D.  Average across history → fixed-length feature.
//   Score = mean pairwise cosine similarity.

const CUTTER_TYPE_INDEX: Record<CutterType, number> = {
  box: 0,
  sphere: 1,
  cylinder: 2,
  plane: 3,
};

function operatorToVector(op: OperatorRecord): number[] {
  const oneHot = [0, 0, 0, 0];
  oneHot[CUTTER_TYPE_INDEX[op.cutter.type]] = 1;
  return [
    ...oneHot,
    ...op.cutter.proportions,
    ...op.cutter.position,
    ...op.cutter.rotation.map(d => d / 360), // normalise degrees to [0,1]
  ];
}

function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return new Array(13).fill(0);
  const sum = new Array(vectors[0].length).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < v.length; i++) sum[i] += v[i];
  }
  return sum.map(s => s / vectors.length);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function scoreGeometricClustering(
  cubeIds: string[],
  cubeOperators: Record<string, OperatorRecord[]>,
): number {
  // Build per-cube feature vector (average of all operators)
  const features = cubeIds.map(id => {
    const ops = cubeOperators[id] || [];
    return averageVectors(ops.map(operatorToVector));
  });

  // Average pairwise cosine similarity
  let totalSim = 0;
  let pairs = 0;
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      totalSim += cosineSimilarity(features[i], features[j]);
      pairs++;
    }
  }

  return pairs === 0 ? 0 : totalSim / pairs;
}

// ---------------------------------------------------------------------------
// Sub-score 2: Spatial Regularity (0.3)
// ---------------------------------------------------------------------------
//
// Plain english:
//   Do the cuts form spatial patterns?  We check two things:
//   (a) Line up cubes along each axis (X rows, Y rows, Z rows).  Within each
//       row, do they tend to share the same operation type?  Score goes up if,
//       say, an entire row all got "inversion" cuts.
//   (b) Mirror symmetry: for each axis, flip cube positions and check if the
//       mirror partner got the same kind of operation.
//
// Technical:
//   Consistency = fraction of majority class per axis-aligned group, averaged.
//   Symmetry = fraction of mirror-matched cubes with same operator class.
//   Blend: 60% consistency + 40% symmetry.

function scoreSpatialRegularity(
  placedCubes: PlacedCube[],
  operatedCubeIds: string[],
  cubeOperators: Record<string, OperatorRecord[]>,
): number {
  const operatedSet = new Set(operatedCubeIds);
  const operated = placedCubes.filter(c => operatedSet.has(c.id));
  if (operated.length < 2) return 0;

  // Get the last operator class for each operated cube
  const cubeClass = new Map<string, OperatorClass>();
  for (const cube of operated) {
    const ops = cubeOperators[cube.id];
    if (ops && ops.length > 0) {
      cubeClass.set(cube.id, ops[ops.length - 1].operator);
    }
  }

  // --- Row/column consistency ---
  // Group cubes by each axis (rounded to grid stride)
  // For each group, measure how many share the same operator class
  let consistencyScore = 0;
  let axisGroupCount = 0;

  for (const axisIdx of [0, 1, 2] as const) {
    const groups = new Map<number, PlacedCube[]>();
    for (const cube of operated) {
      const key = Math.round(cube.position[axisIdx] / GRID_STRIDE);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(cube);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      axisGroupCount++;

      // Count the most common operator class in this group
      const classCounts = new Map<string, number>();
      for (const cube of group) {
        const cls = cubeClass.get(cube.id);
        if (cls) classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
      }
      const maxCount = Math.max(...classCounts.values(), 0);
      consistencyScore += maxCount / group.length;
    }
  }

  const avgConsistency = axisGroupCount > 0
    ? consistencyScore / axisGroupCount
    : 0;

  // --- Mirror symmetry (per axis) ---
  // For each axis, check if operated cubes have mirror-partners with same class
  const center = [0, 0, 0];
  for (const cube of operated) {
    center[0] += cube.position[0];
    center[1] += cube.position[1];
    center[2] += cube.position[2];
  }
  center[0] /= operated.length;
  center[1] /= operated.length;
  center[2] /= operated.length;

  let symmetryHits = 0;
  let symmetryChecks = 0;

  // Build a position → cube lookup (quantized to grid)
  const posKey = (p: [number, number, number]) =>
    `${Math.round(p[0] / GRID_STRIDE)},${Math.round(p[1] / GRID_STRIDE)},${Math.round(p[2] / GRID_STRIDE)}`;
  const posMap = new Map<string, PlacedCube>();
  for (const cube of operated) {
    posMap.set(posKey(cube.position), cube);
  }

  for (const axisIdx of [0, 1, 2] as const) {
    for (const cube of operated) {
      const mirrorPos: [number, number, number] = [...cube.position];
      mirrorPos[axisIdx] = 2 * center[axisIdx] - mirrorPos[axisIdx];
      const mirror = posMap.get(posKey(mirrorPos));
      if (mirror && mirror.id !== cube.id) {
        symmetryChecks++;
        if (cubeClass.get(cube.id) === cubeClass.get(mirror.id)) {
          symmetryHits++;
        }
      }
    }
  }

  const symmetryRatio = symmetryChecks > 0
    ? symmetryHits / symmetryChecks
    : 0;

  // Blend: 60% consistency, 40% symmetry
  return 0.6 * avgConsistency + 0.4 * symmetryRatio;
}

// ---------------------------------------------------------------------------
// Sub-score 3: Operator Sequence Compressibility (0.2)
// ---------------------------------------------------------------------------
//
// Plain english:
//   Line up all the operation names from every cube into one long list and
//   look for repeated patterns.  If the sequence "inversion, drift" appears
//   on 4 different cubes, that's a repeating motif we can describe once
//   instead of four times.  More repetition = easier to compress = higher score.
//
// Technical:
//   Concatenate operator classes across all cubes.  Compute n-gram repetition
//   ratio for n=1,2,3.  Repetition ratio = 1 - (unique n-grams / total).
//   Score = average across the three n-gram sizes.

function scoreOperatorSequence(
  cubeIds: string[],
  cubeOperators: Record<string, OperatorRecord[]>,
): number {
  // Build the concatenated sequence of operator classes
  const sequence: string[] = [];
  for (const id of cubeIds) {
    const ops = cubeOperators[id] || [];
    for (const op of ops) {
      sequence.push(op.operator);
    }
  }

  if (sequence.length < 2) return 0;

  // Count n-gram repetitions for n = 1, 2, 3
  let totalRepetition = 0;
  let totalChecks = 0;

  for (const n of [1, 2, 3]) {
    if (sequence.length < n) continue;
    const ngrams = new Map<string, number>();
    const ngramCount = sequence.length - n + 1;

    for (let i = 0; i <= sequence.length - n; i++) {
      const gram = sequence.slice(i, i + n).join('|');
      ngrams.set(gram, (ngrams.get(gram) || 0) + 1);
    }

    // Repetition ratio: (total tokens - unique n-grams) / total tokens
    // If all n-grams are unique → 0.  If all identical → approaches 1.
    const uniqueCount = ngrams.size;
    const repetitionRatio = 1 - uniqueCount / ngramCount;
    totalRepetition += repetitionRatio;
    totalChecks++;
  }

  return totalChecks > 0 ? totalRepetition / totalChecks : 0;
}

// ---------------------------------------------------------------------------
// Sub-score 4: Meme Coherence (0.2)
// ---------------------------------------------------------------------------
//
// Plain english:
//   When the same meme is used on multiple cubes, does Claude produce similar
//   cuts?  Group cubes by their last meme, then check how similar the cut
//   parameters are within each group.  If "doge meme" always results in a
//   sphere of roughly the same size and position, that's coherent and
//   compressible.  If the same meme produces wildly different results each
//   time, it's incoherent and harder to describe.
//
// Technical:
//   Group by last memeDescription.  For groups with 2+ members, compute
//   variance of cutter parameter vectors (proportions, position, magnitude).
//   Coherence per group = exp(-variance).  Score = mean across groups.

function scoreMemeCoherence(
  cubeIds: string[],
  cubeOperators: Record<string, OperatorRecord[]>,
): number {
  // Group cubes by their last meme description
  const memeGroups = new Map<string, OperatorRecord[]>();

  for (const id of cubeIds) {
    const ops = cubeOperators[id] || [];
    if (ops.length === 0) continue;
    const lastOp = ops[ops.length - 1];
    const key = lastOp.memeDescription.trim().toLowerCase();
    if (!memeGroups.has(key)) memeGroups.set(key, []);
    memeGroups.get(key)!.push(lastOp);
  }

  // For groups with 2+ members, measure cutter parameter consistency
  let totalCoherence = 0;
  let groupCount = 0;

  for (const ops of memeGroups.values()) {
    if (ops.length < 2) continue;
    groupCount++;

    // Extract cutter parameter vectors
    const vectors = ops.map(op => [
      ...op.cutter.proportions,
      ...op.cutter.position,
      op.magnitude,
    ]);

    // Compute mean
    const dim = vectors[0].length;
    const mean = new Array(dim).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < dim; i++) mean[i] += v[i];
    }
    for (let i = 0; i < dim; i++) mean[i] /= vectors.length;

    // Compute average squared distance from mean (normalised variance)
    let variance = 0;
    for (const v of vectors) {
      let dist = 0;
      for (let i = 0; i < dim; i++) {
        dist += (v[i] - mean[i]) ** 2;
      }
      variance += dist / dim;
    }
    variance /= vectors.length;

    // Convert to coherence: low variance → high score
    // Use exp(-variance) which maps [0, ∞) → (0, 1]
    totalCoherence += Math.exp(-variance);
  }

  return groupCount > 0 ? totalCoherence / groupCount : 0;
}
