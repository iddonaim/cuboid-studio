import React from 'react';
import { useMemeStore } from '../../store/useMemeStore';

export const OperatorResultPanel: React.FC = () => {
  const lastResult = useMemeStore(s => s.lastResult);
  const revertLastOperator = useMemeStore(s => s.revertLastOperator);
  const operators = useMemeStore(s => s.operators);

  if (!lastResult) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      right: 16,
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: 8,
      padding: 16,
      width: 260,
      maxHeight: '50vh',
      overflowY: 'auto',
    }}>
      <p style={{ color: 'white', fontSize: 14, marginBottom: 8 }}>Operator Applied</p>

      <div style={{ marginBottom: 8 }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
          background: '#334155', color: '#e2e8f0', fontSize: 11, fontWeight: 600,
        }}>
          {lastResult.operator}
        </span>
        <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 8 }}>
          mag: {lastResult.magnitude.toFixed(2)}
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#64748b', fontSize: 10 }}>Targets: </span>
        <span style={{ color: '#94a3b8', fontSize: 10 }}>
          {lastResult.targets.join(', ')}
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#64748b', fontSize: 10 }}>Cutter: </span>
        <span style={{ color: '#94a3b8', fontSize: 10 }}>
          {lastResult.cutter.type}
        </span>
      </div>

      <div style={{
        padding: 8, background: '#1e293b', borderRadius: 4,
        color: '#cbd5e1', fontSize: 11, lineHeight: 1.5, marginBottom: 12,
        fontStyle: 'italic',
      }}>
        {lastResult.reasoning}
      </div>

      {operators.length > 0 && (
        <button
          onClick={revertLastOperator}
          style={{
            width: '100%', padding: 8, background: '#7f1d1d',
            border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 12,
          }}
        >
          Revert Last
        </button>
      )}
    </div>
  );
};
