import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasTile, TileRotation } from '../../store/useDecodeStore';
import { RotateCw, X } from 'lucide-react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useDecodeStore } from '../../store/useDecodeStore';
import { downloadDecodeCompositionDxf } from '../../lib/decode/decodeDxfExport';
import { importPlanUnderlay } from '../../lib/decode/planUnderlay';
import { TILE_SIZE, worldSnapPoints } from '../../lib/decode/snapUtils';
import { variation2dPath } from '../../lib/decode/variation2dPath';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ActiveSiteChip } from '../layout/ActiveSiteChip';

const ALL_VARIATIONS = Array.from({ length: 70 }, (_, i) =>
  `v-${String(i).padStart(2, '0')}`,
);

function dedupeVariationsFromAssembly(placedCubes: { variationId: string }[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const cube of placedCubes) {
    if (seen.has(cube.variationId)) continue;
    seen.add(cube.variationId);
    result.push(cube.variationId);
  }
  return result;
}

/** One labelled numeric field of the underlay registration row. */
const RegistrationField: React.FC<{
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, step = 1, onChange }) => (
  <label className="flex items-center gap-1 text-[11px] text-ink-500">
    {label}
    <input
      type="number"
      step={step}
      value={Number(value.toFixed(step < 1 ? 3 : 1))}
      onChange={e => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-[64px] px-1 py-0.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-[11px] box-border"
    />
  </label>
);

const DrawerTile: React.FC<{
  variationId: string;
  selected: boolean;
  isMobile: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
}> = ({ variationId, selected, isMobile, onSelect, onDragStart }) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      type="button"
      draggable={!isMobile}
      onDragStart={onDragStart}
      onClick={onSelect}
      className={`flex-shrink-0 w-[88px] rounded-md border p-1.5 transition-colors ${
        selected
          ? 'border-primary bg-ink-100 ring-2 ring-primary/40'
          : 'border-ink-300 bg-ink-100/80 hover:border-ink-400'
      } ${!isMobile ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <div className="aspect-square w-full overflow-hidden rounded border border-ink-300 bg-white">
        {!imgFailed ? (
          <img
            src={variation2dPath(variationId)}
            alt={variationId}
            className="h-full w-full object-contain pointer-events-none"
            draggable={false}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-[10px] text-ink-600">
            {variationId}
          </div>
        )}
      </div>
      <span className="mt-1 block text-center font-mono text-[10px] text-ink-600">
        {variationId}
      </span>
    </button>
  );
};

const DecodeComposer: React.FC = () => {
  const isMobile = useIsMobile();

  const placedCubes = useBuilderStore(s => s.placedCubes);
  const freestyle = useDecodeStore(s => s.freestyle);
  const canvasTiles = useDecodeStore(s => s.canvasTiles);
  const selectedTileId = useDecodeStore(s => s.selectedTileId);
  const pendingPlacementVariationId = useDecodeStore(s => s.pendingPlacementVariationId);

  const underlay = useDecodeStore(s => s.underlay);
  const setUnderlay = useDecodeStore(s => s.setUnderlay);
  const updateUnderlayRegistration = useDecodeStore(s => s.updateUnderlayRegistration);
  const setFreestyle = useDecodeStore(s => s.setFreestyle);
  const addTile = useDecodeStore(s => s.addTile);
  const rotateTile = useDecodeStore(s => s.rotateTile);
  const removeTile = useDecodeStore(s => s.removeTile);
  const clearCanvas = useDecodeStore(s => s.clearCanvas);
  const setSelectedTileId = useDecodeStore(s => s.setSelectedTileId);
  const setPendingPlacementVariationId = useDecodeStore(s => s.setPendingPlacementVariationId);
  const requestFit = useDecodeStore(s => s.requestFit);

  const drawerVariations = useMemo(
    () => (freestyle ? ALL_VARIATIONS : dedupeVariationsFromAssembly(placedCubes)),
    [freestyle, placedCubes],
  );

  const isEmpty = canvasTiles.length === 0;
  const [exporting, setExporting] = useState(false);
  const [importingUnderlay, setImportingUnderlay] = useState(false);
  const [underlayError, setUnderlayError] = useState<string | null>(null);
  const underlayInputRef = useRef<HTMLInputElement>(null);

  const handleUnderlayFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setImportingUnderlay(true);
      setUnderlayError(null);
      try {
        setUnderlay(await importPlanUnderlay(file));
      } catch (err) {
        setUnderlayError(err instanceof Error ? err.message : 'Failed to import plan');
      } finally {
        setImportingUnderlay(false);
      }
    },
    [setUnderlay],
  );

  // Auto-composition: grow the notation like the Builder's +N buttons grow
  // the assembly. The notation rule is that elements connect through their
  // red snap dots, so each new tile is constructed onto the composition:
  // a random snap dot of a placed tile and a random snap dot of the new
  // tile are made to coincide exactly. Partial overlap between connected
  // glyphs is legitimate notation; only near-identical stacking is rejected.
  const autoCompose = useCallback(
    (count: number) => {
      if (drawerVariations.length === 0) return;
      const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
      const rotations: readonly TileRotation[] = [0, 1, 2, 3];
      const stacked = (tiles: CanvasTile[], x: number, y: number) =>
        tiles.some(t => Math.abs(t.x - x) < TILE_SIZE * 0.3 && Math.abs(t.y - y) < TILE_SIZE * 0.3);

      const placed: CanvasTile[] = canvasTiles.map(t => ({ ...t }));

      for (let i = 0; i < count; i++) {
        let next: CanvasTile | null = null;

        for (let attempt = 0; attempt < 30 && !next; attempt++) {
          const variationId = pick(drawerVariations);
          const rotation = pick(rotations);
          const id = `auto-${Date.now()}-${i}`;

          if (placed.length === 0) {
            next = { id, variationId, x: TILE_SIZE * 0.6, y: TILE_SIZE * 0.8, rotation };
            break;
          }

          // Rotated snap-dot offsets of the new tile relative to its origin
          const ownDots = worldSnapPoints({ id, variationId, x: 0, y: 0, rotation });
          if (ownDots.length === 0) continue;

          const anchor = pick(placed);
          const anchorDots = worldSnapPoints(anchor);
          if (anchorDots.length === 0) continue;

          const target = pick(anchorDots);
          const own = pick(ownDots);
          const x = target.x - own.x;
          const y = target.y - own.y;
          if (stacked(placed, x, y)) continue;
          next = { id, variationId, x, y, rotation };
        }

        if (!next) break;
        placed.push(next);
        addTile({ variationId: next.variationId, x: next.x, y: next.y, rotation: next.rotation });
      }
      // Auto-composed tiles snap onto existing ones and can walk clear off the
      // viewport — reframe so the composition you just asked for is on screen.
      requestFit();
    },
    [addTile, canvasTiles, drawerVariations, requestFit],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && selectedTileId) {
        e.preventDefault();
        rotateTile(selectedTileId);
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedTileId) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        removeTile(selectedTileId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [removeTile, rotateTile, selectedTileId]);

  const handleExportDxf = async () => {
    if (isEmpty || exporting) return;
    setExporting(true);
    try {
      await downloadDecodeCompositionDxf(canvasTiles);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <ActiveSiteChip />
      {/* Zone 1 — Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12px] text-ink-600">
          <Switch checked={freestyle} onCheckedChange={setFreestyle} />
          <span>Freestyle</span>
        </label>

        <div className="flex items-center gap-1">
          {selectedTileId && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Rotate tile (Space)"
              className="h-8 w-8 text-ink-600 hover:text-ink-800"
              onClick={() => rotateTile(selectedTileId)}
              aria-label="Rotate tile"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          )}

        </div>
      </div>

      {/* Zone 2 — Parts drawer */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
          Parts
        </p>
        {drawerVariations.length === 0 ? (
          <p className="text-[11px] text-ink-400">
            {freestyle
              ? 'No variations available.'
              : 'No cubes in the assembly yet — enable Freestyle to browse all 70 parts.'}
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {drawerVariations.map(variationId => (
              <DrawerTile
                key={variationId}
                variationId={variationId}
                selected={pendingPlacementVariationId === variationId}
                isMobile={isMobile}
                onSelect={() => {
                  if (isMobile) {
                    setPendingPlacementVariationId(
                      pendingPlacementVariationId === variationId ? null : variationId,
                    );
                  }
                }}
                onDragStart={e => {
                  e.dataTransfer.setData('text/variation-id', variationId);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              />
            ))}
          </div>
        )}
        {!isMobile && drawerVariations.length > 0 && (
          <p className="mt-1 text-[11px] text-ink-400">Drag a part onto the canvas below.</p>
        )}
        {drawerVariations.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[11px] text-ink-500">Auto-compose</span>
            {[5, 10].map(n => (
              <Button
                key={n}
                type="button"
                onClick={() => autoCompose(n)}
                className="h-auto py-1 px-2.5 text-[12px] bg-primary/10 hover:bg-primary/20 text-primary border-0"
              >
                +{n}
              </Button>
            ))}
          </div>
        )}
      </div>

      {isMobile && pendingPlacementVariationId && (
        <p className="text-[11px] text-primary">
          Tap the canvas to place {pendingPlacementVariationId}
        </p>
      )}

      {/* Zone 2.5 — Plan underlay: a locked raster plan registered under the
          canvas. Only registration is recorded (offset / rotation / scale);
          saves keep a thumbnail + fingerprint, never full-res base64. */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
          Plan underlay
        </p>
        <input
          ref={underlayInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            void handleUnderlayFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
        {!underlay ? (
          <Button
            type="button"
            disabled={importingUnderlay}
            onClick={() => underlayInputRef.current?.click()}
            className="h-auto py-1 px-2.5 text-[12px] border border-ink-200 bg-ink-100 text-ink-700 hover:bg-ink-200"
          >
            {importingUnderlay ? 'Importing…' : 'Import plan image'}
          </Button>
        ) : (
          <div className="flex flex-col gap-1.5 rounded border border-ink-200 bg-ink-100/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={underlay.dataUrl ?? underlay.thumbnailDataUrl}
                  alt="Plan underlay"
                  className="h-8 w-8 rounded border border-ink-300 object-cover"
                />
                <span className="truncate font-mono text-[10px] text-ink-500">
                  {underlay.dataUrl ? `plan ${underlay.imageHash}` : `plan ${underlay.imageHash} · thumbnail only`}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Remove underlay"
                className="h-7 w-7 text-ink-600 hover:text-ink-800"
                onClick={() => setUnderlay(null)}
                aria-label="Remove underlay"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <RegistrationField label="X" value={underlay.offsetX}
                onChange={v => updateUnderlayRegistration({ offsetX: v })} />
              <RegistrationField label="Y" value={underlay.offsetY}
                onChange={v => updateUnderlayRegistration({ offsetY: v })} />
              <RegistrationField label="Rot°" value={underlay.rotation}
                onChange={v => updateUnderlayRegistration({ rotation: v })} />
              <RegistrationField label="Scale" value={underlay.scale} step={0.01}
                onChange={v => { if (v > 0) updateUnderlayRegistration({ scale: v }); }} />
            </div>
          </div>
        )}
        {underlayError && <p className="mt-1 text-[11px] text-red-600">{underlayError}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={isEmpty}
          onClick={clearCanvas}
          className="flex-1 h-auto py-2 text-[12px] border border-ink-200 bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:bg-ink-100 disabled:text-ink-400"
        >
          Clear
        </Button>
        <Button
          type="button"
          disabled={isEmpty || exporting}
          onClick={() => void handleExportDxf()}
          className="flex-1 h-auto py-2 text-[12px] border border-ink-200 bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:bg-ink-100 disabled:text-ink-400"
        >
          {exporting ? 'Exporting…' : 'Export DXF'}
        </Button>
      </div>
    </div>
  );
};

export const DecodePanel: React.FC = () => <DecodeComposer />;
