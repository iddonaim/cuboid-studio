import { create } from 'zustand';

export type AppMode = 'builder' | 'pataphysical' | 'encoding' | 'evolution';

interface AppState {
  activeMode: AppMode;
  setActiveMode: (mode: AppMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeMode: 'builder',
  setActiveMode: (mode) => set({ activeMode: mode }),
}));
