import React from 'react';
import { useDecodeStore } from '../../store/useDecodeStore';

/**
 * Stage overlay — the way back to the notation sheet from the 3D assembly.
 *
 * Only mounts over the 3D. On the sheet the corner preview *is* the control:
 * it shows the assembly and opens it when clicked, so a pill saying "3D" next
 * to a live thumbnail of the 3D would be one affordance too many.
 *
 * Styled to match the Ortho pill so the two read as the same class of canvas
 * control, and sits where Ortho sits in other modes.
 */
export const DecodeStageToggle: React.FC = () => {
  const stageView = useDecodeStore(s => s.stageView);
  const setStageView = useDecodeStore(s => s.setStageView);
  if (stageView === 'draw') return null;

  return (
    <button
      type="button"
      onClick={() => setStageView('draw')}
      title="Back to the notation sheet"
      className="absolute bottom-[132px] right-3 z-10 h-7 min-w-[52px] px-2 rounded-full border border-ink-200 bg-ink-100 font-mono text-[11px] uppercase tracking-wide text-ink-600 shadow-[0_2px_8px_rgba(35,33,24,0.18)] transition-colors duration-100 cursor-pointer hover:text-ink-800"
    >
      Sheet
    </button>
  );
};
