import { create } from 'zustand';

export type AppMode = 'builder' | 'pataphysical' | 'encoding' | 'evolution';

interface AppState {
  activeMode: AppMode;
  setActiveMode: (mode: AppMode) => void;
  floatingPanelOpen: boolean;
  toggleFloatingPanel: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeMode: 'builder',
  setActiveMode: (mode) => set({ activeMode: mode }),
  floatingPanelOpen: true,
  toggleFloatingPanel: () => set(s => ({ floatingPanelOpen: !s.floatingPanelOpen })),
}));
