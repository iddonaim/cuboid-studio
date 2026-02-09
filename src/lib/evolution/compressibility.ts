/**
 * Compressibility Engine — Evolution Mode
 * ========================================
 *
 * Implements Schmidhuber's compression progress drive as a fitness function
 * for interactive evolutionary computation on cuboid assemblies.
 *
 * Four sub-scores, each capturing a different kind of regularity:
 *
 *   1. Geometric Clustering  (weight 0.3) — feature-vector similarity of operator histories
 *   2. Spatial Regularity    (weight 0.3) — axis symmetry, row/column consistency
 *   3. Operator Sequence     (weight 0.2) — n-gram repetition across cubes
 *   4. Meme Coherence        (weight 0.2) — within-group variance of cutter params by meme
 *
 * All scores are normalised to [0, 1].  Higher = more compressible.
 *
 * Compression progress (interestingness) = score_after − score_before.
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
// Represent each cube's operator history as a feature vector.
// Per operator: cutterType (one-hot 4D) + proportions (3D) + position (3D) +
//               rotation (3D) = 13D.
// Use average across all operators for the cube → fixed-length feature.
// Cluster by pairwise cosine similarity. More similar cubes = higher score.

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
// Check for axis-aligned patterns: how many cubes share the same operator
// class along rows/columns in the grid. Also checks for mirror symmetry.

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
// Concatenate the operator class sequence across all cubes.
// Measure n-gram repetition ratio — more repetition = higher score.

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
// Group cubes by their last applied meme. Measure within-group variance
// on cutter parameters. Low variance = consistent translation = compressible.

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
