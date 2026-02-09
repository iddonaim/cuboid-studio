import React from 'react';
import { useAppStore, AppMode } from '../../store/useAppStore';

const MODES: { key: AppMode; label: string; enabled: boolean }[] = [
  { key: 'builder', label: 'Builder', enabled: true },
  { key: 'pataphysical', label: 'Pataphysical', enabled: true },
  { key: 'encoding', label: 'Encoding', enabled: true },
  { key: 'evolution', label: 'Evolution', enabled: true },
];

export const ModeSelector: React.FC = () => {
  const activeMode = useAppStore(s => s.activeMode);
  const setActiveMode = useAppStore(s => s.setActiveMode);

  return (
    <div style={{
      display: 'flex',
      gap: 2,
      marginBottom: 12,
      borderBottom: '1px solid #334155',
      paddingBottom: 8,
    }}>
      {MODES.map(mode => (
        <button
          key={mode.key}
          onClick={() => mode.enabled && setActiveMode(mode.key)}
          disabled={!mode.enabled}
          style={{
            flex: 1,
            padding: '6px 4px',
            fontSize: 10,
            fontWeight: activeMode === mode.key ? 600 : 400,
            background: activeMode === mode.key ? '#334155' : 'transparent',
            color: !mode.enabled ? '#475569' : activeMode === mode.key ? '#e2e8f0' : '#94a3b8',
            border: 'none',
            borderRadius: 4,
            cursor: mode.enabled ? 'pointer' : 'not-allowed',
            opacity: mode.enabled ? 1 : 0.5,
          }}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
};
