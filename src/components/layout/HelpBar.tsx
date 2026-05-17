import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useIsMobile } from '../../hooks/useIsMobile';

const HELP_DESKTOP: Record<string, string> = {
  builder:      'Click to place \u2022 Space to rotate \u2022 R to tip \u2022 Esc to release \u2022 Right-drag to orbit',
  pataphysical: 'Enter a meme description and click Translate \u2022 Right-drag to orbit',
  encoding:     'Right-drag to orbit',
  evolution:    'Click cubes to select favorites \u2022 Right-drag to orbit',
};

const HELP_TOUCH: Record<string, string> = {
  builder:      'Tap to place \u2022 One finger to orbit \u2022 Pinch to zoom',
  pataphysical: 'One finger to orbit \u2022 Pinch to zoom',
  encoding:     'One finger to orbit \u2022 Pinch to zoom',
  evolution:    'Tap cubes to select favorites \u2022 Pinch to zoom',
};

export const HelpBar: React.FC = () => {
  const activeMode = useAppStore(s => s.activeMode);
  const isMobile = useIsMobile();

  return (
    <div className={`absolute ${isMobile ? 'bottom-[60px]' : 'bottom-4'} left-1/2 -translate-x-1/2 bg-background/80 py-2 px-4 rounded-lg text-slate-500 text-[11px] pointer-events-none whitespace-nowrap`}>
      {isMobile ? HELP_TOUCH[activeMode] : HELP_DESKTOP[activeMode]}
    </div>
  );
};
