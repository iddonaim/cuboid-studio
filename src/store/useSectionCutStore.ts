import { create } from 'zustand';

interface SectionCutState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  axis: 'x' | 'y' | 'z';
  setAxis: (axis: 'x' | 'y' | 'z') => void;
  position: number;
  setPosition: (pos: number) => void;
}

export const useSectionCutStore = create<SectionCutState>((set) => ({
  enabled: false,
  setEnabled: (enabled) => set({ enabled }),
  axis: 'y',
  setAxis: (axis) => set({ axis }),
  position: 50,
  setPosition: (position) => set({ position }),
}));
