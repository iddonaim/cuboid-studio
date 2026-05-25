import React from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * Canvas overlay — toggles true orthographic projection.
 * Sits above the capture button, left of the view cube HUD.
 */
export const ViewportCameraToggle: React.FC = () => {
  const orthographic = useAppStore(s => s.orthographic);
  const toggleOrthographic = useAppStore(s => s.toggleOrthographic);

  return (
    <button
      type="button"
      onClick={toggleOrthographic}
      title={orthographic ? 'Switch to perspective' : 'Switch to orthographic'}
      aria-pressed={orthographic}
      className={`absolute bottom-[132px] right-3 z-10 h-7 min-w-[52px] px-2 rounded-full border border-slate-700 font-mono text-[10px] uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-colors duration-100 ${
        orthographic
          ? 'bg-slate-200 text-slate-900 cursor-pointer'
          : 'bg-slate-950 text-slate-400 cursor-pointer hover:text-slate-300'
      }`}
    >
      Ortho
    </button>
  );
};
