// ---------------------------------------------------------------------------
// v1 types — used by Evolution mode, Builder, and v1 Pataphysical mode.
// DO NOT modify these; add new types below instead.
// ---------------------------------------------------------------------------

export type OperatorClass = 'inversion' | 'amplification' | 'drift' | 'reassignment' | 'preservation' | 'shuffle';
export type CutterType = 'box' | 'sphere' | 'cylinder' | 'plane';
export type EdgeType = 'adjacency' | 'access' | 'visibility' | 'conflict' | 'overlap' | 'threshold';

export interface LLMCutterResult {
  type: CutterType;
  proportions: [number, number, number];
  position: [number, number, number];   // normalized -1 to 1
  rotation: [number, number, number];   // degrees
}

export interface LLMOperatorResult {
  operator: OperatorClass;
  targets: EdgeType[];
  magnitude: number;        // 0.0-1.0
  decay: number;            // 0.0-1.0
  cutter: LLMCutterResult;
  reasoning: string;
}

export interface OperatorRecord {
  id: string;
  source: 'meme';
  operator: OperatorClass;
  targets: EdgeType[];
  magnitude: number;
  decay: number;
  createdAt: string;
  memeDescription: string;
  reasoning: string;
  cutter: LLMCutterResult;
}

// ---------------------------------------------------------------------------
// v2 types — two-pass translation with expanded operator set
// ---------------------------------------------------------------------------

/** v2 adds consolidation, erosion, reinforcement to the original 6 */
export type OperatorClassV2 =
  | OperatorClass
  | 'consolidation'
  | 'erosion'
  | 'reinforcement';

/**
 * Confidence vector — a 4-axis fingerprint of how the translation operated.
 *
 * Each axis is scored 0.0–1.0. Low scores are not failure — they are data
 * about the limits of the translation operation.
 *
 * - rhetorical_clarity:     How legibly the meme's rhetorical moves map to operator classes.
 * - site_resonance:         How strongly the meme's cultural content connects to the specific site.
 * - affective_coherence:    How consistently the functional affects point toward a unified cutter logic.
 * - operational_specificity: How deterministically all inputs resolve into a single geometric output.
 */
export interface ConfidenceVector {
  rhetorical_clarity: number;
  site_resonance: number;
  affective_coherence: number;
  operational_specificity: number;
}

/** Pass 1 output: cultural operator extraction */
export interface TranslationPass1 {
  pass: 1;
  rhetorical_moves: string[];
  cultural_tensions: Array<{
    description: string;
    friction_type: 'internal' | 'external' | 'both';
  }>;
  functional_affects: string[];
  site_resonance: string;
  meme_summary: string;
}

/** Pass 2 output: geometric translation (v2 extended shape) */
export interface TranslationPass2 {
  pass: 2;
  operator: OperatorClassV2;
  targets: EdgeType[];
  target_reasoning: string;
  magnitude: number;
  decay: number;
  cutter: LLMCutterResult & {
    geometry_reasoning: string;
  };
  confidence_vector: ConfidenceVector;
  confidence_note: string;
  reasoning: string;
}

/** Full two-pass translation response */
export interface TwoPassTranslationResult {
  pass1: TranslationPass1;
  pass2: TranslationPass2;
  model: string;
}
