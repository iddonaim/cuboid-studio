/**
 * Shared rendering of a two-pass translation record.
 *
 * - `TranslationRecordSummary` — the compact card: thumbnail, one-line
 *   headline, operator/cutter chips, confidence mini-bars, "Full reading".
 * - `RecordViewerDrawer` — the wide right-edge drawer where the complete
 *   Pass 1 → Pass 2 prose gets readable type. Mounted once at the app root;
 *   any surface opens it via `useRecordViewerStore`.
 *
 * Every surface that shows two-pass output (Pataphysical result, cube change
 * history, Evolve candidates) renders through these, so the record is one
 * learnable object rather than three ad-hoc layouts.
 */
import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useAppStore } from '../../store/useAppStore';
import { useMemeStore } from '../../store/useMemeStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useRecordViewerStore } from '../../store/useRecordViewerStore';
import type { TranslationRecordView } from '../../lib/operators/recordView';
import type { ConfidenceVector } from '../../lib/operators/types';
import { renderRecordSnapshot } from '../../lib/three/recordSnapshot';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { getVariationGeometryAsync } from '../../lib/cube/csgUtils';

// ---------------------------------------------------------------------------
// Small shared atoms
// ---------------------------------------------------------------------------

export const Chip: React.FC<{ children: React.ReactNode; variant?: 'rhetoric' | 'affect' }> = ({
  children,
  variant = 'rhetoric',
}) => (
  <span
    className={`inline-block px-1.5 py-0.5 mr-1 mb-1 rounded text-[11px] border ${
      variant === 'affect'
        ? 'bg-violet-50 text-violet-700 border-violet-200'
        : 'bg-ink-100 text-ink-700 border-ink-200'
    }`}
  >
    {children}
  </span>
);

const FrictionLabel: React.FC<{ type: string }> = ({ type }) => (
  <span className="inline-block ml-1 px-1 py-px rounded bg-ink-100 text-ink-500 text-[9px] uppercase tracking-wide border border-ink-200 align-middle">
    {type}
  </span>
);

const FactChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block px-1.5 py-px rounded bg-ink-200 text-ink-700 text-[10px]">
    {children}
  </span>
);

const originLabel = (origin: TranslationRecordView['origin']): string | null =>
  origin === 'evolution' ? 'Evolve' : origin === 'pataphysical' ? 'Pataphysical' : null;

const CONFIDENCE_AXES: Array<{
  key: keyof ConfidenceVector;
  short: string;
  label: string;
}> = [
  { key: 'rhetorical_clarity', short: 'RC', label: 'Rhetorical clarity' },
  { key: 'site_resonance', short: 'SR', label: 'Site resonance' },
  { key: 'affective_coherence', short: 'AC', label: 'Affective coherence' },
  { key: 'operational_specificity', short: 'OS', label: 'Operational specificity' },
];

/** Full four-bar confidence display, used in the drawer. */
export const ConfidenceVectorDisplay: React.FC<{
  vector: ConfidenceVector;
  note?: string;
}> = ({ vector, note }) => (
  <div className="mb-3 pt-3 border-t border-ink-200">
    <p className="text-ink-600 text-[12px] font-semibold mb-2">Translation confidence</p>
    <div className="flex flex-col gap-2">
      {CONFIDENCE_AXES.map(({ key, short, label }) => {
        const value = Math.min(1, Math.max(0, vector[key] ?? 0));
        return (
          <div key={key}>
            <div className="flex justify-between items-baseline mb-0.5">
              <span className="text-ink-600 text-[11px]">
                <span className="text-ink-700 font-medium">{short}</span>
                <span className="text-ink-400"> — {label}</span>
              </span>
              <span className="text-ink-500 text-[11px] tabular-nums">{value.toFixed(2)}</span>
            </div>
            <div className="h-1.5 bg-ink-100 rounded overflow-hidden">
              <div
                className="h-full bg-primary rounded transition-[width] duration-300"
                style={{ width: `${value * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
    {note && (
      <p className="text-ink-600 text-[11px] leading-relaxed mt-2 m-0">{note}</p>
    )}
  </div>
);

/** One-row compact confidence display, used in summary cards. */
export const ConfidenceMiniBars: React.FC<{ vector: ConfidenceVector }> = ({ vector }) => (
  <div className="flex items-center gap-2 flex-wrap">
    {CONFIDENCE_AXES.map(({ key, short, label }) => {
      const value = Math.min(1, Math.max(0, vector[key] ?? 0));
      return (
        <div
          key={key}
          className="flex items-center gap-1"
          title={`${label}: ${value.toFixed(2)}`}
        >
          <span className="text-ink-400 text-[9px] font-medium">{short}</span>
          <div className="w-8 h-1 bg-ink-200 rounded overflow-hidden">
            <div className="h-full bg-primary rounded" style={{ width: `${value * 100}%` }} />
          </div>
        </div>
      );
    })}
  </div>
);

/**
 * Compact Pass-1 pills: a few rhetorical moves + functional affects with a
 * "+n" overflow chip. The full list lives in the drawer.
 */
const Pass1Pills: React.FC<{ pass1: TranslationRecordView['pass1'] }> = ({ pass1 }) => {
  if (!pass1) return null;
  const MAX_EACH = 3;
  const moves = pass1.rhetorical_moves.slice(0, MAX_EACH);
  const affects = pass1.functional_affects.slice(0, MAX_EACH);
  if (moves.length === 0 && affects.length === 0) return null;
  const hidden =
    pass1.rhetorical_moves.length + pass1.functional_affects.length
    - moves.length - affects.length;
  return (
    <div className="-mb-1">
      {moves.map((m, i) => (
        <Chip key={`m-${i}`}>{m}</Chip>
      ))}
      {affects.map((a, i) => (
        <Chip key={`a-${i}`} variant="affect">{a}</Chip>
      ))}
      {hidden > 0 && <Chip>+{hidden}</Chip>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Thumbnail hooks
// ---------------------------------------------------------------------------

/** The cube's current geometry: its cut override, else its base variation. */
function useCubeCurrentGeometry(cubeId: string | null | undefined): THREE.BufferGeometry | null {
  const override = useMemeStore(s => (cubeId ? s.cubeGeometryOverrides[cubeId] : undefined));
  const variationId = useBuilderStore(s =>
    cubeId ? s.placedCubes.find(c => c.id === cubeId)?.variationId : undefined,
  );
  const [loaded, setLoaded] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!cubeId || override || !variationId) {
      setLoaded(null);
      return;
    }
    const variation = CUBE_VARIATIONS.find(v => v.id === variationId);
    if (!variation) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    getVariationGeometryAsync(variation)
      .then(g => { if (!cancelled) setLoaded(g); })
      .catch(() => { if (!cancelled) setLoaded(null); });
    return () => { cancelled = true; };
  }, [cubeId, override, variationId]);

  return override ?? loaded;
}

/** Data URL of the record's cut-cube snapshot, or null where unavailable. */
function useRecordSnapshotUrl(view: TranslationRecordView | null): string | null {
  const cubeGeometry = useCubeCurrentGeometry(
    view && !view.snapshotGeometry ? view.snapshotCubeId : null,
  );
  const geometry = view?.snapshotGeometry ?? cubeGeometry;
  const cutter = view?.snapshotCutter ?? null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!geometry) {
      setUrl(null);
      return;
    }
    try {
      setUrl(renderRecordSnapshot(geometry, cutter));
    } catch {
      setUrl(null);
    }
  }, [geometry, cutter]);

  return url;
}

// ---------------------------------------------------------------------------
// Compact summary card
// ---------------------------------------------------------------------------

export const TranslationRecordSummary: React.FC<{
  view: TranslationRecordView;
}> = ({ view }) => {
  const openViewer = useRecordViewerStore(s => s.open);
  const snapshotUrl = useRecordSnapshotUrl(view);
  const thumb = snapshotUrl ?? view.memeImageUrl;
  const origin = originLabel(view.origin);

  return (
    <div>
      <div className="flex gap-2.5 items-start">
        {thumb && (
          <img
            src={thumb}
            alt=""
            className="w-14 h-14 rounded border border-ink-200 bg-ink-50 object-contain flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-ink-900 text-[12px] font-medium leading-snug m-0 line-clamp-2">
            {view.title}
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <FactChip>{view.operator}</FactChip>
            <FactChip>{view.cutterType}</FactChip>
            {origin && <FactChip>{origin}</FactChip>}
          </div>
        </div>
      </div>

      {view.pass1 && (
        <div className="mt-2">
          <Pass1Pills pass1={view.pass1} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-2">
        {view.confidenceVector ? <ConfidenceMiniBars vector={view.confidenceVector} /> : <span />}
        <button
          onClick={() => openViewer(view)}
          className="text-primary text-[11px] font-medium bg-transparent border-0 cursor-pointer p-0 hover:underline whitespace-nowrap"
        >
          Full reading →
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Full-reading drawer
// ---------------------------------------------------------------------------

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-ink-600 text-[12px] font-semibold m-0 mb-2">{children}</p>
);

const Prose: React.FC<{ label?: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-2.5">
    {label && <div className="text-ink-500 text-[11px] mb-0.5">{label}</div>}
    <p className="text-ink-800 text-[12px] leading-relaxed m-0">{children}</p>
  </div>
);

export const RecordViewerDrawer: React.FC = () => {
  const record = useRecordViewerStore(s => s.record);
  const close = useRecordViewerStore(s => s.close);
  const activeMode = useAppStore(s => s.activeMode);
  const snapshotUrl = useRecordSnapshotUrl(record);

  // The record belongs to the surface it was opened from; leaving that
  // context (mode switch) closes it rather than orphaning it over another tab.
  useEffect(() => {
    close();
  }, [activeMode, close]);

  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record, close]);

  if (!record) return null;

  const origin = originLabel(record.origin);
  const pass1 = record.pass1;
  const pass2 = record.pass2;

  return (
    <div
      className="fixed right-0 z-[60] flex flex-col bg-card border-l border-ink-200 shadow-[-8px_0_28px_hsl(45_9%_13%/0.12)]"
      style={{
        top: 'calc(42px + env(safe-area-inset-top, 0px))',
        bottom: 0,
        width: 480,
        maxWidth: '94vw',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-ink-200">
        <div className="min-w-0">
          <p className="text-ink-500 text-[10px] uppercase tracking-wider m-0 mb-1">
            Translation record{record.status === 'proposed' ? ' · proposed' : ''}
          </p>
          <p className="text-ink-900 text-[14px] font-semibold leading-snug m-0">
            {record.title}
          </p>
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            <FactChip>{record.operator}</FactChip>
            <FactChip>{record.cutterType}</FactChip>
            <FactChip>mag {record.magnitude.toFixed(2)}</FactChip>
            {origin && <FactChip>{origin}</FactChip>}
            {record.createdAt && (
              <span className="text-ink-400 text-[10px] ml-1">
                {new Date(record.createdAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={close}
          title="Close"
          aria-label="Close record"
          className="text-ink-400 hover:text-ink-700 text-[18px] leading-none bg-transparent border-0 cursor-pointer px-1 flex-shrink-0"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* The geometric consequence, up front */}
        {snapshotUrl && (
          <div className="mb-4">
            <img
              src={snapshotUrl}
              alt="Cut cube"
              className="w-full h-44 object-contain rounded border border-ink-200 bg-ink-50"
            />
            <p className="text-ink-400 text-[10px] mt-1 m-0">
              {record.status === 'proposed'
                ? 'Target cube with the proposed cutter ghosted'
                : 'Cut result with the cutter ghosted'}
            </p>
          </div>
        )}

        {/* Source meme */}
        {(record.memeImageUrl || record.memeDescription) && (
          <div className="mb-4 pb-4 border-b border-ink-200">
            <SectionHeading>Source meme</SectionHeading>
            {record.memeImageUrl && (
              <img
                src={record.memeImageUrl}
                alt={record.memeTitle || 'source meme'}
                className="w-full max-h-52 object-contain rounded border border-ink-200 bg-white mb-2"
              />
            )}
            {record.memeDescription && (
              <p className="text-ink-800 text-[12px] leading-relaxed m-0 whitespace-pre-wrap">
                {record.memeDescription}
              </p>
            )}
          </div>
        )}

        {/* Pass 1 — cultural reading */}
        {pass1 && (
          <div className="mb-4 pb-4 border-b border-ink-200">
            <SectionHeading>Pass 1 · Cultural reading</SectionHeading>
            {/* The summary is usually the drawer headline already — don't
                repeat it word for word right below itself. */}
            {pass1.meme_summary !== record.title && (
              <p className="text-ink-900 text-[13px] font-medium leading-snug mb-2.5 m-0">
                {pass1.meme_summary}
              </p>
            )}
            {pass1.rhetorical_moves.length > 0 && (
              <div className="mb-2">
                <div className="text-ink-500 text-[11px] mb-0.5">Rhetorical moves</div>
                <div>
                  {pass1.rhetorical_moves.map((m, i) => (
                    <Chip key={i}>{m}</Chip>
                  ))}
                </div>
              </div>
            )}
            {pass1.functional_affects.length > 0 && (
              <div className="mb-2">
                <div className="text-ink-500 text-[11px] mb-0.5">Functional affects</div>
                <div>
                  {pass1.functional_affects.map((a, i) => (
                    <Chip key={i} variant="affect">{a}</Chip>
                  ))}
                </div>
              </div>
            )}
            {pass1.cultural_tensions.length > 0 && (
              <div className="mb-2">
                <div className="text-ink-500 text-[11px] mb-0.5">Cultural tensions</div>
                <ul className="m-0 p-0 list-none text-ink-800 text-[12px] leading-relaxed flex flex-col gap-1.5">
                  {pass1.cultural_tensions.map((t, i) => (
                    <li key={i}>
                      {t.description}
                      <FrictionLabel type={t.friction_type} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pass1.site_resonance && (
              <Prose label="Site resonance">{pass1.site_resonance}</Prose>
            )}
          </div>
        )}

        {/* Pass 2 — geometric commitment */}
        <div className="mb-4">
          <SectionHeading>{pass2 ? 'Pass 2 · Geometric commitment' : 'Applied operator'}</SectionHeading>
          <div className="mb-2.5">
            <span className="text-ink-500 text-[11px]">Targets: </span>
            <span className="text-ink-700 text-[12px]">{record.targets.join(', ')}</span>
          </div>
          {pass2?.target_reasoning && (
            <Prose label="Why these targets">{pass2.target_reasoning}</Prose>
          )}
          {pass2?.cutter.geometry_reasoning && (
            <Prose label="Why this geometry">{pass2.cutter.geometry_reasoning}</Prose>
          )}
          {record.reasoning && (
            <Prose label={pass2 ? 'Translation reasoning' : 'Reasoning'}>{record.reasoning}</Prose>
          )}
        </div>

        {/* Confidence */}
        {record.confidenceVector && (
          <ConfidenceVectorDisplay
            vector={record.confidenceVector}
            note={pass2?.confidence_note}
          />
        )}

        {record.model && (
          <p className="text-ink-400 text-[10px] m-0">model: {record.model}</p>
        )}
      </div>
    </div>
  );
};
