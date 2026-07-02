import React, { useState } from 'react';
import { useMemeStore } from '../../store/useMemeStore';

export const OperatorHistoryList: React.FC = () => {
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const standaloneOperators = useMemeStore(s => s.operators);
  const operators = targetCubeId ? (cubeOperators[targetCubeId] || []) : standaloneOperators;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (operators.length === 0) {
    return (
      <div className="mt-4 text-ink-400 text-[11px] italic">
        No operators applied yet. Translate a meme to begin.
      </div>
    );
  }

  return (
    <div className="mt-4 flex-1 overflow-y-auto">
      <p className="text-ink-600 text-[11px] mb-2">Operator History ({operators.length})</p>
      <div className="flex flex-col gap-1">
        {operators.map((op, idx) => (
          <div
            key={op.id}
            onClick={() => setExpandedId(expandedId === op.id ? null : op.id)}
            className="p-2 bg-ink-100 rounded border border-ink-200 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-ink-800 text-[11px] font-semibold">#{idx + 1}</span>
                <span className="px-1.5 py-px rounded bg-ink-200 text-ink-600 text-[10px]">
                  {op.operator}
                </span>
              </div>
              {/* Magnitude bar */}
              <div className="w-10 h-1 bg-ink-200 rounded overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded"
                  style={{ width: `${op.magnitude * 100}%` }}
                />
              </div>
            </div>

            {expandedId === op.id && (
              <div className="mt-2 pt-2 border-t border-ink-200">
                <p className="text-ink-500 text-[10px] mb-1">{op.memeDescription}</p>
                <p className="text-ink-600 text-[10px] italic">{op.reasoning}</p>
                <p className="text-ink-400 text-[9px] mt-1">
                  {new Date(op.createdAt).toLocaleTimeString()}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
