/**
 * TranslationLexicon — the editable vocabulary layer of the Pataphysical /
 * Evolution translation prompt (the "Level A" mirror of the Encode lexicon).
 *
 * The prompt skeleton (src/prompts/pataphysical-translation-v2.md) describes the
 * fixed two-pass procedure and output shape. This lexicon describes the *words
 * and reasoning* the model uses inside that procedure:
 *
 *   - how each rhetorical move is defined (Pass 1)
 *   - which operator class each move maps to, and the gloss for that mapping
 *   - what each edge type (target) means
 *   - how affects imply cutter geometry
 *   - how virality maps to decay
 *   - what each confidence-vector axis measures
 *
 * What is NOT editable here (Level A): the *set* of valid operator ids, edge
 * type ids, cutter types, and confidence-vector keys. Those are validated by the
 * API (`VALID_OPERATORS_V2`, `VALID_EDGE_TYPES`) and consumed downstream, so the
 * model must still emit only those tokens. Editing the lexicon changes how the
 * model *reasons* toward them, not which tokens exist.
 *
 * This interface is JSON-serialisable (no functions, no classes) — it is the
 * schema that Firestore translation-lexicons match, mirroring SpatialLexicon.
 *
 * `composeTranslationPrompt()` fills the `{{slots}}` in the skeleton from a
 * lexicon. With DEFAULT_TRANSLATION_LEXICON it reproduces the original prompt
 * text byte-for-byte (verified against the pre-slot version of the .md).
 */
import type { OperatorClassV2, EdgeType, ConfidenceVector } from '../lib/operators/types';

// --- Fixed token sets (Level A: editable words, fixed vocabulary) -----------

/**
 * The nine operator classes. Fixed in Level A — the editor offers these as a
 * closed choice so a custom lexicon can never map a move to an operator the API
 * validator (`VALID_OPERATORS_V2`) would reject. Mirrors `OperatorClassV2`.
 */
export const OPERATOR_IDS: OperatorClassV2[] = [
  'inversion', 'amplification', 'drift', 'reassignment', 'preservation',
  'shuffle', 'consolidation', 'erosion', 'reinforcement',
];

/** The six edge types (operator targets). Fixed in Level A. Mirrors `EdgeType`. */
export const EDGE_TYPE_IDS: EdgeType[] = [
  'adjacency', 'access', 'visibility', 'conflict', 'overlap', 'threshold',
];

// --- Entry types ------------------------------------------------------------

/**
 * One rhetorical move. `label` is the human/display form used verbatim in both
 * the Pass 1 definition list and the Pass 2 mapping list (e.g. "Irony",
 * "Rage / frustration"). `operator` is the fixed operator class this move maps
 * to. `mapping_note` is the literal text that follows the bold operator name in
 * the mapping line — including its leading space — so both parenthetical
 * ("(flip relationship weights)") and inline (" with high magnitude (≥ 0.7)")
 * forms reproduce exactly.
 */
export interface RhetoricalMoveEntry {
  label: string;
  definition: string;
  operator: OperatorClassV2;
  mapping_note: string;
}

/** One edge type (operator target). `id` is a fixed, validated token. */
export interface EdgeTypeEntry {
  id: EdgeType;
  definition: string;
}

/** One affect→cutter-geometry rule. */
export interface AffectGeometryEntry {
  /** The geometric tendency, e.g. "compression or constriction". */
  trigger: string;
  /** Example affects, e.g. "anxiety, claustrophobia, scarcity". */
  examples: string;
  /** The cutter implication, e.g. "cutters that remove from the interior, create internal voids". */
  implication: string;
}

/** Decay guidance — each field is the full bullet line text. */
export interface DecayRules {
  viral: string;
  niche: string;
  default: string;
}

/** One confidence-vector axis. `key` is fixed (matches ConfidenceVector). */
export interface ConfidenceAxisEntry {
  key: keyof ConfidenceVector;
  label: string;
  abbr: string;
  description: string;
}

// --- Top-level lexicon ------------------------------------------------------

export interface TranslationLexicon {
  rhetorical_moves: RhetoricalMoveEntry[];
  edge_types: EdgeTypeEntry[];
  affect_geometry: AffectGeometryEntry[];
  decay: DecayRules;
  confidence_axes: ConfidenceAxisEntry[];
}

// --- Default lexicon (seeded verbatim from pataphysical-translation-v2.md) ---

export const DEFAULT_TRANSLATION_LEXICON: TranslationLexicon = {
  rhetorical_moves: [
    { label: 'Irony', definition: 'saying the opposite of what is meant', operator: 'inversion', mapping_note: ' (flip relationship weights)' },
    { label: 'Exaggeration', definition: 'amplifying a quality beyond reality', operator: 'amplification', mapping_note: ' (increase target weights)' },
    { label: 'Juxtaposition', definition: 'placing incompatible things together', operator: 'reassignment', mapping_note: ' (swap edge targets between unlike elements)' },
    { label: 'Absurdity', definition: 'logic that defeats itself', operator: 'shuffle', mapping_note: ' (randomize a subset of topology)' },
    { label: 'Nostalgia', definition: 'longing for a past or idealized state', operator: 'preservation', mapping_note: ' (lock current weights, resist mutation)' },
    { label: 'Rage / frustration', definition: 'direct expression of anger or discontent', operator: 'amplification', mapping_note: ' with high magnitude (≥ 0.7)' },
    { label: 'Satire', definition: 'critiquing through imitation', operator: 'drift', mapping_note: ' (gradual displacement from current state)' },
    { label: 'Solidarity', definition: 'expressing shared identity or condition', operator: 'consolidation', mapping_note: ' (strengthen existing clusters, increase adjacency)' },
    { label: 'Mourning', definition: 'marking a loss or disappearance', operator: 'erosion', mapping_note: ' (reduce weight toward zero without removing)' },
    { label: 'Celebration', definition: 'affirming something valued', operator: 'reinforcement', mapping_note: ' (increase weight of existing strong connections)' },
  ],

  edge_types: [
    { id: 'adjacency', definition: 'what is next to what' },
    { id: 'access', definition: 'how things are reached' },
    { id: 'visibility', definition: 'what is seen from where' },
    { id: 'conflict', definition: 'where uses or populations clash' },
    { id: 'overlap', definition: 'where programs or territories share space' },
    { id: 'threshold', definition: 'where transitions between conditions occur' },
  ],

  affect_geometry: [
    { trigger: 'compression or constriction', examples: 'anxiety, claustrophobia, scarcity', implication: 'cutters that remove from the interior, create internal voids' },
    { trigger: 'expansion or release', examples: 'defiance, celebration, liberation', implication: 'cutters that open surfaces, create porosity' },
    { trigger: 'division or separation', examples: 'alienation, displacement, conflict', implication: 'cutters that bisect or carve a hard boundary through the volume — prefer box, taper, or cylinder shapes proportioned as a deep wedge or partition, substantial enough to register visually. Never a thin flat slab: the boundary must read as carved mass, not a slice' },
    { trigger: 'accumulation or layering', examples: 'nostalgia, solidarity, densification', implication: 'cutters that add mass or create nested volumes' },
    { trigger: 'erosion or entropy', examples: 'resignation, mourning, neglect', implication: 'cutters that subtract from edges and corners, soften geometry' },
    { trigger: 'instability or disruption', examples: 'rage, absurdity, dark humor', implication: 'cutters at oblique angles, off-axis positions, asymmetric proportions' },
  ],

  decay: {
    viral: 'Memes described as viral or widely shared → low decay (0.01–0.1)',
    niche: 'Memes described as niche or fleeting → high decay (0.5–0.9)',
    default: 'If no temporal information is given → default decay 0.2',
  },

  confidence_axes: [
    { key: 'rhetorical_clarity', label: 'Rhetorical clarity', abbr: 'rc', description: "How legibly the meme's rhetorical moves map to operator classes. High = the meme's strategy is unambiguous. Low = the rhetorical mode is mixed, unclear, or novel." },
    { key: 'site_resonance', label: 'Site resonance', abbr: 'sr', description: 'How strongly the meme\'s cultural content connects to the specific site conditions. High = the meme speaks directly to something present at this site. Low = the connection is imposed or abstract.' },
    { key: 'affective_coherence', label: 'Affective coherence', abbr: 'ac', description: 'How consistently the functional affects point toward a unified cutter logic. High = the affects converge on a clear geometric implication. Low = the affects pull in different directions, producing a compromised or hybrid geometry.' },
    { key: 'operational_specificity', label: 'Operational specificity', abbr: 'os', description: 'How deterministically all inputs resolve into a single geometric output. High = the translation produces one clear answer. Low = multiple valid translations exist and the choice between them is arbitrary.' },
  ],
};

// --- Per-section editor hint text (consequence-framed, for architects) ------

export const DEFAULT_TRANSLATION_DESCRIPTIONS: Record<string, string> = {
  rhetorical_moves:
    "Each move has a Pass 1 definition (how the engine recognises it in a meme) and a Pass 2 operator it maps to (with a gloss). Editing the mapping is the most direct lever on behaviour — it decides which spatial operation a cultural strategy becomes. The operator must stay one of the nine fixed classes; you are choosing among them, not inventing new ones.",
  edge_types:
    'These are the spatial relationships an operator can target. Editing a definition changes how the engine reasons about where a meme’s tension should act at a site. The six ids are fixed; only their meanings are editable.',
  affect_geometry:
    "These rules turn the meme's emotional charge into cutter geometry — the actual shape change. The trigger names a geometric tendency, the examples are affects that imply it, and the implication describes the cut. This is where you tune how feeling becomes form.",
  decay:
    'Decay sets how quickly a meme’s mutation fades over generations. These lines tell the engine how to read virality and lifespan into a decay value.',
  confidence_axes:
    "The four axes the engine scores itself on for every translation. Editing a description changes what the engine reports about where a translation is motivated versus improvising. The four axes themselves are fixed.",
};

// --- Validation -------------------------------------------------------------

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string';
}

/**
 * Structural guard for a client-supplied lexicon. The lexicon arrives over the
 * wire (untrusted), and `composeTranslationPrompt` maps over its arrays, so a
 * malformed value must be rejected and replaced with the default rather than
 * producing a broken prompt or throwing. Lenient on extra fields, strict on the
 * shapes the composer reads.
 */
export function isTranslationLexicon(x: unknown): x is TranslationLexicon {
  if (!x || typeof x !== 'object') return false;
  const l = x as Record<string, unknown>;

  const moves = l.rhetorical_moves;
  if (!Array.isArray(moves) || moves.length === 0) return false;
  for (const m of moves) {
    if (!m || typeof m !== 'object') return false;
    const e = m as Record<string, unknown>;
    if (!isNonEmptyString(e.label) || !isNonEmptyString(e.definition)
      || !isNonEmptyString(e.operator) || typeof e.mapping_note !== 'string') return false;
  }

  const edges = l.edge_types;
  if (!Array.isArray(edges) || edges.length === 0) return false;
  for (const ed of edges) {
    if (!ed || typeof ed !== 'object') return false;
    const e = ed as Record<string, unknown>;
    if (!isNonEmptyString(e.id) || !isNonEmptyString(e.definition)) return false;
  }

  const affects = l.affect_geometry;
  if (!Array.isArray(affects) || affects.length === 0) return false;
  for (const a of affects) {
    if (!a || typeof a !== 'object') return false;
    const e = a as Record<string, unknown>;
    if (!isNonEmptyString(e.trigger) || !isNonEmptyString(e.examples) || !isNonEmptyString(e.implication)) return false;
  }

  const decay = l.decay;
  if (!decay || typeof decay !== 'object') return false;
  const d = decay as Record<string, unknown>;
  if (!isNonEmptyString(d.viral) || !isNonEmptyString(d.niche) || !isNonEmptyString(d.default)) return false;

  const axes = l.confidence_axes;
  if (!Array.isArray(axes) || axes.length === 0) return false;
  for (const ax of axes) {
    if (!ax || typeof ax !== 'object') return false;
    const e = ax as Record<string, unknown>;
    if (!isNonEmptyString(e.label) || !isNonEmptyString(e.abbr) || !isNonEmptyString(e.description)) return false;
  }

  return true;
}

// --- Prompt composition -----------------------------------------------------

function renderMoveDefinitions(lex: TranslationLexicon): string {
  return lex.rhetorical_moves.map(m => `- **${m.label}**: ${m.definition}`).join('\n');
}

function renderMoveMapping(lex: TranslationLexicon): string {
  return lex.rhetorical_moves.map(m => `- ${m.label} → **${m.operator}**${m.mapping_note}`).join('\n');
}

function renderEdgeTypes(lex: TranslationLexicon): string {
  return lex.edge_types.map(e => `- **${e.id}**: ${e.definition}`).join('\n');
}

function renderAffectGeometry(lex: TranslationLexicon): string {
  return lex.affect_geometry.map(a => `- Affects that imply **${a.trigger}** (${a.examples}) → ${a.implication}`).join('\n');
}

function renderDecay(lex: TranslationLexicon): string {
  return [`- ${lex.decay.viral}`, `- ${lex.decay.niche}`, `- ${lex.decay.default}`].join('\n');
}

function renderConfidenceAxes(lex: TranslationLexicon): string {
  return lex.confidence_axes.map(c => `- **${c.label}** (${c.abbr}): ${c.description}`).join('\n');
}

/**
 * Fills the `{{slots}}` in the prompt skeleton from a lexicon. The site context
 * placeholder (`{site_context}`, single-brace) is handled separately by the API
 * and is intentionally left untouched here.
 */
export function composeTranslationPrompt(template: string, lex: TranslationLexicon): string {
  return template
    .replace(/\{\{rhetorical_moves_definitions\}\}/g, renderMoveDefinitions(lex))
    .replace(/\{\{move_operator_mapping\}\}/g, renderMoveMapping(lex))
    .replace(/\{\{edge_types\}\}/g, renderEdgeTypes(lex))
    .replace(/\{\{affect_geometry\}\}/g, renderAffectGeometry(lex))
    .replace(/\{\{decay_rules\}\}/g, renderDecay(lex))
    .replace(/\{\{confidence_axes\}\}/g, renderConfidenceAxes(lex));
}
