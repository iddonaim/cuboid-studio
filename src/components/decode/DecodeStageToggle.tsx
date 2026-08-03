import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useDecodeStore } from '../../store/useDecodeStore';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * Stage overlay — the way back to the notation sheet from the 3D assembly.
 *
 * Only mounts over the 3D. On the sheet the corner preview *is* the control:
 * it shows the assembly and opens it when clicked, so a pill saying "3D" next
 * to a live thumbnail of the 3D would be one affordance too many.
 *
 * Top-centre and in the accent, deliberately, rather than in the bottom-right
 * control column: it used to sit at exactly the Ortho pill's coordinates and
 * cover it, and a grey 52px pill down there reads as one more canvas setting
 * instead of the exit from a detour. The sheet is Decode's working surface, so
 * the way back to it is the loudest control on the 3D stage.
 *
 * The top offset differs per layout because the container does: on desktop the
 * stage is full-bleed behind the fixed TopBar, on mobile it already starts
 * below it.
 */
export const DecodeStageToggle: React.FC = () => {
  const stageView = useDecodeStore(s => s.stageView);
  const setStageView = useDecodeStore(s => s.setStageView);
  const isMobile = useIsMobile();
  if (stageView === 'draw') return null;

  return (
    <button
      type="button"
      onClick={() => setStageView('draw')}
      title="Back to the notation sheet"
      className="absolute left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 h-9 pl-3 pr-4 rounded-full border-0 bg-primary hover:bg-primary/85 text-white text-[13px] font-semibold shadow-[0_3px_12px_rgba(35,33,24,0.28)] transition-colors duration-100 cursor-pointer"
      style={{ top: isMobile ? 12 : 'calc(var(--topbar-h) + 12px)' }}
    >
      <ArrowLeft size={15} strokeWidth={2.25} />
      Notation sheet
    </button>
  );
};
