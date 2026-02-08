import React, { useState } from 'react';

interface StrictRulesToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export const StrictRulesToggle: React.FC<StrictRulesToggleProps> = ({ enabled, onChange, disabled }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
        />
        <span
          onClick={() => !disabled && setShowDetails(!showDetails)}
          style={{
            color: disabled ? '#64748b' : (enabled ? '#f59e0b' : '#94a3b8'),
            fontSize: 12,
            cursor: disabled ? 'not-allowed' : 'pointer',
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Strict Alignment {showDetails ? '\u25BC' : '\u25B6'}
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
          <div style={{ marginBottom: 4, color: '#f59e0b' }}>Additional constraints:</div>
          <div style={{ color: '#94a3b8' }}>{'\u2022'} Sphere {'\u2194'} Sphere: centers must align</div>
          <div style={{ color: '#94a3b8' }}>{'\u2022'} Cylinder {'\u2194'} Cylinder: centers must align</div>
          <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 10 }}>
            (Tolerance: ~10% of cutter radius)
          </div>
        </div>
      )}
    </div>
  );
};
