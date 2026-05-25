import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Group, Image, Layer, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import { CanvasTile, useDecodeStore } from '../../store/useDecodeStore';
import { getSnapPoints } from '../../lib/decode/snapPoints';
import {
  ActiveSnap,
  findClosestSnap,
  SNAP_POINT_RADIUS,
  TILE_SIZE,
} from '../../lib/decode/snapUtils';
import { variation2dPath } from '../../lib/decode/variation2dPath';

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

const CanvasTileNode: React.FC<CanvasTileNodeProps> = ({
  tile,
  selected,
  activeSnap,
  onSelect,
  onDragMove,
  onDragEnd,
}) => {
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
          width={TILE_SIZE}
          height={TILE_SIZE}
          stroke="#3b82f6"
          strokeWidth={2}
          listening={false}
        />
      )}
      {snapPoints.map((sp, index) => (
        <Circle
          key={index}
          x={sp.x * TILE_SIZE}
          y={sp.y * TILE_SIZE}
          radius={SNAP_POINT_RADIUS}
          fill="#ef4444"
          opacity={isSnapPointActive(activeSnap, tile.id, index) ? 1 : 0.6}
          listening={false}
        />
      ))}
    </Group>
  );
};

export interface DecodeCanvasProps {
  onStageReady?: (stage: Konva.Stage | null) => void;
  placePendingAt?: (worldX: number, worldY: number) => void;
  isMobile?: boolean;
}

export const DecodeCanvas: React.FC<DecodeCanvasProps> = ({
  onStageReady,
  placePendingAt,
  isMobile = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 300, height: 240 });
  const [activeSnap, setActiveSnap] = useState<ActiveSnap | null>(null);

  const canvasTiles = useDecodeStore(s => s.canvasTiles);
  const selectedTileId = useDecodeStore(s => s.selectedTileId);
  const pendingPlacementVariationId = useDecodeStore(s => s.pendingPlacementVariationId);
  const moveTile = useDecodeStore(s => s.moveTile);
  const setSelectedTileId = useDecodeStore(s => s.setSelectedTileId);

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

  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1) {
      e.evt.preventDefault();
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

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target !== e.target.getStage()) return;

      if (isMobile && pendingPlacementVariationId && placePendingAt) {
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
      className="h-full w-full min-h-[180px] rounded-md border border-slate-800 bg-slate-950"
    >
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
        style={{ cursor: panRef.current.active ? 'grabbing' : 'default' }}
      >
        <Layer>
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
