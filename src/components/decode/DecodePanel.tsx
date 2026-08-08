import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasTile, TileRotation } from '../../store/useDecodeStore';
import { RotateCw, X } from 'lucide-react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { MAX_UNDERLAYS, useDecodeStore } from '../../store/useDecodeStore';
import { downloadDecodeCompositionDxf } from '../../lib/decode/decodeDxfExport';
import {
  downloadDecodeSheetPng,
  downloadDecodeSheetSvg,
} from '../../lib/decode/decodeSheetExport';
import { importPlanUnderlay } from '../../lib/decode/planUnderlay';
import { TILE_SIZE, worldSnapPoints } from '../../lib/decode/snapUtils';
import { variation2dPath } from '../../lib/decode/variation2dPath';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ActiveSiteChip } from '../layout/ActiveSiteChip';
import { SectionCutControls } from '../viewport/SectionCutControls';

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

  const underlays = useDecodeStore(s => s.underlays);
  const addUnderlay = useDecodeStore(s => s.addUnderlay);
  const removeUnderlay = useDecodeStore(s => s.removeUnderlay);
  const moveUnderlay = useDecodeStore(s => s.moveUnderlay);
  const toggleUnderlayVisible = useDecodeStore(s => s.toggleUnderlayVisible);
  const setUnderlayOpacity = useDecodeStore(s => s.setUnderlayOpacity);
  const armedUnderlayId = useDecodeStore(s => s.armedUnderlayId);
  const setArmedUnderlayId = useDecodeStore(s => s.setArmedUnderlayId);
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
  // SVG and PNG carry the underlay stack, so a registered plan on its own is
  // still something to export. DXF is geometry-only and stays on `isEmpty`.
  const nothingToExport = isEmpty && !underlays.some(u => u.visible);
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
        addUnderlay(await importPlanUnderlay(file));
      } catch (err) {
        setUnderlayError(err instanceof Error ? err.message : 'Failed to import plan');
      } finally {
        setImportingUnderlay(false);
      }
    },
    [addUnderlay],
  );

  const armedLayer = underlays.find(u => u.id === armedUnderlayId) ?? null;

  // Esc puts the armed layer back to sleep — the same key that clears a tile
  // selection, so "stop what I'm doing" stays one habit.
  useEffect(() => {
    if (!armedUnderlayId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArmedUnderlayId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armedUnderlayId, setArmedUnderlayId]);

  // Auto-composition: grow the notation like the assembly's +N buttons grow
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

  const [exportError, setExportError] = useState<string | null>(null);

  const runExport = async (kind: 'dxf' | 'svg' | 'png') => {
    if ((kind === 'dxf' ? isEmpty : nothingToExport) || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      if (kind === 'dxf') await downloadDecodeCompositionDxf(canvasTiles);
      else if (kind === 'svg') await downloadDecodeSheetSvg(canvasTiles, underlays);
      else if (!downloadDecodeSheetPng()) {
        // Only possible with the sheet unmounted — i.e. the 3D view is up.
        setExportError('Switch back to the sheet to export a PNG.');
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
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
        <p className="mb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-600">
          <span>Underlays</span>
          <span className="font-normal tabular-nums text-ink-400">
            {underlays.length} / {MAX_UNDERLAYS}
          </span>
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
        {underlays.length === 0 ? (
          <p className="mb-1.5 text-[11px] italic text-ink-400">
            None — the sheet is drawing on the lattice alone.
          </p>
        ) : (
          <div className="mb-1.5 flex flex-col gap-1">
            {underlays.map((layer, i) => {
              const armed = armedUnderlayId === layer.id;
              return (
                <div
                  key={layer.id}
                  className={`group flex items-center gap-1.5 rounded border p-1 ${
                    armed ? 'border-primary bg-primary/[0.06]' : 'border-ink-200/70 bg-ink-100/40'
                  }`}
                >
                  {/* Click to arm, click again to put it back to sleep. */}
                  <button
                    type="button"
                    onClick={() => setArmedUnderlayId(armed ? null : layer.id)}
                    title={armed ? 'Finish adjusting' : 'Adjust on the sheet'}
                    className="flex min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent p-0 text-left cursor-pointer"
                  >
                    <img
                      src={layer.thumbnailDataUrl}
                      alt=""
                      className={`h-7 w-9 flex-shrink-0 rounded-sm border border-ink-200 object-cover ${
                        layer.visible ? '' : 'opacity-40'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[11px] ${
                        layer.visible ? 'text-ink-800' : 'text-ink-400 line-through'
                      }`}>
                        {layer.label}
                      </span>
                      <span className="block font-mono text-[9.5px] text-ink-500">
                        {layer.source === 'capture' ? 'capture' : 'plan'}
                        {armed ? ' · adjusting' : ''}
                      </span>
                    </span>
                  </button>

                  <div className="flex flex-col leading-none">
                    <button
                      type="button" onClick={() => moveUnderlay(layer.id, -1)} disabled={i === 0}
                      title="Move up" aria-label={`Move ${layer.label} up`}
                      className="border-0 bg-transparent px-0.5 text-[9px] text-ink-400 hover:text-ink-700 disabled:opacity-25 cursor-pointer"
                    >▲</button>
                    <button
                      type="button" onClick={() => moveUnderlay(layer.id, 1)}
                      disabled={i === underlays.length - 1}
                      title="Move down" aria-label={`Move ${layer.label} down`}
                      className="border-0 bg-transparent px-0.5 text-[9px] text-ink-400 hover:text-ink-700 disabled:opacity-25 cursor-pointer"
                    >▼</button>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleUnderlayVisible(layer.id)}
                    title={layer.visible ? 'Hide' : 'Show'}
                    aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.label}`}
                    className="border-0 bg-transparent px-1 text-[11px] text-ink-400 hover:text-ink-700 cursor-pointer"
                  >
                    {layer.visible ? '◉' : '○'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeUnderlay(layer.id)}
                    title="Remove layer"
                    aria-label={`Remove ${layer.label}`}
                    className="border-0 bg-transparent px-1 text-[11px] text-ink-400 hover:text-destructive cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Registration + opacity drive whichever layer is armed. */}
        {armedLayer && (
          <div className="mb-1.5 rounded border border-ink-200 bg-ink-100/60 p-2">
            <p className="m-0 mb-1.5 text-[10px] text-ink-500">
              Adjusting <span className="text-ink-700">{armedLayer.label}</span> — drag it on the
              sheet, corners scale and rotate. Esc when done.
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <RegistrationField label="X" value={armedLayer.offsetX}
                onChange={v => updateUnderlayRegistration(armedLayer.id, { offsetX: v })} />
              <RegistrationField label="Y" value={armedLayer.offsetY}
                onChange={v => updateUnderlayRegistration(armedLayer.id, { offsetY: v })} />
              <RegistrationField label="Rot°" value={armedLayer.rotation}
                onChange={v => updateUnderlayRegistration(armedLayer.id, { rotation: v })} />
              <RegistrationField label="Scale" value={armedLayer.scale} step={0.01}
                onChange={v => { if (v > 0) updateUnderlayRegistration(armedLayer.id, { scale: v }); }} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="font-mono text-[10px] text-ink-500" htmlFor="underlay-opacity">
                Opacity
              </label>
              <input
                id="underlay-opacity"
                type="range" min={10} max={100} step={5}
                value={Math.round(armedLayer.opacity * 100)}
                onChange={e => setUnderlayOpacity(armedLayer.id, Number(e.target.value) / 100)}
                className="h-1 flex-1 accent-primary"
              />
              <span className="w-8 text-right text-[10px] tabular-nums text-ink-600">
                {Math.round(armedLayer.opacity * 100)}%
              </span>
            </div>
          </div>
        )}

        <Button
          type="button"
          disabled={importingUnderlay || underlays.length >= MAX_UNDERLAYS}
          onClick={() => underlayInputRef.current?.click()}
          title={underlays.length >= MAX_UNDERLAYS ? `Up to ${MAX_UNDERLAYS} layers` : undefined}
          className="h-auto py-1 px-2.5 text-[12px] border border-ink-200 bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:opacity-50"
        >
          {importingUnderlay ? 'Importing…' : 'Import plan image'}
        </Button>
        {underlayError && <p className="mt-1 text-[11px] text-red-600">{underlayError}</p>}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
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
            disabled={nothingToExport || exporting}
            title="Vector drawing — every layer: one named group per tile, one per underlay"
            onClick={() => void runExport('svg')}
            className="flex-1 h-auto py-2 text-[12px] border border-ink-200 bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:bg-ink-100 disabled:text-ink-400"
          >
            {exporting ? 'Exporting…' : 'Export SVG'}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={nothingToExport || exporting}
            title="Every visible layer, flattened — transparent background, 3× resolution"
            onClick={() => void runExport('png')}
            className="flex-1 h-auto py-2 text-[12px] border border-ink-200 bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:bg-ink-100 disabled:text-ink-400"
          >
            Export PNG
          </Button>
          <Button
            type="button"
            disabled={isEmpty || exporting}
            title="Tile geometry only — DXF carries no groups and no underlay images"
            onClick={() => void runExport('dxf')}
            className="flex-1 h-auto py-2 text-[12px] border border-ink-200 bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:bg-ink-100 disabled:text-ink-400"
          >
            Export DXF
          </Button>
        </div>
        {exportError && <p className="text-[11px] text-red-600">{exportError}</p>}
      </div>

      {/* Section cut — it drives the corner preview and the full 3D alike, so
          the view you draw against can be set up without leaving Decode. */}
      <SectionCutControls />
    </div>
  );
};

export const DecodePanel: React.FC = () => <DecodeComposer />;
