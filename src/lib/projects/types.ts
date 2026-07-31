/**
 * Data model for persisted Projects / Sites / Compositions.
 *
 * Firestore hierarchy:
 *   projects/{projectId}
 *   projects/{projectId}/sites/{siteId}
 *   projects/{projectId}/sites/{siteId}/compositions/{compositionId}
 *
 * A "composition" is the complete serialisable working state across all modes
 * (assembly, Encode, Pataphysical, Evolution, Decode) plus the active site
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
  /**
   * The photo(s) behind this encode. `thumbnailDataUrl` is always present
   * (240px, inline in this document). `storagePath` points at the
   * full-resolution original in Firebase Storage — absent on compositions
   * saved before 2026-07-31, or when no bucket is configured, in which case
   * the thumbnail is all there is and re-encoding needs a re-upload.
   */
  images?: Array<{
    id: string;
    thumbnailDataUrl: string;
    isPrimary: boolean;
    storagePath?: string;
  }>;
  /** Remix v2: true when `encodedCubes` is a complete reinterpreted assembly
   *  that replaces the seed on load (rather than overlaying it). Absent on
   *  older compositions and non-remix encodes. */
  remixResultReplacesSeed?: boolean;
  /** Legacy (pre-2026-07): operator records of a remix's saved-state seed.
   *  Remix now seeds from the builder assembly, whose cuts are the live ones
   *  already persisted as `pataphysical.cubeOperators` — so this is no longer
   *  written. Kept so older compositions still parse. */
  seedOperators?: Record<string, OperatorRecord[]>;
}

/**
 * A saved viewport capture. The image itself lives in Storage (captures are
 * hi-res and would blow the document's ~1MB ceiling); the record keeps a small
 * thumbnail for the list plus the view it was taken from, so two similar shots
 * stay tellable apart.
 */
export interface CaptureRecord {
  id: string;
  storagePath: string;
  thumbnailDataUrl: string;
  createdAt: number;
  projection: 'perspective' | 'orthographic';
  section: { axis: 'x' | 'y' | 'z'; position: number; flipped: boolean } | null;
}

export interface PataphysicalData {
  memeDescription: string;
  locationTag: string;
  engagementLevel: number;
  selectedMemeImageUrl: string | null;
  selectedMemeTitle: string | null;
  /** Absent on pre-2026-07-31 snapshots — restore defaults it. */
  selectedMemeSource?: 'archthesis' | 'external' | null;
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
  /** Viewport captures saved against this composition. Written directly onto
   *  the stored document when a capture is taken (not on the next save), so a
   *  capture is never held in limbo. Absent until the first one. */
  captures?: CaptureRecord[];
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
