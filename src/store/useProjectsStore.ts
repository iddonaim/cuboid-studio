import { create } from 'zustand';
import type { ProjectDoc, SiteDoc } from '../lib/projects/types';

interface ProjectsState {
  /** Whether the Projects panel/slide-over is open. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;

  /** Currently selected project + site (the save target context). */
  activeProject: ProjectDoc | null;
  activeSite: SiteDoc | null;
  setActiveProject: (project: ProjectDoc | null) => void;
  setActiveSite: (site: SiteDoc | null) => void;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  panelOpen: false,
  setPanelOpen: (open) => set({ panelOpen: open }),

  activeProject: null,
  activeSite: null,
  // Changing project clears the active site (it belonged to the old project).
  setActiveProject: (project) => set({ activeProject: project, activeSite: null }),
  setActiveSite: (site) => set({ activeSite: site }),
}));
