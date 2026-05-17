import React from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { Button } from '@/components/ui/button';

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block px-1.5 py-0.5 mr-1 mb-1 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">
    {children}
  </span>
);

export const OperatorResultPanel: React.FC = () => {
  const lastResult = useMemeStore(s => s.lastResult);
  const lastPass1 = useMemeStore(s => s.lastPass1);
  const lastPass2 = useMemeStore(s => s.lastPass2);
  const revertLastOperator = useMemeStore(s => s.revertLastOperator);
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const standaloneOperators = useMemeStore(s => s.operators);
  const operators = targetCubeId ? (cubeOperators[targetCubeId] || []) : standaloneOperators;

  if (!lastResult) return null;

  return (
    <div className="absolute top-4 right-4 bg-slate-950 border border-slate-700 rounded-lg p-4 w-[280px] max-h-[70vh] overflow-y-auto">
      {/* Pass 1 block — only in v2 flow */}
      {lastPass1 && (
        <div className="mb-4 pb-3 border-b border-slate-700">
          <p className="text-slate-400 text-[11px] font-semibold mb-1.5">
            Pass 1 · Cultural extraction
          </p>
          <p className="text-white text-xs italic mb-2.5 leading-relaxed">
            {lastPass1.meme_summary}
          </p>

          {lastPass1.rhetorical_moves.length > 0 && (
            <div className="mb-2">
              <div className="text-slate-500 text-[10px] mb-0.5">Rhetorical moves</div>
              <div>{lastPass1.rhetorical_moves.map((m, i) => <Chip key={i}>{m}</Chip>)}</div>
            </div>
          )}

          {lastPass1.functional_affects.length > 0 && (
            <div className="mb-2">
              <div className="text-slate-500 text-[10px] mb-0.5">Affects</div>
              <div>{lastPass1.functional_affects.map((a, i) => <Chip key={i}>{a}</Chip>)}</div>
            </div>
          )}

          {lastPass1.cultural_tensions.length > 0 && (
            <div className="mb-2">
              <div className="text-slate-500 text-[10px] mb-0.5">Tensions</div>
              <ul className="m-0 pl-4 text-slate-300 text-[10px] leading-relaxed">
                {lastPass1.cultural_tensions.map((t, i) => (
                  <li key={i}>
                    {t.description}
                    <span className="text-slate-500 ml-1">[{t.friction_type}]</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lastPass1.site_resonance && (
            <div>
              <div className="text-slate-500 text-[10px] mb-0.5">Site resonance</div>
              <p className="text-slate-300 text-[10px] leading-relaxed m-0">{lastPass1.site_resonance}</p>
            </div>
          )}
        </div>
      )}

      {/* Pass 2 / v1 block — operator application */}
      <p className="text-white text-sm mb-2">
        {lastPass2 ? 'Pass 2 · Geometric translation' : 'Operator Applied'}
      </p>

      <div className="mb-2">
        <span className="inline-block px-2 py-0.5 rounded bg-slate-700 text-slate-200 text-[11px] font-semibold">
          {lastResult.operator}
        </span>
        <span className="text-slate-400 text-[11px] ml-2">
          mag: {lastResult.magnitude.toFixed(2)}
        </span>
      </div>

      <div className="mb-2">
        <span className="text-slate-500 text-[10px]">Targets: </span>
        <span className="text-slate-400 text-[10px]">{lastResult.targets.join(', ')}</span>
      </div>

      {/* v2 extra: target_reasoning */}
      {lastPass2?.target_reasoning && (
        <div className="p-1.5 bg-slate-800 rounded text-slate-400 text-[10px] leading-relaxed mb-2">
          <span className="text-slate-500">Target reasoning — </span>
          {lastPass2.target_reasoning}
        </div>
      )}

      <div className="mb-2">
        <span className="text-slate-500 text-[10px]">Cutter: </span>
        <span className="text-slate-400 text-[10px]">{lastResult.cutter.type}</span>
      </div>

      {/* v2 extra: geometry_reasoning */}
      {lastPass2?.cutter.geometry_reasoning && (
        <div className="p-1.5 bg-slate-800 rounded text-slate-400 text-[10px] leading-relaxed mb-2">
          <span className="text-slate-500">Geometry reasoning — </span>
          {lastPass2.cutter.geometry_reasoning}
        </div>
      )}

      <div className="p-2 bg-slate-800 rounded text-slate-300 text-[11px] leading-relaxed mb-3 italic">
        {lastResult.reasoning}
      </div>

      {/* TODO(phase-3): confidence vector radar / badge renders here from
          lastConfidenceVector + lastPass2.confidence_note. Deferred per
          scope discipline; data already in store. */}

      {operators.length > 0 && (
        <Button
          onClick={revertLastOperator}
          className="w-full h-auto py-2 text-xs bg-red-900 hover:bg-red-800 text-white border-0"
        >
          Revert Last
        </Button>
      )}
    </div>
  );
};
