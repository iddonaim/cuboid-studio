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
