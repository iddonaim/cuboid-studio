import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useToastStore } from '../../store/useToastStore';
import { captureComposition } from '../../lib/projects/composition';
import { createComposition, updateComposition, updateSite } from '../../lib/projects/firestore';
import { getActiveSiteContext } from '../../lib/storage/siteContext';

function defaultName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Composition ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "Save to project" — lives in the TopBar (right cell) so it never overlaps
 * per-mode viewport UI (Map toggles, Decode canvas, etc.). Visible whenever a
 * signed-in user has an active project AND site selected.
 *
 * When a composition is currently loaded, saving offers a choice: overwrite
 * that version (iterative work) or save as a new one — the user decides.
 */
export const SaveCompositionButton: React.FC = () => {
  const { user } = useAuthContext();
  const activeProject = useProjectsStore(s => s.activeProject);
  const activeSite = useProjectsStore(s => s.activeSite);
  const activeComposition = useProjectsStore(s => s.activeComposition);
  const setActiveComposition = useProjectsStore(s => s.setActiveComposition);
  const showToast = useToastStore(s => s.showToast);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user || !activeProject || !activeSite) return null;

  const handleOpen = () => {
    setName(defaultName());
    setOpen(true);
  };

  const syncSiteContext = async () => {
    // Keep the Site's own site context in sync — it's only seeded once at
    // creation otherwise, so context set/changed afterwards (Map tab) would
    // never reach the Site document.
    const activeSiteContext = getActiveSiteContext();
    if (activeSiteContext) {
      await updateSite(activeProject.id, activeSite.id, activeSiteContext);
    }
  };

  const handleSaveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = captureComposition();
      const c = await createComposition(
        activeProject.id, activeSite.id, name.trim() || defaultName(), data,
      );
      setActiveComposition(c);
      await syncSiteContext();
      showToast('Composition saved', 'success');
      setOpen(false);
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Save failed — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOverwrite = async () => {
    if (!activeComposition) return;
    setSaving(true);
    try {
      const data = captureComposition();
      await updateComposition(activeProject.id, activeSite.id, activeComposition.id, data);
      setActiveComposition({ ...activeComposition, updatedAt: Date.now(), data });
      await syncSiteContext();
      showToast(`"${activeComposition.name}" updated`, 'success');
      setOpen(false);
    } catch (err) {
      console.error('Overwrite failed:', err);
      showToast('Save failed — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="rounded-full bg-primary hover:bg-primary/85 text-white text-[12px] font-mono px-3 py-1 shadow-sm cursor-pointer border-0 whitespace-nowrap"
        title={`Save to ${activeProject.name} / ${activeSite.name}`}
      >
        Save to project
      </button>

      {open && (
        <form
          onSubmit={handleSaveNew}
          className="absolute right-0 top-[calc(100%+8px)] flex flex-col gap-2 p-3 w-72 rounded-lg border border-ink-200 shadow-xl z-[70]"
          style={{ background: 'hsl(var(--card))', boxShadow: '0 12px 40px hsl(45 9% 13% / 0.14)' }}
        >
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-600">
            Save composition to {activeSite.name}
          </span>

          {activeComposition && (
            <button
              type="button"
              onClick={handleOverwrite}
              disabled={saving}
              className="rounded bg-ink-800 hover:bg-ink-900 disabled:opacity-50 text-white text-[12px] px-3 py-1.5 cursor-pointer border-0 text-left"
              title="Update the loaded version in place instead of creating a new one"
            >
              {saving ? 'Saving…' : `Overwrite "${activeComposition.name}"`}
            </button>
          )}

          <div className="flex flex-col gap-1">
            {activeComposition && (
              <span className="text-[11px] text-ink-500">…or save as a new version:</span>
            )}
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className="bg-ink-100 border border-ink-200 rounded px-2 py-1.5 text-[12px] text-ink-800 outline-none focus:border-ink-400"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12px] text-ink-600 hover:text-ink-800 px-2 py-1 cursor-pointer bg-transparent border-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-primary hover:bg-primary/85 disabled:opacity-50 text-white text-[12px] px-3 py-1 cursor-pointer border-0"
            >
              {saving ? 'Saving…' : activeComposition ? 'Save new' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
