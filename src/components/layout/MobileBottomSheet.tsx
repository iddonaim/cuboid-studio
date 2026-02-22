import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

const MODE_LABELS: Record<string, string> = {
  builder: 'Builder',
  pataphysical: 'Pataphysical',
  encoding: 'Encoding',
  evolution: 'Evolution',
};

export const MobileBottomSheet: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expanded, setExpanded] = useState(false);
  const activeMode = useAppStore(s => s.activeMode);

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#0f172a',
      borderTop: '1px solid #334155',
      zIndex: 50,
    }}>
      {/* Expandable content */}
      <div style={{
        maxHeight: expanded ? '55vh' : 0,
        overflow: 'hidden',
        transition: 'max-height 0.25s ease',
      }}>
        <div style={{
          overflowY: 'auto',
          maxHeight: '55vh',
          padding: '12px 16px 4px',
        }}>
          {children}
        </div>
      </div>

      {/* Always-visible handle bar */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '10px 16px',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          gap: 10,
          minHeight: 44,
        }}
      >
        {/* Drag indicator pill */}
        <div style={{
          width: 32,
          height: 3,
          background: '#334155',
          borderRadius: 2,
          flexShrink: 0,
        }} />
        <span style={{
          color: '#94a3b8',
          fontSize: 13,
          fontWeight: 600,
          flex: 1,
          textAlign: 'left',
        }}>
          {MODE_LABELS[activeMode] ?? activeMode}
        </span>
        <span style={{ color: '#64748b', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
          {expanded ? '▼' : '▲'}
        </span>
      </button>
    </div>
  );
};
