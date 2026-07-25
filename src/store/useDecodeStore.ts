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
  canvasExpanded: boolean;
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
  setCanvasExpanded: (value: boolean) => void;
  toggleCanvasExpanded: () => void;
  setSelectedTileId: (id: string | null) => void;
  setPendingPlacementVariationId: (id: string | null) => void;
}

export const useDecodeStore = create<DecodeState>((set, get) => ({
  canvasTiles: [],
  compositionsHistory: [],
  freestyle: false,
  canvasExpanded: false,
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
  setCanvasExpanded: (value) => set({ canvasExpanded: value }),
  toggleCanvasExpanded: () => set(s => ({ canvasExpanded: !s.canvasExpanded })),
  setSelectedTileId: (id) => set({ selectedTileId: id }),
  setPendingPlacementVariationId: (id) => set({ pendingPlacementVariationId: id }),
}));
