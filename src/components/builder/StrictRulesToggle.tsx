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
          className={`text-xs underline decoration-dotted ${
            disabled
              ? 'cursor-not-allowed opacity-50 text-slate-600'
              : enabled
              ? 'cursor-pointer text-amber-400'
              : 'cursor-pointer text-slate-400'
          }`}
        >
          Strict Alignment {showDetails ? '▼' : '▶'}
        </button>
      </div>
      {showDetails && (
        <div className="mt-2 ml-6 p-2 bg-slate-800 rounded text-[11px] text-slate-400 leading-relaxed">
          <div className="text-amber-400 mb-1">Additional constraints:</div>
          <div>• Sphere ↔ Sphere: centers must align</div>
          <div>• Cylinder ↔ Cylinder: centers must align</div>
          <div className="text-[10px] mt-1">(Tolerance: ~10% of cutter radius)</div>
        </div>
      )}
    </div>
  );
};
