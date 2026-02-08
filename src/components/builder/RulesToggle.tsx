import React, { useState } from 'react';

interface RulesToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export const RulesToggle: React.FC<RulesToggleProps> = ({ enabled, onChange }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <span
          onClick={() => setShowDetails(!showDetails)}
          style={{
            color: enabled ? '#22c55e' : '#94a3b8',
            fontSize: 12,
            cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
          }}
        >
          Rules {showDetails ? '\u25BC' : '\u25B6'}
        </span>
      </div>
      {showDetails && (
        <div style={{
          marginTop: 8,
          marginLeft: 24,
          padding: 8,
          background: '#1e293b',
          borderRadius: 4,
          fontSize: 11,
          color: '#94a3b8',
          lineHeight: 1.6,
        }}>
          <div style={{ color: '#22c55e' }}>{'\u2713'} Door {'\u2194'} Door (sphere{'\u2194'}sphere)</div>
          <div style={{ color: '#22c55e' }}>{'\u2713'} Window {'\u2194'} Window (cylinder{'\u2194'}cylinder)</div>
          <div style={{ color: '#ef4444' }}>{'\u2717'} Wall {'\u2194'} anything (blocks growth)</div>
          <div style={{ color: '#ef4444' }}>{'\u2717'} Door {'\u2194'} Window</div>
        </div>
      )}
    </div>
  );
};
