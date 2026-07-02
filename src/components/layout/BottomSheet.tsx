import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { MobileTabBar, SheetHeight } from './MobileTabBar';

const MODE_LABELS: Record<string, string> = {
  encoding:  'Encode',
  evolution: 'Evolution',
  decode:    'Decode',
};

const HEIGHT_MAP: Record<SheetHeight, string> = {
  collapsed: '56px',
  half:      '50vh',
  full:      '88vh',
};

const NEXT_STATE: Record<SheetHeight, SheetHeight> = {
  collapsed: 'half',
  half:      'full',
  full:      'collapsed',
};

const glassStyle: React.CSSProperties = {
  background: 'hsl(var(--card) / 0.94)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderTop: '1px solid hsl(var(--border))',
  boxShadow: '0 -6px 32px hsl(45 9% 13% / 0.10)',
};

interface BottomSheetProps {
  children: React.ReactNode;
  /** Pin to the 56px collapsed (tab-bar-only) height and ignore drag/tap-to-expand.
   *  Used in Map mode, which has no sheet content of its own — letting it expand
   *  would just show an empty sheet and steal height from the map canvas. */
  forceCollapsed?: boolean;
}

/**
 * Mobile-only bottom sheet.
 *
 * In collapsed state (56 px) the visible surface is the MobileTabBar.
 * The drag-handle pill is absolutely positioned at the top of the sheet so it
 * doesn't consume flex height and stays tappable over the tab icons.
 *
 * In half / full states the sheet grows, the handle sits in normal flow at the
 * top, and scrollable content fills the middle.
 *
 * [transform:translateZ(0)] promotes the element to its own GPU compositing
 * layer so it always renders above the WebGL canvas on iOS Safari.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({ children, forceCollapsed = false }) => {
  const [heightState, setHeightState] = useState<SheetHeight>('collapsed');
  const activeMode       = useAppStore(s => s.activeMode);
  const seedEditOpen     = useEncodingStore(s => s.seedEditOpen);
  const evolutionSubMode = useEvolutionStore(s => s.subMode);
  const effectiveHeightState = forceCollapsed ? 'collapsed' : heightState;

  // Context-aware label that reflects the current sub-mode (e.g. Encode → Builder
  // while editing the merge seed, Evolution → Pataphysical while the sub-mode is
  // active). Falls back to the mode's own label.
  const contextLabel =
    activeMode === 'encoding' && seedEditOpen
      ? 'Encode → Builder'
      : activeMode === 'evolution' && evolutionSubMode === 'pataphysical'
        ? 'Evolution → Pataphysical'
        : MODE_LABELS[activeMode] ?? activeMode;

  const cycleHeight    = () => { if (!forceCollapsed) setHeightState(s => NEXT_STATE[s]); };
  const expandToHalf   = () => { if (!forceCollapsed && heightState === 'collapsed') setHeightState('half'); };
  const isCollapsed    = effectiveHeightState === 'collapsed';

  return (
    <div
      className="relative w-full flex flex-col flex-shrink-0 z-50 [transform:translateZ(0)]"
      style={{
        height: HEIGHT_MAP[effectiveHeightState],
        transition: 'height 0.38s cubic-bezier(0.32, 0.72, 0, 1)',
        ...glassStyle,
      }}
    >
      {/* ── Drag handle ─────────────────────────────────────────────────────
          Absolutely positioned when collapsed so it floats above the tab bar
          without consuming flex height. In expanded states it falls into
          normal flow at the top of the sheet.                              */}
      <button
        onClick={cycleHeight}
        aria-label="Cycle sheet height"
        className="flex justify-center items-start w-full bg-transparent border-none cursor-pointer flex-shrink-0"
        style={isCollapsed
          ? { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 6, paddingBottom: 4, zIndex: 1 }
          : { position: 'relative', paddingTop: 6, paddingBottom: 4 }}
      >
        <div
          className="rounded-full bg-ink-300"
          style={{ width: 36, height: 4 }}
        />
      </button>

      {/* ── Mode label (not collapsed) ──────────────────────────────────── */}
      {!isCollapsed && (
        <div className="px-4 py-1 flex-shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
            {contextLabel}
          </span>
        </div>
      )}

      {/* ── Scrollable content (not collapsed) ─────────────────────────── */}
      {!isCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 pb-3">
          {children}
        </div>
      )}

      {/* ── Tab bar — always visible ────────────────────────────────────── */}
      <MobileTabBar heightState={effectiveHeightState} onExpandToHalf={expandToHalf} />
    </div>
  );
};
