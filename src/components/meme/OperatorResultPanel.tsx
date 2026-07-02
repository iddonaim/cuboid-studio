import React from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import type { ConfidenceVector } from '../../lib/operators/types';
import { Button } from '@/components/ui/button';

const panelCls =
  'absolute top-4 right-4 bg-ink-100 border border-ink-200 rounded-lg p-4 w-[280px] max-h-[70vh] overflow-y-auto';

const Chip: React.FC<{ children: React.ReactNode; variant?: 'rhetoric' | 'affect' }> = ({
  children,
  variant = 'rhetoric',
}) => (
  <span
    className={`inline-block px-1.5 py-0.5 mr-1 mb-1 rounded text-[10px] border ${
      variant === 'affect'
        ? 'bg-violet-950 text-violet-200 border-violet-800'
        : 'bg-ink-100 text-ink-700 border-ink-200'
    }`}
  >
    {children}
  </span>
);

const FrictionLabel: React.FC<{ type: string }> = ({ type }) => (
  <span className="inline-block ml-1 px-1 py-px rounded bg-ink-100 text-ink-500 text-[8px] uppercase tracking-wide border border-ink-200 align-middle">
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

const ConfidenceVectorDisplay: React.FC<{
  vector: ConfidenceVector;
  note?: string;
}> = ({ vector, note }) => (
  <div className="mb-3 pt-3 border-t border-ink-200">
    <p className="text-ink-600 text-[11px] font-semibold mb-2">Translation confidence</p>
    <div className="flex flex-col gap-2">
      {CONFIDENCE_AXES.map(({ key, short, label }) => {
        const value = Math.min(1, Math.max(0, vector[key] ?? 0));
        return (
          <div key={key}>
            <div className="flex justify-between items-baseline mb-0.5">
              <span className="text-ink-600 text-[10px]">
                <span className="text-ink-700 font-medium">{short}</span>
                <span className="text-ink-400"> — {label}</span>
              </span>
              <span className="text-ink-500 text-[10px] tabular-nums">{value.toFixed(2)}</span>
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
      <p className="text-ink-600 text-[10px] leading-relaxed mt-2 m-0">{note}</p>
    )}
  </div>
);

const TranslationLoadingPanel: React.FC<{ phase: 'reading' | 'geometry' }> = ({ phase }) => (
  <div className={panelCls}>
    <p className="text-ink-600 text-[11px] font-semibold mb-1">Translating meme</p>
    <p className="text-ink-900 text-xs m-0">
      {phase === 'reading' ? 'Reading the meme...' : 'Translating to geometry...'}
    </p>
  </div>
);

export const OperatorResultPanel: React.FC = () => {
  const lastResult = useMemeStore(s => s.lastResult);
  const lastPass1 = useMemeStore(s => s.lastPass1);
  const lastPass2 = useMemeStore(s => s.lastPass2);
  const lastConfidenceVector = useMemeStore(s => s.lastConfidenceVector);
  const isTranslating = useMemeStore(s => s.isTranslating);
  const translationPhase = useMemeStore(s => s.translationPhase);
  const passMode = useMemeStore(s => s.passMode);
  const revertLastOperator = useMemeStore(s => s.revertLastOperator);
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const standaloneOperators = useMemeStore(s => s.operators);
  const operators = targetCubeId ? (cubeOperators[targetCubeId] || []) : standaloneOperators;

  if (isTranslating && passMode === 'two_pass') {
    const phase = translationPhase === 'geometry' ? 'geometry' : 'reading';
    return <TranslationLoadingPanel phase={phase} />;
  }

  if (!lastResult) return null;

  const confidenceVector = lastConfidenceVector ?? lastPass2?.confidence_vector;
  const confidenceNote = lastPass2?.confidence_note;

  return (
    <div className={panelCls}>
      {lastPass1 && (
        <div className="mb-4 pb-3 border-b border-ink-200">
          <p className="text-ink-600 text-[11px] font-semibold mb-1.5">
            Pass 1 · Cultural extraction
          </p>
          <p className="text-ink-900 text-sm font-medium mb-2.5 leading-snug">
            {lastPass1.meme_summary}
          </p>

          {lastPass1.rhetorical_moves.length > 0 && (
            <div className="mb-2">
              <div className="text-ink-500 text-[10px] mb-0.5">Rhetorical moves</div>
              <div>
                {lastPass1.rhetorical_moves.map((m, i) => (
                  <Chip key={i}>{m}</Chip>
                ))}
              </div>
            </div>
          )}

          {lastPass1.functional_affects.length > 0 && (
            <div className="mb-2">
              <div className="text-ink-500 text-[10px] mb-0.5">Functional affects</div>
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
              <div className="text-ink-500 text-[10px] mb-0.5">Cultural tensions</div>
              <ul className="m-0 p-0 list-none text-ink-700 text-[10px] leading-relaxed flex flex-col gap-1.5">
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
            <div className="text-ink-500 text-[10px] mb-0.5">Site resonance</div>
            <p className="text-ink-700 text-[10px] leading-relaxed m-0">
              {lastPass1.site_resonance || '—'}
            </p>
          </div>
        </div>
      )}

      <p className="text-ink-900 text-sm mb-2">
        {lastPass2 ? 'Pass 2 · Geometric translation' : 'Operator Applied'}
      </p>

      <div className="mb-2">
        <span className="inline-block px-2 py-0.5 rounded bg-ink-200 text-ink-800 text-[11px] font-semibold">
          {lastResult.operator}
        </span>
        <span className="text-ink-600 text-[11px] ml-2">
          mag: {lastResult.magnitude.toFixed(2)}
        </span>
      </div>

      <div className="mb-2">
        <span className="text-ink-500 text-[10px]">Targets: </span>
        <span className="text-ink-600 text-[10px]">{lastResult.targets.join(', ')}</span>
      </div>

      {lastPass2?.target_reasoning && (
        <p className="text-ink-500 text-[9px] leading-relaxed mb-2 m-0">
          {lastPass2.target_reasoning}
        </p>
      )}

      <div className="mb-2">
        <span className="text-ink-500 text-[10px]">Cutter: </span>
        <span className="text-ink-600 text-[10px]">{lastResult.cutter.type}</span>
      </div>

      {lastPass2?.cutter.geometry_reasoning && (
        <p className="text-ink-500 text-[9px] leading-relaxed mb-2 m-0">
          {lastPass2.cutter.geometry_reasoning}
        </p>
      )}

      {lastResult.reasoning && (
        <p className="text-ink-500 text-[9px] leading-relaxed mb-3 m-0 border-t border-ink-200 pt-2">
          {lastResult.reasoning}
        </p>
      )}

      {confidenceVector && (
        <ConfidenceVectorDisplay vector={confidenceVector} note={confidenceNote} />
      )}

      {operators.length > 0 && (
        <Button
          onClick={revertLastOperator}
          className="w-full h-auto py-2 text-xs bg-destructive/10 hover:bg-destructive/20 text-white border-0"
        >
          Revert Last
        </Button>
      )}
    </div>
  );
};
