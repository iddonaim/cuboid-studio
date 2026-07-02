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
      className={`absolute bottom-[132px] right-3 z-10 h-7 min-w-[52px] px-2 rounded-full border border-ink-200 font-mono text-[10px] uppercase tracking-wide shadow-[0_2px_8px_rgba(35,33,24,0.18)] transition-colors duration-100 ${
        orthographic
          ? 'bg-ink-200 text-ink-900 cursor-pointer'
          : 'bg-ink-100 text-ink-600 cursor-pointer hover:text-ink-700'
      }`}
    >
      Ortho
    </button>
  );
};
