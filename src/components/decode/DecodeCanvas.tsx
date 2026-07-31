import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAccent } from '../../contexts/AccentContext';
import { Circle, Group, Image, Layer, Rect, Shape, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { CanvasTile, DecodeUnderlay, useDecodeStore } from '../../store/useDecodeStore';
import { getSnapPoints } from '../../lib/decode/snapPoints';
import {
  ActiveSnap,
  findClosestSnap,
  SNAP_POINT_RADIUS,
  TILE_SIZE,
} from '../../lib/decode/snapUtils';
import { variation2dPath } from '../../lib/decode/variation2dPath';
import { snapRotation } from '../../lib/decode/rotationSnap';
import {
  registerSheetCapture,
  sheetBounds,
  unregisterSheetCapture,
} from '../../lib/decode/decodeSheetExport';

const imageCache = new Map<string, HTMLImageElement>();

function useVariationImage(variationId: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(
    () => imageCache.get(variationId) ?? null,
  );

  useEffect(() => {
    const cached = imageCache.get(variationId);
    if (cached) {
      setImage(cached);
      return;
    }

    const img = new window.Image();
    img.src = variation2dPath(variationId);
    img.onload = () => {
      imageCache.set(variationId, img);
      setImage(img);
    };
  }, [variationId]);

  return image;
}

/** Locked plan underlay: renders beneath the tiles, in world coordinates, at
 *  its recorded registration. Non-interactive by design — tiles drag over it.
 *  Falls back to the persisted thumbnail (stretched to the registered size)
 *  when the full-res data URL is gone after a composition restore. */
const UnderlayImage: React.FC<{
  underlay: DecodeUnderlay;
  armed: boolean;
  onArm: () => void;
  onChange: (
    patch: Partial<Pick<DecodeUnderlay, 'offsetX' | 'offsetY' | 'rotation' | 'scale'>>,
  ) => void;
}> = ({ underlay, armed, onArm, onChange }) => {
  const src = underlay.dataUrl ?? underlay.thumbnailDataUrl;
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const nodeRef = useRef<Konva.Image | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.src = src;
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Attach the handles to this image once both exist.
  useEffect(() => {
    if (armed && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [armed, image]);

  if (!image) return null;

  const width = underlay.width * underlay.scale;
  const height = underlay.height * underlay.scale;

  return (
    <>
      <Image
        ref={nodeRef}
        image={image}
        x={underlay.offsetX}
        y={underlay.offsetY}
        rotation={underlay.rotation}
        width={width}
        height={height}
        opacity={underlay.opacity}
        // Deaf unless armed — this is what keeps a registered layer put.
        listening={armed}
        draggable={armed}
        onMouseDown={onArm}
        onDragEnd={e => onChange({ offsetX: e.target.x(), offsetY: e.target.y() })}
        onTransformEnd={() => {
          const node = nodeRef.current;
          if (!node) return;
          // The model carries ONE scale, so a layer can never be stretched out
          // of true: read back a single factor and reset the node's own scale.
          const factor = (node.scaleX() + node.scaleY()) / 2;
          const nextScale = underlay.scale * factor;
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            offsetX: node.x(),
            offsetY: node.y(),
            rotation: node.rotation(),
            scale: nextScale,
          });
        }}
      />
      {armed && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio
          // Corners only: uniform scale, no edge handles that would stretch.
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          rotationSnaps={[]}
          anchorSize={9}
          anchorCornerRadius={5}
          borderStroke="#BE4A21"
          borderDash={[4, 3]}
          anchorStroke="#BE4A21"
          anchorFill="#FDFCF9"
          // Magnetic rotation: continuous, latching only near a mark. Shift
          // suppresses it entirely for angles that must not be tidied.
          rotationSnapTolerance={0}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 12 || newBox.height < 12 ? oldBox : newBox)}
          onTransform={e => {
            const node = e.target as Konva.Node;
            const evt = (e as unknown as { evt?: MouseEvent }).evt;
            node.rotation(snapRotation(node.rotation(), Boolean(evt?.shiftKey)));
          }}
        />
      )}
    </>
  );
};


/** Minor / major grid spacing, in canvas world units. */
const GRID_MINOR = 24;
const GRID_MAJOR = GRID_MINOR * 4;

/**
 * The drafting lattice, drawn from the *current view* rather than as a fixed
 * patch of world. The old grid was a finite block of lines sized to the stage
 * at mount, anchored at the world origin — pan a little and you sailed off its
 * edge into blank white.
 *
 * One Konva Shape rather than a few hundred <Line> nodes: its sceneFunc reads
 * the live stage transform and strokes only what the viewport can see, so
 * panning and zooming redraw it for free without React re-reconciling a
 * thousand children every mouse-move.
 */
const InfiniteGrid: React.FC<{ width: number; height: number }> = ({ width, height }) => (
  <Shape
    listening={false}
    sceneFunc={(ctx, shape) => {
      const stage = shape.getStage();
      if (!stage) return;
      const scale = stage.scaleX() || 1;
      const left = -stage.x() / scale;
      const top = -stage.y() / scale;
      const right = left + width / scale;
      const bottom = top + height / scale;

      const rule = (step: number, color: string) => {
        // Skip a tier once its lines would be closer than a few pixels apart —
        // otherwise a zoomed-out sheet turns into mud.
        if (step * scale < 5) return;
        ctx.beginPath();
        for (let x = Math.floor(left / step) * step; x <= right; x += step) {
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
        }
        for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
        }
        ctx.strokeStyle = color;
        // Divide by scale so rules stay hairlines on screen at any zoom.
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      };

      rule(GRID_MINOR, '#ece9df');
      rule(GRID_MAJOR, '#d6d2c4');
    }}
  />
);

function isSnapPointActive(
  activeSnap: ActiveSnap | null,
  tileId: string,
  pointIndex: number,
): boolean {
  if (!activeSnap) return false;
  return (
    (activeSnap.draggedTileId === tileId && activeSnap.draggedPointIndex === pointIndex) ||
    (activeSnap.otherTileId === tileId && activeSnap.otherPointIndex === pointIndex)
  );
}

interface CanvasTileNodeProps {
  tile: CanvasTile;
  selected: boolean;
  activeSnap: ActiveSnap | null;
  onSelect: () => void;
  onDragMove: (tile: CanvasTile, active: ActiveSnap | null) => void;
  onDragEnd: (tile: CanvasTile, node: Konva.Group) => void;
}

const CanvasTileNode: React.FC<CanvasTileNodeProps> = (props) => {
  const { accent } = useAccent();
  const {
  tile,
  selected,
  activeSnap,
  onSelect,
  onDragMove,
  onDragEnd,
  } = props;
  const image = useVariationImage(tile.variationId);
  const snapPoints = getSnapPoints(tile.variationId);

  return (
    <Group
      x={tile.x + TILE_SIZE / 2}
      y={tile.y + TILE_SIZE / 2}
      offsetX={TILE_SIZE / 2}
      offsetY={TILE_SIZE / 2}
      rotation={tile.rotation * 90}
      draggable
      onClick={e => {
        e.cancelBubble = true;
        onSelect();
      }}
      onTap={e => {
        e.cancelBubble = true;
        onSelect();
      }}
      onDragMove={e => {
        const node = e.target as Konva.Group;
        const tempTile: CanvasTile = {
          ...tile,
          x: node.x() - TILE_SIZE / 2,
          y: node.y() - TILE_SIZE / 2,
        };
        const others = useDecodeStore.getState().canvasTiles.filter(t => t.id !== tile.id);
        onDragMove(tempTile, findClosestSnap(tempTile, others));
      }}
      onDragEnd={e => {
        onDragEnd(tile, e.target as Konva.Group);
      }}
    >
      <Rect
        width={TILE_SIZE}
        height={TILE_SIZE}
        fill="rgba(0,0,0,0)"
        listening
      />
      {image && (
        <Image
          image={image}
          width={TILE_SIZE}
          height={TILE_SIZE}
          listening={false}
        />
      )}
      {selected && (
        <Rect
          name="sheet-chrome"
          width={TILE_SIZE}
          height={TILE_SIZE}
          stroke={accent}
          strokeWidth={2}
          listening={false}
        />
      )}
      {snapPoints.map((sp, index) => (
        <Circle
          key={index}
          name="sheet-chrome"
          x={sp.x * TILE_SIZE}
          y={sp.y * TILE_SIZE}
          radius={SNAP_POINT_RADIUS}
          fill={accent}
          stroke="#ffffff"
          strokeWidth={1}
          opacity={isSnapPointActive(activeSnap, tile.id, index) ? 1 : 0.75}
          listening={false}
        />
      ))}
    </Group>
  );
};

export interface DecodeCanvasProps {
  onStageReady?: (stage: Konva.Stage | null) => void;
  isMobile?: boolean;
}

/**
 * The notation sheet. Self-contained: it owns its own drop target, tap-to-place
 * and view controls, and talks to the decode store directly — so it can mount
 * as the full-bleed stage without the sidebar having to thread a stage ref and
 * drop handler through to it.
 */
export const DecodeCanvas: React.FC<DecodeCanvasProps> = ({
  onStageReady,
  isMobile = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  // `measured` guards the first framing: the placeholder size below is a
  // stand-in until the ResizeObserver reports, and framing against it puts the
  // drawing somewhere off in the corner of the real canvas.
  const [size, setSize] = useState({ width: 300, height: 240 });
  const [measured, setMeasured] = useState(false);
  const [activeSnap, setActiveSnap] = useState<ActiveSnap | null>(null);

  const canvasTiles = useDecodeStore(s => s.canvasTiles);
  const underlays = useDecodeStore(s => s.underlays);
  const armedUnderlayId = useDecodeStore(s => s.armedUnderlayId);
  const setArmedUnderlayId = useDecodeStore(s => s.setArmedUnderlayId);
  const updateUnderlayRegistration = useDecodeStore(s => s.updateUnderlayRegistration);
  const selectedTileId = useDecodeStore(s => s.selectedTileId);
  const pendingPlacementVariationId = useDecodeStore(s => s.pendingPlacementVariationId);
  const moveTile = useDecodeStore(s => s.moveTile);
  const setSelectedTileId = useDecodeStore(s => s.setSelectedTileId);
  const addTile = useDecodeStore(s => s.addTile);
  const fitRequestId = useDecodeStore(s => s.fitRequestId);

  const panRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });
  const pinchRef = useRef<{
    initialDistance: number;
    initialScale: number;
    initialPos: { x: number; y: number };
    center: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
      setMeasured(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onStageReady?.(stageRef.current);
    return () => onStageReady?.(null);
  }, [onStageReady, size.width, size.height]);


  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    let newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.max(0.3, Math.min(3, newScale));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
    stage.batchDraw();
  }, []);

  const pannedRef = useRef(false);

  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Middle button pans anywhere; left button pans when grabbing empty
    // canvas (tiles handle their own dragging, so this never fights them).
    const emptyLeftDrag = e.evt.button === 0 && e.target === e.target.getStage();
    if (e.evt.button === 1 || emptyLeftDrag) {
      if (e.evt.button === 1) e.evt.preventDefault();
      pannedRef.current = false;
      panRef.current = { active: true, lastX: e.evt.clientX, lastY: e.evt.clientY };
    }
  }, []);

  const handleStageMouseUp = useCallback(() => {
    panRef.current.active = false;
  }, []);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!panRef.current.active) return;
    const stage = stageRef.current;
    if (!stage) return;

    const dx = e.evt.clientX - panRef.current.lastX;
    const dy = e.evt.clientY - panRef.current.lastY;
    panRef.current.lastX = e.evt.clientX;
    panRef.current.lastY = e.evt.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 0) pannedRef.current = true;

    stage.position({ x: stage.x() + dx, y: stage.y() + dy });
    stage.batchDraw();
  }, []);

  const touchDistance = (t1: Touch, t2: Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;

    const stage = stageRef.current;
    if (!stage) return;

    pinchRef.current = {
      initialDistance: touchDistance(touches[0], touches[1]),
      initialScale: stage.scaleX(),
      initialPos: { x: stage.x(), y: stage.y() },
      center: {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      },
    };
  }, []);

  const handleTouchMove = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2 || !pinchRef.current) return;
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const dist = touchDistance(touches[0], touches[1]);
    const scaleRatio = dist / pinchRef.current.initialDistance;
    let newScale = pinchRef.current.initialScale * scaleRatio;
    newScale = Math.max(0.3, Math.min(3, newScale));

    const center = {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };

    const rect = stage.container().getBoundingClientRect();
    const pointer = { x: center.x - rect.left, y: center.y - rect.top };
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });

    const dx = center.x - pinchRef.current.center.x;
    const dy = center.y - pinchRef.current.center.y;
    stage.position({ x: stage.x() + dx, y: stage.y() + dy });
    pinchRef.current.center = center;
    stage.batchDraw();
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
  }, []);

  const pointerToWorld = useCallback((stage: Konva.Stage): { x: number; y: number } | null => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const transform = stage.getAbsoluteTransform().copy().invert();
    return transform.point(pointer);
  }, []);

  /** Screen point → canvas world point, through the live stage transform. */
  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) return null;
    const rect = container.getBoundingClientRect();
    const transform = stage.getAbsoluteTransform().copy().invert();
    return transform.point({ x: clientX - rect.left, y: clientY - rect.top });
  }, []);

  const placePendingAt = useCallback(
    (worldX: number, worldY: number) => {
      if (!pendingPlacementVariationId) return;
      addTile({ variationId: pendingPlacementVariationId, x: worldX, y: worldY, rotation: 0 });
    },
    [addTile, pendingPlacementVariationId],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const variationId = e.dataTransfer.getData('text/variation-id');
      if (!variationId) return;
      const world = clientToWorld(e.clientX, e.clientY);
      if (!world) return;
      addTile({
        variationId,
        x: world.x - TILE_SIZE / 2,
        y: world.y - TILE_SIZE / 2,
        rotation: 0,
      });
    },
    [addTile, clientToWorld],
  );

  /** Frame the drawing (or return to the origin when there's nothing yet).
   *  With an unbounded sheet it's the way back from having panned into
   *  nowhere. */
  const fitView = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const tiles = useDecodeStore.getState().canvasTiles;
    if (tiles.length === 0) {
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: 0, y: 0 });
      stage.batchDraw();
      return;
    }
    const minX = Math.min(...tiles.map(t => t.x));
    const minY = Math.min(...tiles.map(t => t.y));
    const maxX = Math.max(...tiles.map(t => t.x)) + TILE_SIZE;
    const maxY = Math.max(...tiles.map(t => t.y)) + TILE_SIZE;
    const pad = TILE_SIZE * 0.5;
    const scale = Math.max(
      0.3,
      Math.min(3, Math.min(
        size.width / (maxX - minX + pad * 2),
        size.height / (maxY - minY + pad * 2),
      )),
    );
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: size.width / 2 - ((minX + maxX) / 2) * scale,
      y: size.height / 2 - ((minY + maxY) / 2) * scale,
    });
    stage.batchDraw();
  }, [size.width, size.height]);

  // The sheet is unbounded in every direction, and tiles routinely sit at
  // negative coordinates (a snap can grow the composition up and to the left).
  // Parking the world origin in the middle of the viewport rather than its
  // top-left corner means new work lands in view instead of off the edge.
  const framedRef = useRef(false);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || framedRef.current || !measured) return;
    framedRef.current = true;
    if (useDecodeStore.getState().canvasTiles.length > 0) {
      fitView();
    } else {
      stage.position({ x: size.width / 2, y: size.height / 2 });
      stage.batchDraw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, size.width, size.height]);

  /**
   * Transparent PNG of the drawing itself: the drafting chrome is hidden, the
   * stage is temporarily reset to 1:1 at the drawing's corner so the crop is
   * in predictable coordinates, and everything is put back afterwards. Nothing
   * paints the canvas background (the paper is CSS on the container), so what
   * comes out is a cut-out.
   */
  useEffect(() => {
    registerSheetCapture((options) => {
      const stage = stageRef.current;
      if (!stage) return null;
      const tiles = useDecodeStore.getState().canvasTiles;
      const bounds = sheetBounds(tiles);
      if (!bounds) return null;

      const prev = { pos: stage.position(), scale: stage.scaleX() };
      const chrome = stage.find('.sheet-chrome');
      chrome.forEach(node => node.visible(false));
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: -bounds.minX, y: -bounds.minY });
      stage.draw();
      try {
        return stage.toDataURL({
          x: 0,
          y: 0,
          width: bounds.width,
          height: bounds.height,
          pixelRatio: options?.pixelRatio ?? 3,
        });
      } finally {
        chrome.forEach(node => node.visible(true));
        stage.scale({ x: prev.scale, y: prev.scale });
        stage.position(prev.pos);
        stage.draw();
      }
    });
    return () => unregisterSheetCapture();
  }, []);

  const firstFitRequest = useRef(fitRequestId);
  useEffect(() => {
    if (fitRequestId === firstFitRequest.current) return;
    fitView();
  }, [fitRequestId, fitView]);

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target !== e.target.getStage()) return;
      // A drag-pan that ended on the stage is not a click
      if (pannedRef.current) { pannedRef.current = false; return; }

      if (isMobile && pendingPlacementVariationId) {
        const stage = stageRef.current;
        if (!stage) return;
        const world = pointerToWorld(stage);
        if (!world) return;
        placePendingAt(world.x - TILE_SIZE / 2, world.y - TILE_SIZE / 2);
        return;
      }

      setSelectedTileId(null);
    },
    [isMobile, pendingPlacementVariationId, placePendingAt, pointerToWorld, setSelectedTileId],
  );

  const handleDragEnd = useCallback(
    (tile: CanvasTile, node: Konva.Group) => {
      let newX = node.x() - TILE_SIZE / 2;
      let newY = node.y() - TILE_SIZE / 2;

      const tempTile: CanvasTile = { ...tile, x: newX, y: newY };
      const others = canvasTiles.filter(t => t.id !== tile.id);
      const snap = findClosestSnap(tempTile, others);

      if (snap) {
        newX += snap.dx;
        newY += snap.dy;
        node.position({ x: newX + TILE_SIZE / 2, y: newY + TILE_SIZE / 2 });
      }

      moveTile(tile.id, newX, newY);
      setActiveSnap(null);
    },
    [canvasTiles, moveTile],
  );

  return (
    <div
      ref={containerRef}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      className="relative h-full w-full min-h-[180px] overflow-hidden bg-white"
    >
      <button
        type="button"
        onClick={fitView}
        title={canvasTiles.length > 0 ? 'Frame the drawing' : 'Back to the origin'}
        className="absolute bottom-3 right-3 z-10 h-7 px-2.5 rounded-full border border-ink-200 bg-ink-100 font-mono text-[11px] uppercase tracking-wide text-ink-600 shadow-[0_2px_8px_rgba(35,33,24,0.18)] hover:text-ink-800"
      >
        Fit
      </button>
      {canvasTiles.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
          <p className="text-[12px] text-ink-500">
            {isMobile
              ? 'Select a part above, then tap here to place it'
              : 'Drag a part from the strip above onto this canvas'}
          </p>
        </div>
      )}
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseUp={handleStageMouseUp}
        onMouseMove={handleStageMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleStageClick}
        onTap={handleStageClick}
        style={{ cursor: panRef.current.active ? 'grabbing' : 'grab', background: '#ffffff' }}
      >
        <Layer name="sheet-chrome" listening={false}>
          <InfiniteGrid width={size.width} height={size.height} />
        </Layer>
        {underlays.length > 0 && (
          // Index 0 is the top of the stack (as the layers list reads it), so
          // the array is drawn in reverse. `sheet-chrome` keeps underlays out
          // of exported PNGs, same as the grid.
          <Layer name="sheet-chrome" listening={!!armedUnderlayId}>
            {[...underlays].reverse().map(layer => (
              layer.visible ? (
                <UnderlayImage
                  key={layer.id}
                  underlay={layer}
                  armed={armedUnderlayId === layer.id}
                  onArm={() => setArmedUnderlayId(layer.id)}
                  onChange={patch => updateUnderlayRegistration(layer.id, patch)}
                />
              ) : null
            ))}
          </Layer>
        )}
        {/* Tiles stand down while an underlay is armed: a stray drag can't
            grab a transparent glyph instead of the image, and vice versa. */}
        <Layer listening={!armedUnderlayId}>
          {canvasTiles.map(tile => (
            <CanvasTileNode
              key={tile.id}
              tile={tile}
              selected={selectedTileId === tile.id}
              activeSnap={activeSnap}
              onSelect={() => setSelectedTileId(tile.id)}
              onDragMove={(_, snap) => setActiveSnap(snap)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
};
