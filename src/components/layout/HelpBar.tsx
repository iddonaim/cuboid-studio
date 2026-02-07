import React from 'react';
import { useAppStore } from '../../store/useAppStore';

const HELP_TEXT: Record<string, string> = {
  builder: 'Click to place \u2022 Space to rotate \u2022 R to tip \u2022 Esc to release \u2022 Right-drag to orbit',
  pataphysical: 'Enter a meme description and click Translate \u2022 Right-drag to orbit',
  encoding: 'Right-drag to orbit',
  evolution: 'Click cubes to select favorites \u2022 Right-drag to orbit',
};

export const HelpBar: React.FC = () => {
  const activeMode = useAppStore(s => s.activeMode);

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#0f172aCC',
      padding: '8px 16px',
      borderRadius: 8,
      color: '#64748b',
      fontSize: 11,
      pointerEvents: 'none',
    }}>
      {HELP_TEXT[activeMode]}
    </div>
  );
};
