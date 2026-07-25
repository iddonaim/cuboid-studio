/**
 * Data model for persisted Projects / Sites / Compositions.
 *
 * Firestore hierarchy:
 *   projects/{projectId}
 *   projects/{projectId}/sites/{siteId}
 *   projects/{projectId}/sites/{siteId}/compositions/{compositionId}
 *
 * A "composition" is the complete serialisable working state across all modes
 * (Builder, Encode, Pataphysical, Evolution, Decode) plus the active site
 * context at save time. Live THREE.BufferGeometry objects are NOT stored —
 * they're reproducible by re-applying the saved operator records on load.
 */
import type { PlacedCube } from '../cube/types';
import type { EncodedCube, SpatialReading } from '../api/encodeSpace';
import type { SpatialLexicon } from '../../prompts/lexicon.default';
import type {
  OperatorRecord,
  TranslationPass1,
  TranslationPass2,
  ConfidenceVector,
} from '../operators/types';
import type { CanvasTile } from '../../store/useDecodeStore';
import type { SiteContextData } from '../storage/siteContext';
import type {
  EvolutionCandidate,
  EvolutionConfig,
  EvolutionSubMode,
} from '../../store/useEvolutionStore';
import type { CompressibilitySnapshot, CompressibilityScore } from '../evolution/compressibility';
import type { PassMode } from '../../store/useMemeStore';

// --- Per-mode serialised slices -------------------------------------------

export interface BuilderAssemblyData {
  placedCubes: PlacedCube[];
  selectedIdx: number;
  rulesEnabled: boolean;
  strictRulesEnabled: boolean;
}

export interface EncodeData {
  /** Snapped cube result from the last encode (no raw images — by design). */
  encodedCubes: EncodedCube[] | null;
  encodingReasoning: string | null;
  mode: 'standalone' | 'merge' | 'remix';
  seedCubes: PlacedCube[];
  /** Five-axis qualitative reading produced by the model. Optional — absent in
   *  compositions saved before L1 and when the model omits the reading. */
  reading?: SpatialReading;
  /** Model-produced reading preserved for provenance; never mutated by edits.
   *  Absent when no reading was produced, or in pre-L1 compositions. */
  readingOriginal?: SpatialReading;
  /** True when the architect revised the reading from the model original. */
  readingEdited?: boolean;
  /** Snapshot of the lexicon active at encode time (by value; self-describing). */
  lexiconSnapshot?: SpatialLexicon;
  /** Reference to the saved lexicon document used for this encode, if any.
   *  Absent when the encode used DEFAULT_LEXICON (no saved lexicon was active). */
  lexiconId?: string;
  /** Model id the server reported for this encode. Absent on compositions
   *  saved before provenance capture existed. */
  model?: string;
  /** "# version" header of the grammar template that produced this encode.
   *  Absent on older compositions and pre-versioned grammar files. */
  promptVersion?: string;
  /** Small (~240px) JPEG thumbnails of the photo(s) that informed this encode.
   *  Kept deliberately tiny (not the full-resolution upload) so a composition
   *  document stays well under Firestore's size limit. Display-only on
   *  restore — re-encoding requires re-uploading the real photo(s). */
  images?: Array<{ id: string; thumbnailDataUrl: string; isPrimary: boolean }>;
  /** Remix v2: true when `encodedCubes` is a complete reinterpreted assembly
   *  that replaces the seed on load (rather than overlaying it). Absent on
   *  older compositions and non-remix encodes. */
  remixResultReplacesSeed?: boolean;
  /** Remix: operator records of the selected saved seed, keyed by cube id —
   *  what keep/transplant inheritance re-applies on load. Absent when the
   *  seed carried no operators. */
  seedOperators?: Record<string, OperatorRecord[]>;
}

export interface PataphysicalData {
  memeDescription: string;
  locationTag: string;
  engagementLevel: number;
  selectedMemeImageUrl: string | null;
  selectedMemeTitle: string | null;
  baseVariationId: string;
  targetCubeId: string | null;
  passMode: PassMode;
  /** Standalone working-cube operator stack. */
  operators: OperatorRecord[];
  /** Per-placed-cube operator stacks (assembly mode). */
  cubeOperators: Record<string, OperatorRecord[]>;
  lastPass1: TranslationPass1 | null;
  lastPass2: TranslationPass2 | null;
  lastConfidenceVector: ConfidenceVector | null;
  lastModel: string | null;
}

export interface EvolutionData {
  subMode: EvolutionSubMode;
  generation: number;
  candidates: EvolutionCandidate[];
  compressibilityLog: CompressibilitySnapshot[];
  config: EvolutionConfig;
  baselineScore: CompressibilityScore | null;
  lastAppliedCubeId: string | null;
}

export interface DecodeData {
  canvasTiles: CanvasTile[];
  freestyle: boolean;
  /** Plan-underlay reference + registration. Same policy as encode photos:
   *  a ~240px thumbnail and a fingerprint of the imported file, never
   *  full-res base64 (Firestore doc-size limit). Absent on compositions
   *  saved before underlays existed and when none was imported. */
  underlay?: {
    thumbnailDataUrl: string;
    imageHash: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    rotation: number;
    scale: number;
  };
}

/** The full composition payload stored under a composition document. */
export interface CompositionData {
  builderAssembly: BuilderAssemblyData;
  encode: EncodeData | null;
  pataphysical: PataphysicalData;
  evolution: EvolutionData;
  decode: DecodeData;
  siteContextSnapshot: SiteContextData | null;
}

// --- Firestore document shapes --------------------------------------------

export interface ProjectDoc {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface SiteDoc {
  id: string;
  name: string;
  createdAt: number;
  siteContext: SiteContextData | null;
}

export interface CompositionDoc {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: CompositionData;
}
