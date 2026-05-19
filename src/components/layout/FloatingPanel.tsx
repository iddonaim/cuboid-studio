import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppMode } from '../../store/useAppStore';

const TOP_BAR = 42;
const VIEWPORT_PADDING = 16;
const MIN_HEIGHT = 120;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 288;
const DRAG_EDGE = 12;
const RESIZE_EDGE = 8;

const MODE_LABELS: Record<AppMode, string> = {
  builder:      'Builder',
  pataphysical: 'Pataphysical',
  encoding:     'Encoding',
  evolution:    'Evolution',
};

const panelStyle: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 8px 48px rgba(0, 0, 0, 0.4)',
  touchAction: 'none',
};

const exportBorderStyle: React.CSSProperties = {
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
};

type Geometry = { top: number; left: number; width: number; height: number };
type Interaction = 'drag' | 'resize-top' | 'resize-bottom' | 'resize-right';

function initialGeometry(): Geometry {
  const top = 54;
  const left = 16;
  const width = DEFAULT_WIDTH;
  const height =
    typeof window !== 'undefined'
      ? window.innerHeight - top - VIEWPORT_PADDING
      : 600;
  return { top, left, width, height };
}

function maxPanelHeight(): number {
  return window.innerHeight - 54;
}

function clampHeight(h: number): number {
  return Math.max(MIN_HEIGHT, Math.min(maxPanelHeight(), h));
}

function clampWidth(w: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
}

function clampPosition(g: Geometry): Geometry {
  const maxTop = window.innerHeight - VIEWPORT_PADDING - g.height;
  const maxLeft = window.innerWidth - g.width;
  return {
    ...g,
    top: Math.max(TOP_BAR, Math.min(maxTop, g.top)),
    left: Math.max(0, Math.min(maxLeft, g.left)),
  };
}

function computeGeometry(
  kind: Interaction,
  start: Geometry,
  dx: number,
  dy: number,
): Geometry {
  switch (kind) {
    case 'drag':
      return clampPosition({
        ...start,
        top: start.top + dy,
        left: start.left + dx,
      });

    case 'resize-top': {
      let top = start.top + dy;
      let height = start.height - dy;

      if (height < MIN_HEIGHT) {
        top = start.top + start.height - MIN_HEIGHT;
        height = MIN_HEIGHT;
      } else if (height > maxPanelHeight()) {
        top = start.top + start.height - maxPanelHeight();
        height = maxPanelHeight();
      }

      if (top < TOP_BAR) {
        height -= TOP_BAR - top;
        top = TOP_BAR;
      }

      const maxBottom = window.innerHeight - VIEWPORT_PADDING;
      if (top + height > maxBottom) {
        height = maxBottom - top;
      }

      height = clampHeight(height);
      if (top + height > maxBottom) {
        top = maxBottom - height;
      }
      if (top < TOP_BAR) {
        top = TOP_BAR;
        height = Math.min(height, maxBottom - top);
      }

      return { ...start, top, height };
    }

    case 'resize-bottom': {
      let height = start.height + dy;
      height = clampHeight(height);

      const maxBottom = window.innerHeight - VIEWPORT_PADDING;
      if (start.top + height > maxBottom) {
        height = maxBottom - start.top;
      }
      height = Math.max(MIN_HEIGHT, height);

      return { ...start, height };
    }

    case 'resize-right': {
      let width = start.width + dx;
      width = clampWidth(width);
      if (start.left + width > window.innerWidth) {
        width = window.innerWidth - start.left;
      }
      return { ...start, width: clampWidth(width) };
    }

    default:
      return start;
  }
}

interface FloatingPanelProps {
  mode: AppMode;
  isOpen: boolean;
  children: React.ReactNode;
  exportSlot?: React.ReactNode;
}

/**
 * Desktop-only floating panel overlaid on the 3D viewport.
 * Move via left/right edge strips; resize via top/bottom/right edge strips.
 */
export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  mode,
  isOpen,
  children,
  exportSlot,
}) => {
  const [geometry, setGeometry] = useState<Geometry>(initialGeometry);
  const panelRef = useRef<HTMLDivElement>(null);
  const geomRef = useRef<Geometry>(geometry);
  const interactionRef = useRef<Interaction | null>(null);
  const startPtrRef = useRef({ x: 0, y: 0 });
  const startGeomRef = useRef<Geometry>(geometry);

  const applyToDom = useCallback((g: Geometry) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.top = `${g.top}px`;
    el.style.left = `${g.left}px`;
    el.style.width = `${g.width}px`;
    el.style.height = `${g.height}px`;
  }, []);

  useEffect(() => {
    geomRef.current = geometry;
    applyToDom(geometry);
  }, [geometry, applyToDom]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const kind = interactionRef.current;
    if (!kind) return;
    e.preventDefault();

    const dx = e.clientX - startPtrRef.current.x;
    const dy = e.clientY - startPtrRef.current.y;
    const next = computeGeometry(kind, startGeomRef.current, dx, dy);
    geomRef.current = next;
    applyToDom(next);
  }, [applyToDom]);

  const onPointerUp = useCallback(() => {
    if (!interactionRef.current) return;
    interactionRef.current = null;
    setGeometry({ ...geomRef.current });
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const beginInteraction = (e: React.PointerEvent, kind: Interaction) => {
    e.preventDefault();
    e.stopPropagation();

    interactionRef.current = kind;
    startPtrRef.current = { x: e.clientX, y: e.clientY };
    startGeomRef.current = { ...geomRef.current };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
  };

  if (!isOpen) return null;

  const edgeBase: React.CSSProperties = {
    position: 'absolute',
    touchAction: 'none',
  };

  return (
    <div
      ref={panelRef}
      className="absolute z-40 flex flex-col rounded-xl overflow-hidden"
      style={{
        top: geometry.top,
        left: geometry.left,
        width: geometry.width,
        height: geometry.height,
        ...panelStyle,
      }}
      onPointerDown={e => e.preventDefault()}
    >
      {/* Top edge — resize height */}
      <div
        role="separator"
        aria-orientation="horizontal"
        style={{
          ...edgeBase,
          top: 0,
          left: 0,
          right: 0,
          height: RESIZE_EDGE,
          cursor: 'ns-resize',
          zIndex: 30,
        }}
        onPointerDown={e => beginInteraction(e, 'resize-top')}
      />

      {/* Bottom edge — resize height */}
      <div
        role="separator"
        aria-orientation="horizontal"
        style={{
          ...edgeBase,
          bottom: 0,
          left: 0,
          right: 0,
          height: RESIZE_EDGE,
          cursor: 'ns-resize',
          zIndex: 30,
        }}
        onPointerDown={e => beginInteraction(e, 'resize-bottom')}
      />

      {/* Left edge — drag move */}
      <div
        style={{
          ...edgeBase,
          top: 0,
          left: 0,
          bottom: 0,
          width: DRAG_EDGE,
          cursor: 'move',
          zIndex: 20,
        }}
        onPointerDown={e => beginInteraction(e, 'drag')}
      />

      {/* Right edge — drag move (under width strip) */}
      <div
        style={{
          ...edgeBase,
          top: 0,
          right: 0,
          bottom: 0,
          width: DRAG_EDGE,
          cursor: 'move',
          zIndex: 20,
        }}
        onPointerDown={e => beginInteraction(e, 'drag')}
      />

      {/* Right edge — resize width (outer 8px wins over drag) */}
      <div
        role="separator"
        aria-orientation="vertical"
        style={{
          ...edgeBase,
          top: 0,
          right: 0,
          bottom: 0,
          width: RESIZE_EDGE,
          cursor: 'ew-resize',
          zIndex: 31,
        }}
        onPointerDown={e => beginInteraction(e, 'resize-right')}
      />

      {/* Header — display only */}
      <div
        className="flex items-center gap-2 flex-shrink-0 select-none pointer-events-none"
        style={{ padding: '11px 12px' }}
      >
        <div
          className="rounded-full flex-shrink-0"
          style={{ width: 5, height: 5, background: 'hsl(var(--accent))' }}
        />
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
          {MODE_LABELS[mode]}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-3">
        {children}
      </div>

      {/* Export strip */}
      {exportSlot != null && (
        <div className="flex-shrink-0 px-3 py-2" style={exportBorderStyle}>
          {exportSlot}
        </div>
      )}
    </div>
  );
};
