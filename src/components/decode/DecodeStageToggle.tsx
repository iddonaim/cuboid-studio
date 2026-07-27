import React from 'react';
import { useDecodeStore } from '../../store/useDecodeStore';

/**
 * Stage overlay — swaps the Decode stage between the notation sheet and the
 * assembly it notates. Styled to match the Ortho pill so the two read as the
 * same class of canvas control, and sits where Ortho sits in other modes
 * (Decode has no camera toggle, so the slot is free).
 */
export const DecodeStageToggle: React.FC = () => {
  const stageView = useDecodeStore(s => s.stageView);
  const toggleStageView = useDecodeStore(s => s.toggleStageView);
  const drawing = stageView === 'draw';

  return (
    <button
      type="button"
      onClick={toggleStageView}
      title={drawing ? 'Show the 3D assembly' : 'Back to the notation sheet'}
      aria-pressed={!drawing}
      className="absolute bottom-[132px] right-3 z-10 h-7 min-w-[52px] px-2 rounded-full border border-ink-200 bg-ink-100 font-mono text-[11px] uppercase tracking-wide text-ink-600 shadow-[0_2px_8px_rgba(35,33,24,0.18)] transition-colors duration-100 cursor-pointer hover:text-ink-800"
    >
      {drawing ? '3D' : 'Sheet'}
    </button>
  );
};
