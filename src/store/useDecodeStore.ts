import { create } from 'zustand';

interface DecodeState {
  selectedCubeId: string | null;
  setSelectedCubeId: (id: string | null) => void;
}

export const useDecodeStore = create<DecodeState>((set) => ({
  selectedCubeId: null,
  setSelectedCubeId: (id) => set({ selectedCubeId: id }),
}));
