import { create } from 'zustand';

export type TileRotation = 0 | 1 | 2 | 3;

export interface CanvasTile {
  id: string;
  variationId: string;
  x: number;
  y: number;
  rotation: TileRotation;
}

export interface CompositionSnapshot {
  tiles: CanvasTile[];
  savedAt: number;
}

/**
 * A raster plan image registered under the Decode canvas as a locked,
 * non-interactive underlay. Only the registration is recorded — this is not
 * a sheet composer. Persistence follows the encode-photo policy: the full-res
 * data URL is session-only; saved compositions carry the ~240px thumbnail
 * plus a fingerprint of the imported file, never full-res base64 (Firestore
 * doc-size limit).
 */
export interface DecodeUnderlay {
  /** Full-res data URL for crisp on-screen display. Null after a composition
   *  restore — the underlay then renders from the thumbnail (blurry but
   *  registered) until the architect re-imports the plan file. */
  dataUrl: string | null;
  /** Small JPEG (longest edge ~240px) persisted with saved compositions. */
  thumbnailDataUrl: string;
  /** FNV-1a fingerprint of the imported (resized) plan — the stable external
   *  reference identifying which file this was without persisting it. */
  imageHash: string;
  /** Pixel dimensions of the imported (resized) plan; the registration
   *  transform is defined against these. */
  width: number;
  height: number;
  /** Registration: canvas world-unit offset of the plan's top-left corner. */
  offsetX: number;
  offsetY: number;
  /** Registration: degrees clockwise. */
  rotation: number;
  /** Registration: canvas world units per plan pixel. */
  scale: number;
}

const MAX_HISTORY = 5;

function cloneTiles(tiles: CanvasTile[]): CanvasTile[] {
  return tiles.map(t => ({ ...t }));
}

interface DecodeState {
  canvasTiles: CanvasTile[];
  compositionsHistory: CompositionSnapshot[];
  freestyle: boolean;
  /**
   * What the full-bleed stage shows in Decode. The notation sheet is the work
   * here, so it leads; the 3D assembly is reference material one click away.
   * (Every other mode puts its working surface on the stage — Decode used to
   * be the exception, drawing into a ~320px box in the sidebar while the
   * read-only 3D took the whole screen.)
   */
  stageView: 'draw' | 'model';
  /** Bumped to ask the canvas to reframe. Lets the sidebar (auto-compose)
   *  reveal what it just drew without owning a ref to the Konva stage. */
  fitRequestId: number;
  selectedTileId: string | null;
  /** Mobile: variation picked in parts drawer, pending canvas tap. */
  pendingPlacementVariationId: string | null;
  /** Locked plan underlay beneath the tiles, or null when none imported. */
  underlay: DecodeUnderlay | null;

  setUnderlay: (underlay: DecodeUnderlay | null) => void;
  /** Adjust registration (offset/rotation/scale) of the current underlay. */
  updateUnderlayRegistration: (
    patch: Partial<Pick<DecodeUnderlay, 'offsetX' | 'offsetY' | 'rotation' | 'scale'>>,
  ) => void;

  addTile: (tile: Omit<CanvasTile, 'id'> & { id?: string }) => void;
  moveTile: (id: string, x: number, y: number) => void;
  rotateTile: (id: string) => void;
  removeTile: (id: string) => void;
  clearCanvas: () => void;
  setFreestyle: (value: boolean) => void;
  setStageView: (value: 'draw' | 'model') => void;
  toggleStageView: () => void;
  requestFit: () => void;
  setSelectedTileId: (id: string | null) => void;
  setPendingPlacementVariationId: (id: string | null) => void;
}

export const useDecodeStore = create<DecodeState>((set, get) => ({
  canvasTiles: [],
  compositionsHistory: [],
  freestyle: false,
  stageView: 'draw',
  fitRequestId: 0,
  selectedTileId: null,
  pendingPlacementVariationId: null,
  underlay: null,

  setUnderlay: (underlay) => set({ underlay }),

  updateUnderlayRegistration: (patch) => {
    const current = get().underlay;
    if (!current) return;
    set({ underlay: { ...current, ...patch } });
  },

  addTile: (tile) => {
    const id = tile.id ?? crypto.randomUUID();
    set(state => ({
      canvasTiles: [
        ...state.canvasTiles,
        {
          id,
          variationId: tile.variationId,
          x: tile.x,
          y: tile.y,
          rotation: tile.rotation,
        },
      ],
      selectedTileId: id,
      pendingPlacementVariationId: null,
    }));
  },

  moveTile: (id, x, y) => {
    set(state => ({
      canvasTiles: state.canvasTiles.map(t =>
        t.id === id ? { ...t, x, y } : t,
      ),
    }));
  },

  rotateTile: (id) => {
    set(state => ({
      canvasTiles: state.canvasTiles.map(t =>
        t.id === id
          ? { ...t, rotation: ((t.rotation + 1) % 4) as TileRotation }
          : t,
      ),
    }));
  },

  removeTile: (id) => {
    set(state => ({
      canvasTiles: state.canvasTiles.filter(t => t.id !== id),
      selectedTileId: state.selectedTileId === id ? null : state.selectedTileId,
    }));
  },

  clearCanvas: () => {
    const { canvasTiles, compositionsHistory } = get();
    if (canvasTiles.length === 0) return;

    const snapshot: CompositionSnapshot = {
      tiles: cloneTiles(canvasTiles),
      savedAt: Date.now(),
    };

    set({
      compositionsHistory: [snapshot, ...compositionsHistory].slice(0, MAX_HISTORY),
      canvasTiles: [],
      selectedTileId: null,
      pendingPlacementVariationId: null,
    });
  },

  setFreestyle: (value) => set({ freestyle: value }),
  setStageView: (value) => set({ stageView: value }),
  toggleStageView: () => set(s => ({ stageView: s.stageView === 'draw' ? 'model' : 'draw' })),
  requestFit: () => set(s => ({ fitRequestId: s.fitRequestId + 1 })),
  setSelectedTileId: (id) => set({ selectedTileId: id }),
  setPendingPlacementVariationId: (id) => set({ pendingPlacementVariationId: id }),
}));
