import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { MobileTabBar, SheetHeight } from './MobileTabBar';

const MODE_LABELS: Record<string, string> = {
  builder:      'Builder',
  pataphysical: 'Pataphysical',
  encoding:     'Encoding',
  evolution:    'Evolution',
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
  background: 'rgba(15, 23, 42, 0.2)',
  borderTop: '1px solid rgba(255, 255, 255, 0.12)',
  boxShadow: '0 -8px 48px rgba(0,0,0,0.4)',
};

interface BottomSheetProps {
  children: React.ReactNode;
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
export const BottomSheet: React.FC<BottomSheetProps> = ({ children }) => {
  const [heightState, setHeightState] = useState<SheetHeight>('collapsed');
  const activeMode = useAppStore(s => s.activeMode);

  const cycleHeight    = () => setHeightState(s => NEXT_STATE[s]);
  const expandToHalf   = () => { if (heightState === 'collapsed') setHeightState('half'); };
  const isCollapsed    = heightState === 'collapsed';

  return (
    <div
      className="relative w-full flex flex-col flex-shrink-0 z-50 [transform:translateZ(0)]"
      style={{
        height: HEIGHT_MAP[heightState],
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
          className="rounded-full bg-slate-600"
          style={{ width: 36, height: 4 }}
        />
      </button>

      {/* ── Mode label (not collapsed) ──────────────────────────────────── */}
      {!isCollapsed && (
        <div className="px-4 py-1 flex-shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            {MODE_LABELS[activeMode] ?? activeMode}
          </span>
        </div>
      )}

      {/* ── Scrollable content (not collapsed) ─────────────────────────── */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-3">
          {children}
        </div>
      )}

      {/* ── Tab bar — always visible ────────────────────────────────────── */}
      <MobileTabBar heightState={heightState} onExpandToHalf={expandToHalf} />
    </div>
  );
};
