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
    // [transform:translateZ(0)] promotes this element onto its own GPU compositing
    // layer so it renders above the WebGL canvas on iOS Safari (WebGL can otherwise
    // float over regular HTML regardless of z-index due to GPU layer ordering).
    <div className="w-full bg-slate-900 border-t border-slate-700 z-50 flex-shrink-0 [transform:translateZ(0)]">
      {/* Expandable content */}
      <div
        className="overflow-hidden transition-[max-height] duration-[250ms] ease-in-out"
        style={{ maxHeight: expanded ? '55vh' : 0 }}
      >
        <div className="overflow-y-auto max-h-[55vh] px-4 pt-3 pb-1">
          {children}
        </div>
      </div>

      {/* Always-visible handle bar */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center w-full px-4 pt-[10px] gap-2.5 min-h-[44px] bg-transparent border-0 cursor-pointer"
        // paddingBottom uses CSS env() for iOS home-indicator safe area — cannot be expressed in Tailwind
        style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Drag indicator pill */}
        <div className="w-8 h-[3px] bg-slate-700 rounded-sm flex-shrink-0" />
        <span className="text-slate-400 text-[13px] font-semibold flex-1 text-left">
          {MODE_LABELS[activeMode] ?? activeMode}
        </span>
        <span className="text-slate-500 text-base leading-none flex-shrink-0">
          {expanded ? '▼' : '▲'}
        </span>
      </button>
    </div>
  );
};
