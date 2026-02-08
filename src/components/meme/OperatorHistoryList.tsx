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
      <div style={{ marginTop: 16, color: '#475569', fontSize: 11, fontStyle: 'italic' }}>
        No operators applied yet. Translate a meme to begin.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, flex: 1, overflowY: 'auto' }}>
      <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>
        Operator History ({operators.length})
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {operators.map((op, idx) => (
          <div
            key={op.id}
            onClick={() => setExpandedId(expandedId === op.id ? null : op.id)}
            style={{
              padding: 8,
              background: '#1e293b',
              borderRadius: 4,
              cursor: 'pointer',
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 600 }}>
                  #{idx + 1}
                </span>
                <span style={{
                  padding: '1px 6px', borderRadius: 3,
                  background: '#334155', color: '#94a3b8', fontSize: 10,
                }}>
                  {op.operator}
                </span>
              </div>
              {/* Magnitude bar */}
              <div style={{
                width: 40, height: 4, background: '#334155', borderRadius: 2,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${op.magnitude * 100}%`, height: '100%',
                  background: '#22c55e', borderRadius: 2,
                }} />
              </div>
            </div>

            {expandedId === op.id && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155' }}>
                <p style={{ color: '#64748b', fontSize: 10, marginBottom: 4 }}>
                  {op.memeDescription}
                </p>
                <p style={{ color: '#94a3b8', fontSize: 10, fontStyle: 'italic' }}>
                  {op.reasoning}
                </p>
                <p style={{ color: '#475569', fontSize: 9, marginTop: 4 }}>
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
