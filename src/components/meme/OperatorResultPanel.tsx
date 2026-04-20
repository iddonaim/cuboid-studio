import React from 'react';
import { useMemeStore } from '../../store/useMemeStore';

const chipStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 6px',
  margin: '0 4px 4px 0',
  borderRadius: 4,
  background: '#1e293b',
  color: '#cbd5e1',
  fontSize: 10,
  border: '1px solid #334155',
};

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
    <div style={{
      position: 'absolute',
      top: 16,
      right: 16,
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: 8,
      padding: 16,
      width: 280,
      maxHeight: '70vh',
      overflowY: 'auto',
    }}>
      {/* Pass 1 block — only in v2 flow */}
      {lastPass1 && (
        <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #334155' }}>
          <p style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, margin: '0 0 6px 0' }}>
            Pass 1 · Cultural extraction
          </p>

          <p style={{ color: 'white', fontSize: 12, fontStyle: 'italic', margin: '0 0 10px 0', lineHeight: 1.4 }}>
            {lastPass1.meme_summary}
          </p>

          {lastPass1.rhetorical_moves.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#64748b', fontSize: 10, marginBottom: 3 }}>Rhetorical moves</div>
              <div>
                {lastPass1.rhetorical_moves.map((m, i) => (
                  <span key={i} style={chipStyle}>{m}</span>
                ))}
              </div>
            </div>
          )}

          {lastPass1.functional_affects.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#64748b', fontSize: 10, marginBottom: 3 }}>Affects</div>
              <div>
                {lastPass1.functional_affects.map((a, i) => (
                  <span key={i} style={chipStyle}>{a}</span>
                ))}
              </div>
            </div>
          )}

          {lastPass1.cultural_tensions.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#64748b', fontSize: 10, marginBottom: 3 }}>Tensions</div>
              <ul style={{ margin: 0, paddingLeft: 16, color: '#cbd5e1', fontSize: 10, lineHeight: 1.5 }}>
                {lastPass1.cultural_tensions.map((t, i) => (
                  <li key={i}>
                    {t.description}
                    <span style={{ color: '#64748b', marginLeft: 4 }}>
                      [{t.friction_type}]
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lastPass1.site_resonance && (
            <div>
              <div style={{ color: '#64748b', fontSize: 10, marginBottom: 3 }}>Site resonance</div>
              <p style={{ color: '#cbd5e1', fontSize: 10, lineHeight: 1.5, margin: 0 }}>
                {lastPass1.site_resonance}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pass 2 / v1 block — operator application */}
      <p style={{ color: 'white', fontSize: 14, margin: '0 0 8px 0' }}>
        {lastPass2 ? 'Pass 2 · Geometric translation' : 'Operator Applied'}
      </p>

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

      {/* v2 extra: target_reasoning */}
      {lastPass2?.target_reasoning && (
        <div style={{
          padding: 6, background: '#1e293b', borderRadius: 4,
          color: '#94a3b8', fontSize: 10, lineHeight: 1.5, marginBottom: 8,
        }}>
          <span style={{ color: '#64748b' }}>Target reasoning — </span>
          {lastPass2.target_reasoning}
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#64748b', fontSize: 10 }}>Cutter: </span>
        <span style={{ color: '#94a3b8', fontSize: 10 }}>
          {lastResult.cutter.type}
        </span>
      </div>

      {/* v2 extra: geometry_reasoning */}
      {lastPass2?.cutter.geometry_reasoning && (
        <div style={{
          padding: 6, background: '#1e293b', borderRadius: 4,
          color: '#94a3b8', fontSize: 10, lineHeight: 1.5, marginBottom: 8,
        }}>
          <span style={{ color: '#64748b' }}>Geometry reasoning — </span>
          {lastPass2.cutter.geometry_reasoning}
        </div>
      )}

      <div style={{
        padding: 8, background: '#1e293b', borderRadius: 4,
        color: '#cbd5e1', fontSize: 11, lineHeight: 1.5, marginBottom: 12,
        fontStyle: 'italic',
      }}>
        {lastResult.reasoning}
      </div>

      {/* TODO(phase-3): confidence vector radar / badge renders here from
          lastConfidenceVector + lastPass2.confidence_note. Deferred per
          scope discipline; data already in store. */}

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
