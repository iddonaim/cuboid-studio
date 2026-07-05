import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';

interface StrictRulesToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export const StrictRulesToggle: React.FC<StrictRulesToggleProps> = ({ enabled, onChange, disabled }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={enabled}
          onCheckedChange={onChange}
          disabled={disabled}
          id="strict-rules-toggle"
          className="data-[state=checked]:bg-amber-500 disabled:opacity-50"
        />
        <button
          onClick={() => !disabled && setShowDetails(!showDetails)}
          disabled={disabled}
          className={`text-[13px] underline decoration-dotted ${
            disabled
              ? 'cursor-not-allowed opacity-50 text-ink-400'
              : enabled
              ? 'cursor-pointer text-amber-600'
              : 'cursor-pointer text-ink-600'
          }`}
        >
          Strict Alignment {showDetails ? '▼' : '▶'}
        </button>
      </div>
      {showDetails && (
        <div className="mt-2 ml-6 p-2 bg-ink-100 rounded text-[12px] text-ink-600 leading-relaxed">
          <div className="text-amber-600 mb-1">Additional constraints:</div>
          <div>• Sphere ↔ Sphere: centers must align</div>
          <div>• Cylinder ↔ Cylinder: centers must align</div>
          <div className="text-[11px] mt-1">(Tolerance: ~10% of cutter radius)</div>
        </div>
      )}
    </div>
  );
};
