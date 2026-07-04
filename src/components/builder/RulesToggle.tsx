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
          className="data-[state=checked]:bg-primary"
        />
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`text-[13px] cursor-pointer underline decoration-dotted ${enabled ? 'text-green-600' : 'text-ink-600'}`}
        >
          Rules {showDetails ? '▼' : '▶'}
        </button>
      </div>
      {showDetails && (
        <div className="mt-2 ml-6 p-2 bg-ink-100 rounded text-[12px] text-ink-600 leading-relaxed">
          <div className="text-green-600">✓ Door ↔ Door (sphere↔sphere)</div>
          <div className="text-green-600">✓ Window ↔ Window (cylinder↔cylinder)</div>
          <div className="text-destructive">✗ Wall ↔ anything (blocks growth)</div>
          <div className="text-destructive">✗ Door ↔ Window</div>
        </div>
      )}
    </div>
  );
};
