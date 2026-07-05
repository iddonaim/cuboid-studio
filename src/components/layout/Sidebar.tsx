import React, { useCallback, useRef } from 'react';
import {
  AppMode,
  useAppStore,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from '../../store/useAppStore';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';

const TOP_BAR = 42;

const MODE_LABELS: Record<AppMode, string> = {
  map:       'Map',
  encoding:  'Encode',
  evolution: 'Evolution',
  decode:    'Decode',
};

interface SidebarProps {
  mode: AppMode;
  isOpen: boolean;
  children: React.ReactNode;
  /** Utilities strip pinned below the scrolling content (Export etc.). */
  exportSlot?: React.ReactNode;
}

/**
 * Desktop-only docked sidebar: fixed to the left edge, full height under the
 * TopBar. Width is user-resizable via the right-edge handle (persisted);
 * visibility is toggled by the TopBar panel button or Cmd/Ctrl+B.
 */
export const Sidebar: React.FC<SidebarProps> = ({ mode, isOpen, children, exportSlot }) => {
  const seedEditOpen     = useEncodingStore(s => s.seedEditOpen);
  const evolutionSubMode = useEvolutionStore(s => s.subMode);
  const width            = useAppStore(s => s.sidebarWidth);
  const setWidth         = useAppStore(s => s.setSidebarWidth);

  const contextLabel =
    mode === 'encoding' && seedEditOpen
      ? 'Encode → Builder'
      : mode === 'evolution' && evolutionSubMode === 'pataphysical'
        ? 'Evolution → Pataphysical'
        : MODE_LABELS[mode];

  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    e.preventDefault();
    setWidth(drag.startWidth + (e.clientX - drag.startX));
  }, [setWidth]);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const beginResize = (e: React.PointerEvent) => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: width };
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
  };

  if (!isOpen) return null;

  return (
    <aside
      className="absolute left-0 z-40 flex flex-col"
      style={{
        top: TOP_BAR,
        bottom: 0,
        width,
        minWidth: SIDEBAR_MIN_WIDTH,
        maxWidth: SIDEBAR_MAX_WIDTH,
        background: 'hsl(var(--card))',
        borderRight: '1px solid hsl(var(--border))',
        boxShadow: '2px 0 16px hsl(45 9% 13% / 0.05)',
      }}
    >
      {/* Header — context label */}
      <div className="flex items-center gap-2 flex-shrink-0 select-none" style={{ padding: '11px 12px' }}>
        <div
          className="rounded-full flex-shrink-0"
          style={{ width: 5, height: 5, background: 'hsl(var(--primary))' }}
        />
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
          {contextLabel}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-3 pb-3">
        {children}
      </div>

      {/* Utilities strip */}
      {exportSlot != null && (
        <div
          className="flex-shrink-0 px-3 py-2 max-h-[45%] overflow-y-auto"
          style={{ borderTop: '1px solid hsl(var(--border))' }}
        >
          {exportSlot}
        </div>
      )}

      {/* Right-edge resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        className="absolute top-0 bottom-0 -right-[3px] w-[6px] cursor-ew-resize hover:bg-primary/25 active:bg-primary/40 transition-colors"
        style={{ touchAction: 'none', zIndex: 10 }}
        onPointerDown={beginResize}
      />
    </aside>
  );
};
