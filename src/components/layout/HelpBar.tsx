import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { useIsMobile } from '../../hooks/useIsMobile';

// Help text is keyed by the *effective* surface (mode + sub-mode), not just
// the top-level AppMode. Builder and Pataphysical hints still apply when those
// surfaces are mounted as contextual sub-modes inside Encode and Evolution.
type HelpKey = 'encoding' | 'encoding-builder' | 'evolution-evolve' | 'evolution-pataphysical' | 'decode';

const HELP_DESKTOP: Record<HelpKey, string> = {
  'decode':                'Read-only assembly \u2022 Right-drag to orbit',
  'encoding':              'Right-drag to orbit',
  'encoding-builder':      'Editing seed \u2022 Click to place \u2022 Space to rotate \u2022 R to tip \u2022 Esc to release \u2022 Right-drag to orbit',
  'evolution-evolve':      'Click cubes to select favorites \u2022 Right-drag to orbit',
  'evolution-pataphysical':'Enter a meme description and click Translate \u2022 Right-drag to orbit',
};

const HELP_TOUCH: Record<HelpKey, string> = {
  'decode':                'Read-only assembly \u2022 One finger to orbit \u2022 Pinch to zoom',
  'encoding':              'One finger to orbit \u2022 Pinch to zoom',
  'encoding-builder':      'Editing seed \u2022 Tap to place \u2022 One finger to orbit \u2022 Pinch to zoom',
  'evolution-evolve':      'Tap cubes to select favorites \u2022 Pinch to zoom',
  'evolution-pataphysical':'One finger to orbit \u2022 Pinch to zoom',
};

const pillStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  boxShadow: '0 8px 48px rgba(0,0,0,0.4)',
  borderRadius: 20,
  padding: '4px 13px',
};

export const HelpBar: React.FC = () => {
  const activeMode       = useAppStore(s => s.activeMode);
  const seedEditOpen     = useEncodingStore(s => s.seedEditOpen);
  const evolutionSubMode = useEvolutionStore(s => s.subMode);
  const isMobile         = useIsMobile();

  const key: HelpKey =
    activeMode === 'decode'
      ? 'decode'
      : activeMode === 'encoding'
        ? (seedEditOpen ? 'encoding-builder' : 'encoding')
        : (evolutionSubMode === 'pataphysical' ? 'evolution-pataphysical' : 'evolution-evolve');

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 text-slate-500 text-[11px] pointer-events-none whitespace-nowrap"
      style={{
        bottom: isMobile ? 64 : 20,
        ...pillStyle,
      }}
    >
      {isMobile ? HELP_TOUCH[key] : HELP_DESKTOP[key]}
    </div>
  );
};
