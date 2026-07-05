import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { useIsMobile } from '../../hooks/useIsMobile';

// Help text is keyed by the *effective* surface (mode + sub-mode), not just
// the top-level AppMode. Builder and Pataphysical hints still apply when those
// surfaces are mounted as contextual sub-modes inside Encode and Evolution.
type HelpKey = 'encoding' | 'encoding-builder' | 'evolution-evolve' | 'evolution-pataphysical' | 'decode';

const ORTHO_HINT = ' \u2022 Ortho to switch projection';

const HELP_DESKTOP: Record<HelpKey, string> = {
  'decode':                'Read-only assembly \u2022 Middle-drag to pan \u2022 Right-drag to orbit' + ORTHO_HINT,
  'encoding':              'Middle-drag to pan \u2022 Right-drag to orbit' + ORTHO_HINT,
  'encoding-builder':      'Editing seed \u2022 Click to place \u2022 Space to rotate \u2022 R to tip \u2022 Esc to release \u2022 Middle-drag to pan \u2022 Right-drag to orbit' + ORTHO_HINT,
  'evolution-evolve':      'Click cubes to select favorites \u2022 Middle-drag to pan \u2022 Right-drag to orbit' + ORTHO_HINT,
  'evolution-pataphysical':'Enter a meme description and click Translate \u2022 Middle-drag to pan \u2022 Right-drag to orbit' + ORTHO_HINT,
};

const HELP_TOUCH: Record<HelpKey, string> = {
  'decode':                'Read-only assembly \u2022 One finger to orbit \u2022 Two fingers to pan/zoom' + ORTHO_HINT,
  'encoding':              'One finger to orbit \u2022 Two fingers to pan/zoom' + ORTHO_HINT,
  'encoding-builder':      'Editing seed \u2022 Tap grid to preview \u2022 Place to confirm \u2022 One finger to orbit \u2022 Two fingers to pan/zoom' + ORTHO_HINT,
  'evolution-evolve':      'Tap cubes to select favorites \u2022 Two fingers to pan/zoom' + ORTHO_HINT,
  'evolution-pataphysical':'One finger to orbit \u2022 Two fingers to pan/zoom' + ORTHO_HINT,
};

const pillStyle: React.CSSProperties = {
  background: 'hsl(var(--card) / 0.88)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  border: '1px solid hsl(var(--border))',
  boxShadow: '0 2px 16px hsl(45 9% 13% / 0.08)',
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
      className="absolute left-1/2 -translate-x-1/2 text-ink-500 text-[12px] pointer-events-none whitespace-nowrap"
      data-tour="help-bar"
      style={{
        bottom: isMobile ? 64 : 20,
        ...pillStyle,
      }}
    >
      {isMobile ? HELP_TOUCH[key] : HELP_DESKTOP[key]}
    </div>
  );
};
