import React, { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useAppStore } from '../../store/useAppStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useToastStore } from '../../store/useToastStore';
import {
  listProjects, createProject, deleteProject, renameProject,
  listSites, createSite, deleteSite, renameSite, updateSite,
  listCompositions, createComposition, deleteComposition, renameComposition,
} from '../../lib/projects/firestore';
import { captureComposition, restoreComposition } from '../../lib/projects/composition';
import { getActiveSiteContext } from '../../lib/storage/siteContext';
import type { ProjectDoc, SiteDoc, CompositionDoc } from '../../lib/projects/types';

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Inline "create new" row with a text input + add button. */
const NewItemRow: React.FC<{ placeholder: string; onCreate: (name: string) => Promise<void> }> = ({
  placeholder, onCreate,
}) => {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name.trim());
      setName('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex gap-1.5 mt-2">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-ink-100 border border-ink-200 rounded px-2 py-1.5 text-[12px] text-ink-800 outline-none focus:border-ink-400"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded bg-primary hover:bg-primary/85 disabled:opacity-50 text-white text-[12px] px-2.5 cursor-pointer border-0"
      >
        Add
      </button>
    </form>
  );
};

const RowButton: React.FC<{
  title: string;
  subtitle?: string;
  onClick?: () => void;
  onDelete: () => void;
  /** When provided, a hover pencil turns the title into an inline rename input. */
  onRename?: (name: string) => Promise<void>;
  rightSlot?: React.ReactNode;
}> = ({ title, subtitle, onClick, onDelete, onRename, rightSlot }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setDraft(title);
    setEditing(true);
  };
  const commit = async () => {
    const name = draft.trim();
    if (!name || name === title) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onRename!(name);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group flex items-center gap-2 rounded-md border border-ink-200/70 hover:border-ink-300 px-2.5 py-2 bg-ink-100/40">
      {editing ? (
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={() => void commit()}
          disabled={busy}
          autoFocus
          className="flex-1 min-w-0 bg-ink-100 border border-ink-300 rounded px-1.5 py-1 text-[12px] text-ink-800 outline-none focus:border-ink-400"
        />
      ) : (
        <button
          onClick={onClick}
          className="flex-1 text-left cursor-pointer bg-transparent border-0 min-w-0"
        >
          <div className="text-[12px] text-ink-800 truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-ink-500 truncate">{subtitle}</div>}
        </button>
      )}
      {rightSlot}
      {onRename && !editing && (
        <button
          onClick={startEdit}
          title="Rename"
          className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-ink-800 text-[12px] cursor-pointer bg-transparent border-0 px-1"
        >
          ✎
        </button>
      )}
      <button
        onClick={onDelete}
        title="Delete"
        className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-destructive text-[12px] cursor-pointer bg-transparent border-0 px-1"
      >
        ✕
      </button>
    </div>
  );
};

/**
 * Right-side slide-over listing projects → sites → compositions with
 * create / delete / save / load. Only mounted for signed-in users.
 */
export const ProjectsPanel: React.FC = () => {
  const { user } = useAuthContext();
  const panelOpen = useProjectsStore(s => s.panelOpen);
  const setPanelOpen = useProjectsStore(s => s.setPanelOpen);
  const activeProject = useProjectsStore(s => s.activeProject);
  const activeSite = useProjectsStore(s => s.activeSite);
  const setActiveProject = useProjectsStore(s => s.setActiveProject);
  const setActiveSite = useProjectsStore(s => s.setActiveSite);
  const setActiveComposition = useProjectsStore(s => s.setActiveComposition);
  const setActiveMode = useAppStore(s => s.setActiveMode);
  const showToast = useToastStore(s => s.showToast);

  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [sites, setSites] = useState<SiteDoc[]>([]);
  const [compositions, setCompositions] = useState<CompositionDoc[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshProjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setProjects(await listProjects(user.uid));
    } catch (err) {
      console.error(err);
      showToast('Could not load projects', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  const refreshSites = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      setSites(await listSites(projectId));
    } catch (err) {
      console.error(err);
      showToast('Could not load sites', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const refreshCompositions = useCallback(async (projectId: string, siteId: string) => {
    setLoading(true);
    try {
      setCompositions(await listCompositions(projectId, siteId));
    } catch (err) {
      console.error(err);
      showToast('Could not load compositions', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Load the appropriate list whenever the panel opens or the drill level changes.
  useEffect(() => {
    if (!panelOpen) return;
    if (activeProject && activeSite) {
      refreshCompositions(activeProject.id, activeSite.id);
    } else if (activeProject) {
      refreshSites(activeProject.id);
    } else {
      refreshProjects();
    }
  }, [panelOpen, activeProject, activeSite, refreshProjects, refreshSites, refreshCompositions]);

  if (!panelOpen || !user) return null;

  // --- handlers ---
  const handleCreateProject = async (name: string) => {
    const p = await createProject(user.uid, name);
    setProjects(prev => [p, ...prev]);
    setActiveProject(p);
  };
  const handleDeleteProject = async (p: ProjectDoc) => {
    await deleteProject(p.id);
    setProjects(prev => prev.filter(x => x.id !== p.id));
    if (activeProject?.id === p.id) setActiveProject(null);
  };
  const handleRenameProject = async (p: ProjectDoc, name: string) => {
    try {
      await renameProject(p.id, name);
      setProjects(prev => prev.map(x => (x.id === p.id ? { ...x, name } : x)));
      if (activeProject?.id === p.id) setActiveProject({ ...p, name });
    } catch (err) {
      console.error(err);
      showToast('Rename failed', 'error');
    }
  };

  const handleCreateSite = async (name: string) => {
    if (!activeProject) return;
    // Seed the site with the current active site context, if any.
    const s = await createSite(activeProject.id, name, getActiveSiteContext());
    setSites(prev => [s, ...prev]);
    setActiveSite(s);
  };
  const handleDeleteSite = async (s: SiteDoc) => {
    if (!activeProject) return;
    await deleteSite(activeProject.id, s.id);
    setSites(prev => prev.filter(x => x.id !== s.id));
    if (activeSite?.id === s.id) setActiveSite(null);
  };
  const handleRenameSite = async (s: SiteDoc, name: string) => {
    if (!activeProject) return;
    try {
      await renameSite(activeProject.id, s.id, name);
      setSites(prev => prev.map(x => (x.id === s.id ? { ...x, name } : x)));
      if (activeSite?.id === s.id) setActiveSite({ ...s, name });
    } catch (err) {
      console.error(err);
      showToast('Rename failed', 'error');
    }
  };

  const handleSaveComposition = async (name: string) => {
    if (!activeProject || !activeSite) return;
    const data = captureComposition();
    const c = await createComposition(activeProject.id, activeSite.id, name, data);
    setCompositions(prev => [c, ...prev]);
    setActiveComposition(c);
    // Keep the Site's own site context in sync — it's only seeded once at
    // creation otherwise, so context set/changed afterwards (Map tab) would
    // never reach the Site document.
    const activeSiteContext = getActiveSiteContext();
    if (activeSiteContext) {
      await updateSite(activeProject.id, activeSite.id, activeSiteContext);
    }
    showToast('Composition saved', 'success');
  };
  const handleDeleteComposition = async (c: CompositionDoc) => {
    if (!activeProject || !activeSite) return;
    await deleteComposition(activeProject.id, activeSite.id, c.id);
    setCompositions(prev => prev.filter(x => x.id !== c.id));
  };
  const handleRenameComposition = async (c: CompositionDoc, name: string) => {
    if (!activeProject || !activeSite) return;
    try {
      await renameComposition(activeProject.id, activeSite.id, c.id, name);
      setCompositions(prev => prev.map(x => (x.id === c.id ? { ...x, name } : x)));
    } catch (err) {
      console.error(err);
      showToast('Rename failed', 'error');
    }
  };
  const handleLoadComposition = async (c: CompositionDoc) => {
    try {
      const { landingMode } = await restoreComposition(c.data);
      setActiveComposition(c);
      setActiveMode(landingMode);
      setPanelOpen(false);
      showToast('Composition loaded', 'success');
    } catch (err) {
      console.error('Load failed:', err);
      showToast('Load failed — snapshot may be incompatible', 'error');
    }
  };

  // --- breadcrumb ---
  const crumb = activeSite
    ? `${activeProject?.name} / ${activeSite.name}`
    : activeProject
      ? activeProject.name
      : 'Projects';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/40"
        onClick={() => setPanelOpen(false)}
      />
      {/* Slide-over */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[81] w-[340px] max-w-[90vw] flex flex-col border-l border-ink-200 shadow-2xl"
        style={{ background: 'hsl(var(--card))', boxShadow: '0 12px 40px hsl(45 9% 13% / 0.14)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-ink-200">
          <div className="flex items-center gap-1.5 min-w-0">
            {(activeProject || activeSite) && (
              <button
                onClick={() => (activeSite ? setActiveSite(null) : setActiveProject(null))}
                className="text-ink-600 hover:text-ink-800 text-[13px] cursor-pointer bg-transparent border-0"
                title="Back"
              >
                ‹
              </button>
            )}
            <span className="font-mono text-[12px] uppercase tracking-wider text-ink-700 truncate">
              {crumb}
            </span>
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-ink-600 hover:text-ink-800 text-[14px] cursor-pointer bg-transparent border-0"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading && (
            <div className="text-[12px] text-ink-500 mb-2">Loading…</div>
          )}

          {/* Level 1: projects */}
          {!activeProject && (
            <>
              <div className="flex flex-col gap-1.5">
                {projects.map(p => (
                  <RowButton
                    key={p.id}
                    title={p.name}
                    subtitle={`Updated ${fmtDate(p.updatedAt)}`}
                    onClick={() => setActiveProject(p)}
                    onDelete={() => handleDeleteProject(p)}
                    onRename={name => handleRenameProject(p, name)}
                  />
                ))}
                {!loading && projects.length === 0 && (
                  <div className="text-[12px] text-ink-500">No projects yet.</div>
                )}
              </div>
              <NewItemRow placeholder="New project name" onCreate={handleCreateProject} />
            </>
          )}

          {/* Level 2: sites */}
          {activeProject && !activeSite && (
            <>
              <div className="flex flex-col gap-1.5">
                {sites.map(s => (
                  <RowButton
                    key={s.id}
                    title={s.name}
                    subtitle={`Created ${fmtDate(s.createdAt)}`}
                    onClick={() => setActiveSite(s)}
                    onDelete={() => handleDeleteSite(s)}
                    onRename={name => handleRenameSite(s, name)}
                  />
                ))}
                {!loading && sites.length === 0 && (
                  <div className="text-[12px] text-ink-500">No sites yet.</div>
                )}
              </div>
              <NewItemRow placeholder="New site name" onCreate={handleCreateSite} />
            </>
          )}

          {/* Level 3: compositions */}
          {activeProject && activeSite && (
            <>
              <div className="flex flex-col gap-1.5">
                {compositions.map(c => (
                  <RowButton
                    key={c.id}
                    title={c.name}
                    subtitle={`Saved ${fmtDate(c.updatedAt)}`}
                    onDelete={() => handleDeleteComposition(c)}
                    onRename={name => handleRenameComposition(c, name)}
                    rightSlot={
                      <button
                        onClick={() => handleLoadComposition(c)}
                        className="rounded bg-primary hover:bg-primary/85 text-white text-[12px] px-2 py-1 cursor-pointer border-0"
                      >
                        Load
                      </button>
                    }
                  />
                ))}
                {!loading && compositions.length === 0 && (
                  <div className="text-[12px] text-ink-500">No saved compositions yet.</div>
                )}
              </div>
              <NewItemRow placeholder="Save current as…" onCreate={handleSaveComposition} />
            </>
          )}
        </div>
      </div>
    </>
  );
};
