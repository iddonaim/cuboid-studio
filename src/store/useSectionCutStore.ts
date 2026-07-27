import { create } from 'zustand';

interface SectionCutState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  axis: 'x' | 'y' | 'z';
  setAxis: (axis: 'x' | 'y' | 'z') => void;
  position: number;
  setPosition: (pos: number) => void;
  /**
   * Which half of the cut survives. False keeps the half below the plane on
   * the chosen axis (the original behaviour); true keeps the half above it —
   * same cut, viewed from the other side.
   */
  flipped: boolean;
  setFlipped: (flipped: boolean) => void;
  toggleFlipped: () => void;
}

export const useSectionCutStore = create<SectionCutState>((set) => ({
  enabled: false,
  setEnabled: (enabled) => set({ enabled }),
  axis: 'y',
  setAxis: (axis) => set({ axis }),
  position: 50,
  setPosition: (position) => set({ position }),
  flipped: false,
  setFlipped: (flipped) => set({ flipped }),
  toggleFlipped: () => set((s) => ({ flipped: !s.flipped })),
}));
