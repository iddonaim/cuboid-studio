import React from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import type { ConfidenceVector } from '../../lib/operators/types';
import { Button } from '@/components/ui/button';

const floatingCls =
  'absolute top-4 right-4 bg-ink-100 border border-ink-200 rounded-lg p-4 w-[280px] max-h-[70vh] overflow-y-auto';
const dockedCls =
  'pointer-events-auto w-full bg-card border border-ink-200 rounded-lg p-4 shadow-[0_4px_20px_hsl(45_9%_13%/0.08)]';

const Chip: React.FC<{ children: React.ReactNode; variant?: 'rhetoric' | 'affect' }> = ({
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

export const OperatorResultPanel: React.FC<{ docked?: boolean }> = ({ docked = false }) => {
  const lastResult = useMemeStore(s => s.lastResult);
  const lastPass1 = useMemeStore(s => s.lastPass1);
  const lastPass2 = useMemeStore(s => s.lastPass2);
  const lastConfidenceVector = useMemeStore(s => s.lastConfidenceVector);
  const isTranslating = useMemeStore(s => s.isTranslating);
  const revertLastOperator = useMemeStore(s => s.revertLastOperator);
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const standaloneOperators = useMemeStore(s => s.operators);
  const cubeTranslations = useMemeStore(s => s.cubeTranslations);
  const selectedMemeImageUrl = useMemeStore(s => s.selectedMemeImageUrl);
  const selectedMemeTitle = useMemeStore(s => s.selectedMemeTitle);
  const operators = targetCubeId ? (cubeOperators[targetCubeId] || []) : standaloneOperators;

  // The meme behind the shown result. When a cube is selected we trust its
  // stored translation snapshot (never the panel's current meme picker, which
  // may point at a different meme); standalone mode uses the live selection.
  const translation = targetCubeId ? cubeTranslations[targetCubeId] : undefined;
  const memeImageUrl = targetCubeId ? translation?.memeImageUrl : selectedMemeImageUrl;
  const memeTitle = targetCubeId ? translation?.memeTitle : selectedMemeTitle;
  const memeDescription = targetCubeId ? translation?.memeDescription : undefined;

  // While a translation is in flight the ApiActivityIndicator card covers
  // this rail slot, so this panel stays hidden instead of doubling up.
  if (isTranslating) return null;

  if (!lastResult) return null;

  const confidenceVector = lastConfidenceVector ?? lastPass2?.confidence_vector;
  const confidenceNote = lastPass2?.confidence_note;

  return (
    <div className={docked ? dockedCls : floatingCls}>
      {/* Source meme — the cultural input this change translated */}
      {memeImageUrl && (
        <div className="mb-3 pb-3 border-b border-ink-200">
          <p className="text-ink-600 text-[12px] font-semibold mb-1.5">Source meme</p>
          <img
            src={memeImageUrl}
            alt={memeTitle || 'source meme'}
            className="w-full max-h-44 object-contain rounded border border-ink-200 bg-ink-50"
          />
          {(memeTitle || memeDescription) && (
            <p className="text-ink-700 text-[11px] leading-snug mt-1.5 m-0">
              {memeTitle || memeDescription?.split('\n')[0]}
            </p>
          )}
        </div>
      )}

      {lastPass1 && (
        <div className="mb-4 pb-3 border-b border-ink-200">
          <p className="text-ink-600 text-[12px] font-semibold mb-1.5">
            Pass 1 · Cultural extraction
          </p>
          <p className="text-ink-900 text-sm font-medium mb-2.5 leading-snug">
            {lastPass1.meme_summary}
          </p>

          {lastPass1.rhetorical_moves.length > 0 && (
            <div className="mb-2">
              <div className="text-ink-500 text-[11px] mb-0.5">Rhetorical moves</div>
              <div>
                {lastPass1.rhetorical_moves.map((m, i) => (
                  <Chip key={i}>{m}</Chip>
                ))}
              </div>
            </div>
          )}

          {lastPass1.functional_affects.length > 0 && (
            <div className="mb-2">
              <div className="text-ink-500 text-[11px] mb-0.5">Functional affects</div>
              <div>
                {lastPass1.functional_affects.map((a, i) => (
                  <Chip key={i} variant="affect">
                    {a}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {lastPass1.cultural_tensions.length > 0 && (
            <div className="mb-2">
              <div className="text-ink-500 text-[11px] mb-0.5">Cultural tensions</div>
              <ul className="m-0 p-0 list-none text-ink-700 text-[11px] leading-relaxed flex flex-col gap-1.5">
                {lastPass1.cultural_tensions.map((t, i) => (
                  <li key={i}>
                    {t.description}
                    <FrictionLabel type={t.friction_type} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="text-ink-500 text-[11px] mb-0.5">Site resonance</div>
            <p className="text-ink-700 text-[11px] leading-relaxed m-0">
              {lastPass1.site_resonance || '—'}
            </p>
          </div>
        </div>
      )}

      <p className="text-ink-900 text-sm mb-2">
        {lastPass2 ? 'Pass 2 · Geometric translation' : 'Operator Applied'}
      </p>

      <div className="mb-2">
        <span className="inline-block px-2 py-0.5 rounded bg-ink-200 text-ink-800 text-[12px] font-semibold">
          {lastResult.operator}
        </span>
        <span className="text-ink-600 text-[12px] ml-2">
          mag: {lastResult.magnitude.toFixed(2)}
        </span>
      </div>

      <div className="mb-2">
        <span className="text-ink-500 text-[11px]">Targets: </span>
        <span className="text-ink-600 text-[11px]">{lastResult.targets.join(', ')}</span>
      </div>

      {lastPass2?.target_reasoning && (
        <p className="text-ink-500 text-[10px] leading-relaxed mb-2 m-0">
          {lastPass2.target_reasoning}
        </p>
      )}

      <div className="mb-2">
        <span className="text-ink-500 text-[11px]">Cutter: </span>
        <span className="text-ink-600 text-[11px]">{lastResult.cutter.type}</span>
      </div>

      {lastPass2?.cutter.geometry_reasoning && (
        <p className="text-ink-500 text-[10px] leading-relaxed mb-2 m-0">
          {lastPass2.cutter.geometry_reasoning}
        </p>
      )}

      {lastResult.reasoning && (
        <p className="text-ink-500 text-[10px] leading-relaxed mb-3 m-0 border-t border-ink-200 pt-2">
          {lastResult.reasoning}
        </p>
      )}

      {confidenceVector && (
        <ConfidenceVectorDisplay vector={confidenceVector} note={confidenceNote} />
      )}

      {operators.length > 0 && (
        <Button
          onClick={revertLastOperator}
          className="w-full h-auto py-2 text-[13px] bg-destructive/10 hover:bg-destructive/20 text-destructive border-0"
        >
          Revert Last
        </Button>
      )}
    </div>
  );
};
