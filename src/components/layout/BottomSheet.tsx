import React, { useCallback, useRef, useState } from 'react';
import { useAppStore, AppMode } from '../../store/useAppStore';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { MobileTabBar, SheetHeight } from './MobileTabBar';

const MODE_LABELS: Record<string, string> = {
  encoding:  'Encode',
  evolution: 'Evolution',
  decode:    'Decode',
};

// Snap heights live in index.css (.sheet-h-*) so half/full can use dvh with a
// vh fallback — inline styles can't express that fallback pair.
const HEIGHT_CLASS: Record<SheetHeight, string> = {
  collapsed: 'sheet-h-collapsed',
  half:      'sheet-h-half',
  full:      'sheet-h-full',
};

const COLLAPSED_PX = 56;

/** Current px value of each snap state, from the live visual viewport. */
const snapHeightsPx = (): Record<SheetHeight, number> => {
  const vh = window.visualViewport?.height ?? window.innerHeight;
  return { collapsed: COLLAPSED_PX, half: vh * 0.5, full: vh * 0.88 };
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
 * The handle supports both interactions: tap cycles collapsed → half → full,
 * and dragging follows the finger live, then snaps to the nearest state on
 * release (pointer events + setPointerCapture, so the drag keeps tracking
 * even when the finger leaves the handle).
 *
 * [transform:translateZ(0)] promotes the element to its own GPU compositing
 * layer so it always renders above the WebGL canvas on iOS Safari.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({ children, forceCollapsed = false }) => {
  // Live px height while a drag is in progress; null when settled on a snap.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const activeMode       = useAppStore(s => s.activeMode);
  const seedEditOpen     = useEncodingStore(s => s.seedEditOpen);
  const evolutionSubMode = useEvolutionStore(s => s.subMode);

  // ── Sheet height, remembered per mode ──────────────────────────────────────
  // Tapping a tab used to snap the sheet back to half however you had left it,
  // so "get out of the way, I want to see the model" was undone by the very
  // next tab tap — and half the canvas went with it. Each mode now keeps the
  // height you last left it at. A mode you haven't opened yet still starts at
  // half: that is where its controls are, and they should be visible on
  // arrival. Session-only, deliberately — this is transient framing, not a
  // preference worth carrying into tomorrow.
  const [heightByMode, setHeightByMode] = useState<Partial<Record<AppMode, SheetHeight>>>({});
  const heightState = heightByMode[activeMode] ?? 'half';
  const setHeightState = useCallback(
    (next: SheetHeight | ((prev: SheetHeight) => SheetHeight)) => {
      setHeightByMode(prev => ({
        ...prev,
        [activeMode]: typeof next === 'function' ? next(prev[activeMode] ?? 'half') : next,
      }));
    },
    [activeMode],
  );

  const effectiveHeightState = forceCollapsed ? 'collapsed' : heightState;

  // Context-aware label that reflects the current sub-mode (e.g. Encode → Edit assembly
  // while editing the merge seed, Evolution → Pataphysical while the sub-mode is
  // active). Falls back to the mode's own label.
  const contextLabel =
    activeMode === 'encoding' && seedEditOpen
      ? 'Encode → Edit assembly'
      : activeMode === 'evolution' && evolutionSubMode === 'pataphysical'
        ? 'Evolution → Pataphysical'
        : MODE_LABELS[activeMode] ?? activeMode;

  const cycleHeight = () => {
    // A drag that just ended also fires click on the handle — swallow it so
    // releasing a drag doesn't immediately jump to the next snap state.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!forceCollapsed) setHeightState(s => NEXT_STATE[s]);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (forceCollapsed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startHeight: containerRef.current?.getBoundingClientRect().height ?? snapHeightsPx()[heightState],
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = drag.startY - e.clientY; // finger up = positive = taller sheet
    if (!drag.moved && Math.abs(dy) < 6) return; // still a tap until it isn't
    drag.moved = true;
    const { full } = snapHeightsPx();
    setDragHeight(Math.min(Math.max(drag.startHeight + dy, COLLAPSED_PX), full));
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!drag.moved) return; // plain tap — let the click handler cycle
    suppressClickRef.current = true;
    const releasedAt = drag.startHeight + (drag.startY - e.clientY);
    const snaps = snapHeightsPx();
    const nearest = (Object.keys(snaps) as SheetHeight[]).reduce((best, s) =>
      Math.abs(snaps[s] - releasedAt) < Math.abs(snaps[best] - releasedAt) ? s : best
    );
    setHeightState(nearest);
    setDragHeight(null);
  };

  const isDragging  = dragHeight !== null && !forceCollapsed;
  const isCollapsed = effectiveHeightState === 'collapsed' && !isDragging;

  return (
    <div
      ref={containerRef}
      className={`relative w-full flex flex-col flex-shrink-0 z-50 [transform:translateZ(0)] ${
        isDragging ? '' : HEIGHT_CLASS[effectiveHeightState]
      }`}
      data-tour="bottom-sheet"
      style={{
        ...(isDragging ? { height: dragHeight } : null),
        transition: isDragging ? 'none' : 'height 0.38s cubic-bezier(0.32, 0.72, 0, 1)',
        ...glassStyle,
      }}
    >
      {/* ── Drag handle ─────────────────────────────────────────────────────
          Absolutely positioned when collapsed so it floats above the tab bar
          without consuming flex height. In expanded states it falls into
          normal flow at the top of the sheet.                              */}
      <button
        onClick={cycleHeight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        aria-label="Drag or tap to resize sheet"
        className="flex justify-center items-start w-full bg-transparent border-none cursor-grab flex-shrink-0"
        style={{
          touchAction: 'none', // the drag *is* the gesture — no browser panning
          ...(isCollapsed
            ? { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 6, paddingBottom: 4, zIndex: 1 }
            : { position: 'relative', paddingTop: 6, paddingBottom: 4 }),
        }}
      >
        <div
          className="rounded-full bg-ink-300"
          style={{ width: 36, height: 4 }}
        />
      </button>

      {/* ── Mode label (not collapsed) ──────────────────────────────────── */}
      {!isCollapsed && (
        <div className="px-4 py-1 flex-shrink-0">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
            {contextLabel}
          </span>
        </div>
      )}

      {/* ── Scrollable content (not collapsed) ─────────────────────────── */}
      {!isCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto overscroll-contain px-4 pb-3">
          {children}
        </div>
      )}

      {/* ── Tab bar — always visible ────────────────────────────────────── */}
      <MobileTabBar />
    </div>
  );
};
