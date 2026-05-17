import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';

interface RulesToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export const RulesToggle: React.FC<RulesToggleProps> = ({ enabled, onChange }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={enabled}
          onCheckedChange={onChange}
          id="rules-toggle"
          className="data-[state=checked]:bg-green-600"
        />
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`text-xs cursor-pointer underline decoration-dotted ${enabled ? 'text-green-500' : 'text-slate-400'}`}
        >
          Rules {showDetails ? '▼' : '▶'}
        </button>
      </div>
      {showDetails && (
        <div className="mt-2 ml-6 p-2 bg-slate-800 rounded text-[11px] text-slate-400 leading-relaxed">
          <div className="text-green-500">✓ Door ↔ Door (sphere↔sphere)</div>
          <div className="text-green-500">✓ Window ↔ Window (cylinder↔cylinder)</div>
          <div className="text-red-500">✗ Wall ↔ anything (blocks growth)</div>
          <div className="text-red-500">✗ Door ↔ Window</div>
        </div>
      )}
    </div>
  );
};
