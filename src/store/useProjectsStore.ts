import { create } from 'zustand';
import type { ProjectDoc, SiteDoc, CompositionDoc } from '../lib/projects/types';

interface ProjectsState {
  /** Whether the Projects panel/slide-over is open. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;

  /** Currently selected project + site (the save target context). */
  activeProject: ProjectDoc | null;
  activeSite: SiteDoc | null;
  setActiveProject: (project: ProjectDoc | null) => void;
  setActiveSite: (site: SiteDoc | null) => void;

  /**
   * The composition currently loaded into the workspace (or the one last
   * saved), so "Save to project" can offer overwriting it instead of always
   * minting a new version. Cleared whenever the project/site target changes —
   * overwriting across sites would corrupt the wrong record.
   */
  activeComposition: CompositionDoc | null;
  setActiveComposition: (composition: CompositionDoc | null) => void;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  panelOpen: false,
  setPanelOpen: (open) => set({ panelOpen: open }),

  activeProject: null,
  activeSite: null,
  // Changing project clears the active site (it belonged to the old project).
  setActiveProject: (project) =>
    set({ activeProject: project, activeSite: null, activeComposition: null }),
  setActiveSite: (site) => set({ activeSite: site, activeComposition: null }),

  activeComposition: null,
  setActiveComposition: (composition) => set({ activeComposition: composition }),
}));
