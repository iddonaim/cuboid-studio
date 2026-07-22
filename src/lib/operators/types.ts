// ---------------------------------------------------------------------------
// v1 types — used by Evolution mode, Builder, and v1 Pataphysical mode.
// DO NOT modify these; add new types below instead.
// ---------------------------------------------------------------------------

export type OperatorClass = 'inversion' | 'amplification' | 'drift' | 'reassignment' | 'preservation' | 'shuffle';
export type CutterType = 'box' | 'sphere' | 'cylinder' | 'plane' | 'taper';
export type EdgeType = 'adjacency' | 'access' | 'visibility' | 'conflict' | 'overlap' | 'threshold';

export interface LLMCutterResult {
  type: CutterType;
  proportions: [number, number, number];
  position: [number, number, number];   // normalized -1 to 1
  rotation: [number, number, number];   // degrees
}

export interface LLMOperatorResult {
  operator: OperatorClassV2;
  /**
   * Semantic provenance, not a geometric input: records which edge
   * relationships (adjacency, access, …) the translation *claims* to act on.
   * Never read by geometry — applyLLMOperator consumes only `cutter`.
   * Consumed by the UI panels, the assembly export, and persistence.
   */
  targets: EdgeType[];
  /** 0.0-1.0. Not read by geometry (only `cutter` shapes the cut), but it IS
   *  part of the compressibility engine's cut fingerprint, so it affects
   *  Evolution scoring. Also shown in UI and included in exports. */
  magnitude: number;
  /** 0.0-1.0. Semantic provenance only — read by nothing behavioral (neither
   *  geometry nor scoring); shown in UI and included in exports. */
  decay: number;
  cutter: LLMCutterResult;
  reasoning: string;
}

export interface OperatorRecord {
  id: string;
  source: 'meme';
  operator: OperatorClassV2;
  /** Semantic provenance, not a geometric input — see LLMOperatorResult.targets. */
  targets: EdgeType[];
  /** Not read by geometry; feeds the compressibility fingerprint — see LLMOperatorResult.magnitude. */
  magnitude: number;
  /** Semantic provenance only — see LLMOperatorResult.decay. */
  decay: number;
  createdAt: string;
  memeDescription: string;
  reasoning: string;
  cutter: LLMCutterResult;

  // Optional provenance (added 2026-07) — all backwards-compatible additions.
  // Older records simply lack them; never write `undefined` values into a
  // record (Firestore rejects undefined fields), use conditional spreads.
  /** Which surface applied the change. Absent on pre-2026-07 records. */
  origin?: 'pataphysical' | 'evolution';
  /** Display title of the source meme (topText / description excerpt). */
  memeTitle?: string;
  /** Image URL of the source meme, for showing it alongside the change. */
  memeImageUrl?: string;
  /** Full two-pass reasoning, when the change came from a v2 translation. */
  pass1?: TranslationPass1;
  pass2?: TranslationPass2;
  confidenceVector?: ConfidenceVector;
  model?: string;
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
  /** Semantic provenance, not a geometric input — see LLMOperatorResult.targets. */
  targets: EdgeType[];
  target_reasoning: string;
  /** Not read by geometry; feeds the compressibility fingerprint — see LLMOperatorResult.magnitude. */
  magnitude: number;
  /** Semantic provenance only — see LLMOperatorResult.decay. */
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
