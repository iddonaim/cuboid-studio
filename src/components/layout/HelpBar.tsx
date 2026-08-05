import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { useDecodeStore } from '../../store/useDecodeStore';
import { useIsMobile } from '../../hooks/useIsMobile';

// Help text is keyed by the *effective* surface (mode + sub-mode), not just
// the top-level AppMode. Assembly-editing and Pataphysical hints still apply when those
// surfaces are mounted as contextual sub-modes inside Encode and Evolution.
type HelpKey = 'encoding' | 'encoding-builder' | 'evolution-evolve' | 'evolution-pataphysical' | 'decode' | 'decode-sheet';

const ORTHO_HINT = ' • Ortho to switch projection';

const HELP_DESKTOP: Record<HelpKey, string> = {
  'decode':                'Read-only assembly • Middle-drag to pan • Right-drag to orbit' + ORTHO_HINT,
  'decode-sheet':          'Drag a part onto the sheet • Drag empty sheet to pan • Scroll to zoom • Space rotates • Delete removes • Fit to reframe',
  'encoding':              'Middle-drag to pan • Right-drag to orbit' + ORTHO_HINT,
  'encoding-builder':      'Editing seed • Click to place • Space to rotate • R to tip • Esc to release • Middle-drag to pan • Right-drag to orbit' + ORTHO_HINT,
  'evolution-evolve':      'Click cubes to select favorites • Middle-drag to pan • Right-drag to orbit' + ORTHO_HINT,
  // "Pick", not "enter": the description field was retired when the panel moved
  // to selecting a meme (from archthesis or an external image URL) and reading
  // its description off the meme itself. Matches the Translate button's own
  // empty state, "Pick a meme first".
  'evolution-pataphysical':'Pick a meme and click Translate • Middle-drag to pan • Right-drag to orbit' + ORTHO_HINT,
};

// Phone hints are kept to a single line. The desktop strings wrapped to two or
// three lines in the middle of a 390px canvas, which is a lot of screen to give
// a hint that is only useful for the first minute. The Ortho hint is dropped
// entirely — that pill is on screen a thumb's width away and says "ORTHO".
const HELP_TOUCH: Record<HelpKey, string> = {
  'decode':                'Read-only • 1 finger orbits • 2 fingers pan',
  'decode-sheet':          'Tap a part, then tap the sheet • Fit reframes',
  'encoding':              '1 finger orbits • 2 fingers pan/zoom',
  'encoding-builder':      'Editing seed • tap the grid, then Place',
  'evolution-evolve':      'Tap cubes to select favorites',
  'evolution-pataphysical':'Pick a meme, then Translate',
};

/** How long a touch hint stays up before fading out. */
const TOUCH_HINT_MS = 6000;

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
  const decodeStageView  = useDecodeStore(s => s.stageView);
  const hasCubes         = useBuilderStore(s => s.placedCubes.length > 0);
  const canvasHints      = useAppStore(s => s.canvasHints);
  const isMobile         = useIsMobile();

  const key: HelpKey =
    activeMode === 'decode'
      ? (decodeStageView === 'draw' ? 'decode-sheet' : 'decode')
      : activeMode === 'encoding'
        ? (seedEditOpen ? 'encoding-builder' : 'encoding')
        : (evolutionSubMode === 'pataphysical' ? 'evolution-pataphysical' : 'evolution-evolve');

  // On a phone the hint is a greeting, not a permanent fixture: it shows on
  // arrival at a surface and fades out. Switching mode or sub-mode brings the
  // (new) hint back. Desktop keeps it up — there is room for it there.
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    if (!isMobile) { setFaded(false); return; }
    setFaded(false);
    const timer = setTimeout(() => setFaded(true), TOUCH_HINT_MS);
    return () => clearTimeout(timer);
  }, [key, isMobile]);

  // Switched off in Preferences — the default at phone widths.
  if (!canvasHints) return null;

  return (
    <div
      // Nowrap on desktop only — on phone widths the longer hints overflow
      // past both screen edges, so let them wrap inside a capped pill instead.
      className={`absolute left-1/2 -translate-x-1/2 text-ink-500 text-[12px] pointer-events-none ${
        isMobile ? 'text-center' : 'whitespace-nowrap'
      }`}
      data-tour="help-bar"
      style={{
        // On the phone's notation sheet the assembly preview occupies the
        // bottom-right corner; the hint clears it rather than landing on it.
        bottom: isMobile ? (key === 'decode-sheet' && hasCubes ? 172 : 64) : 20,
        maxWidth: isMobile ? 'calc(100vw - 32px)' : undefined,
        opacity: faded ? 0 : 1,
        transition: 'opacity 0.5s ease-out',
        ...pillStyle,
      }}
    >
      {isMobile ? HELP_TOUCH[key] : HELP_DESKTOP[key]}
    </div>
  );
};
