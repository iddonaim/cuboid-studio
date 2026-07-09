/**
 * TranslationRecordView — the one shared shape every "two-pass text mass"
 * surface renders from. Applied operator records (Pataphysical, cube change
 * history) and proposed Evolve candidates all normalize into this, so the
 * record reads the same everywhere: compact summary card + full-reading
 * drawer.
 */
import type * as THREE from 'three';
import type {
  ConfidenceVector,
  OperatorRecord,
  TranslationPass1,
  TranslationPass2,
} from './types';
import type { EvolutionCandidate } from '../../store/useEvolutionStore';

export interface TranslationRecordView {
  key: string;
  /** One-line headline: pass-1 summary, else meme title, else description. */
  title: string;
  /** Applied change vs. a not-yet-applied Evolve candidate. */
  status: 'applied' | 'proposed';
  origin: 'pataphysical' | 'evolution' | null;
  createdAt: string | null;

  memeTitle: string | null;
  memeDescription: string | null;
  memeImageUrl: string | null;

  operator: string;
  magnitude: number;
  targets: string[];
  cutterType: string;
  reasoning: string | null;
  pass1: TranslationPass1 | null;
  pass2: TranslationPass2 | null;
  confidenceVector: ConfidenceVector | null;
  model: string | null;

  // In-memory only — refs for the on-demand thumbnail; never serialized.
  /** Geometry to snapshot directly (an applied record's cut result). */
  snapshotGeometry?: THREE.BufferGeometry | null;
  /** Cube whose *current* geometry to snapshot (proposed candidates). */
  snapshotCubeId?: string | null;
  /** Cutter geometry ghosted over the snapshot. */
  snapshotCutter?: THREE.BufferGeometry | null;
}

type SnapshotRefs = Pick<
  TranslationRecordView,
  'snapshotGeometry' | 'snapshotCubeId' | 'snapshotCutter'
>;

function headline(
  pass1: TranslationPass1 | null | undefined,
  memeTitle: string | null | undefined,
  memeDescription: string | null | undefined,
  fallback: string,
): string {
  return (
    pass1?.meme_summary ||
    memeTitle ||
    memeDescription?.split('\n')[0] ||
    fallback
  );
}

export function viewFromOperatorRecord(
  record: OperatorRecord,
  snapshot: SnapshotRefs = {},
): TranslationRecordView {
  return {
    key: record.id,
    title: headline(record.pass1, record.memeTitle, record.memeDescription, 'Applied change'),
    status: 'applied',
    origin: record.origin ?? null,
    createdAt: record.createdAt ?? null,
    memeTitle: record.memeTitle ?? null,
    memeDescription: record.memeDescription ?? null,
    memeImageUrl: record.memeImageUrl ?? null,
    operator: record.operator,
    magnitude: record.magnitude,
    targets: record.targets,
    cutterType: record.cutter.type,
    reasoning: record.reasoning ?? null,
    pass1: record.pass1 ?? null,
    pass2: record.pass2 ?? null,
    confidenceVector: record.confidenceVector ?? record.pass2?.confidence_vector ?? null,
    model: record.model ?? null,
    ...snapshot,
  };
}

export function viewFromCandidate(
  candidate: EvolutionCandidate,
  snapshot: SnapshotRefs = {},
): TranslationRecordView {
  return {
    key: candidate.id,
    title: headline(candidate.pass1, candidate.memeTitle, candidate.memeDescription, 'Proposed change'),
    status: 'proposed',
    origin: 'evolution',
    createdAt: null,
    memeTitle: candidate.memeTitle ?? null,
    memeDescription: candidate.memeDescription ?? null,
    memeImageUrl: candidate.memeImageUrl,
    operator: candidate.cutterConfig.operator,
    magnitude: candidate.cutterConfig.magnitude,
    targets: candidate.cutterConfig.targets,
    cutterType: candidate.cutterConfig.cutter.type,
    reasoning: candidate.cutterConfig.reasoning ?? null,
    pass1: candidate.pass1 ?? null,
    pass2: candidate.pass2 ?? null,
    confidenceVector: candidate.pass2?.confidence_vector ?? null,
    model: null,
    ...snapshot,
  };
}
