/**
 * SpatialLexicon — the vocabulary layer of the spatial encoding prompt.
 *
 * The grammar (spatial-encoding-grammar.md) describes WHAT the model does.
 * The lexicon describes WHAT WORDS it uses — pole labels and category options.
 *
 * This interface is designed to be JSON-serialisable: no functions, no classes.
 * It is the schema that Firestore lexicons will match in L3.
 *
 * Axes are fixed (part of the grammar). Only the vocabulary within each axis
 * is editable here. Two axis types:
 *
 *   Continuous (atmosphere, light, emotion): emit `phrase` + `position` (0–1).
 *     pole_low describes the 0 extreme; pole_high describes the 1 extreme.
 *     The position only places a reading marker between the poles — it is never
 *     shown to the user as a number.
 *
 *   Categorical (rhythm, placement): emit `phrase` + `option` (one option id).
 *     Options are open-ended; unknown ids from the model are never rejected.
 */

// --- Continuous axis types --------------------------------------------------

export interface ContinuousAxis {
  pole_low: string;
  pole_high: string;
}

/**
 * Atmosphere has three explicitly named zones (low / mid / high) that map
 * directly onto the three variation-index bands. This is different from the
 * two-pole axes (light, emotion) because the three qualities genuinely
 * correspond to the real low/mid/high band structure of the 70 variations.
 * Position is still 0–1 (dense=0, chaotic=1), so airy lands around 0.5.
 */
export interface AtmosphereAxis {
  pole_low: string;
  pole_mid: string;
  pole_high: string;
}

export interface EmotionAxis extends ContinuousAxis {
  /**
   * Override descriptor. When the space reads as melancholic or abandoned the
   * model produces a partial assembly regardless of the calm–energetic position.
   * This removes the old three-zone misfire where genuinely mid-energy spaces
   * would misfire into partial assemblies simply because melancholic sat at 0.5.
   */
  melancholic: string;
}

export interface LightAxis extends ContinuousAxis {
  /**
   * The four qualitative trigger labels used in the variation-mixing grammar
   * rules. These describe spatial conditions, not axis positions — they are
   * separate from the poles that summarise the reading axis.
   */
  triggers: {
    uniform: string;
    varied: string;
    rich: string;
    austere: string;
  };
}

// --- Categorical axis types -------------------------------------------------

export interface RhythmOption {
  id: string;
  trigger: string;
  label: string;
  grid_hint?: string;
}

export interface PlacementOption {
  id: string;
  trigger: string;
  label: string;
}

// --- Top-level lexicon interface -------------------------------------------

export interface SpatialLexicon {
  atmosphere: AtmosphereAxis;
  light: LightAxis;
  emotion: EmotionAxis;
  rhythm: { options: RhythmOption[] };
  placement: { options: PlacementOption[] };
}

// --- Default lexicon (seeded verbatim from spatial-encoding.md) ------------

export const DEFAULT_LEXICON: SpatialLexicon = {
  atmosphere: {
    pole_low: 'Dense, heavy, compressed spaces',
    pole_mid: 'Open, airy, expansive spaces',
    pole_high: 'Chaotic, fragmented, layered spaces',
  },

  light: {
    // Poles summarise the reading axis for output format instructions.
    // Change #3: pole_high uses "diverse" (grounded in "high variation
    // diversity"), not "complex".
    pole_low: 'Uniform lighting; minimal or austere materiality',
    pole_high: 'Varied lighting; rich and diverse materiality',
    // The four trigger labels drive the variation-mixing grammar rules.
    triggers: {
      uniform: 'Uniform lighting',
      varied: 'Varied lighting conditions',
      rich: 'Rich materiality',
      austere: 'Minimal/austere spaces',
    },
  },

  emotion: {
    // Change #1: two poles only (calm ↔ energetic). Melancholic is a grammar
    // override, not a midpoint — it fires regardless of position value.
    pole_low: 'Calm, serene spaces',
    pole_high: 'Energetic, busy spaces',
    melancholic: 'Melancholic or abandoned spaces',
  },

  rhythm: {
    options: [
      {
        id: 'linear',
        trigger: 'A tight corridor',
        label: 'linear arrangement',
        grid_hint: '1×1×N',
      },
      {
        id: 'planar',
        trigger: 'An open room',
        label: 'planar arrangement',
        grid_hint: 'N×M×1',
      },
      {
        id: 'vertical',
        trigger: 'A multi-story space',
        label: 'vertical stack',
        grid_hint: '1×1×N tall',
      },
      {
        id: 'clustered',
        trigger: 'A complex intersection',
        label: 'clustered arrangement',
      },
    ],
  },

  placement: {
    // Change #2: machine ids are symmetrical / asymmetric / radial / chained.
    // Triggers and labels are verbatim from spatial-encoding.md.
    options: [
      {
        id: 'symmetrical',
        trigger: 'Symmetrical spaces',
        label: 'symmetrical arrangements',
      },
      {
        id: 'asymmetric',
        trigger: 'Irregular, organic spaces',
        label: 'asymmetric, scattered arrangements',
      },
      {
        id: 'radial',
        trigger: 'Hierarchical spaces (e.g., a central feature)',
        label: 'one cube at center, others radiating',
      },
      {
        id: 'chained',
        trigger: 'Transitional spaces (corridors, doorways)',
        label: 'linear chains',
      },
    ],
  },
};
