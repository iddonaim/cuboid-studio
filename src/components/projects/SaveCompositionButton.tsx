import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useToastStore } from '../../store/useToastStore';
import { captureComposition } from '../../lib/projects/composition';
import { createComposition } from '../../lib/projects/firestore';

function defaultName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Composition ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "Save to project" — visible whenever a signed-in user has an active project
 * AND site selected. Floats top-right under the TopBar so it's easy to find.
 * Clicking opens a name prompt (pre-filled with a timestamp) and writes the
 * full composition snapshot to Firestore.
 */
export const SaveCompositionButton: React.FC = () => {
  const { user } = useAuthContext();
  const activeProject = useProjectsStore(s => s.activeProject);
  const activeSite = useProjectsStore(s => s.activeSite);
  const showToast = useToastStore(s => s.showToast);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user || !activeProject || !activeSite) return null;

  const handleOpen = () => {
    setName(defaultName());
    setOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = captureComposition();
      await createComposition(activeProject.id, activeSite.id, name.trim() || defaultName(), data);
      showToast('Composition saved', 'success');
      setOpen(false);
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Save failed — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute top-[50px] right-3 z-30 flex flex-col items-end gap-1.5">
      <button
        onClick={handleOpen}
        className="rounded-full bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-mono px-3 py-1.5 shadow-lg cursor-pointer border-0"
        title={`Save to ${activeProject.name} / ${activeSite.name}`}
      >
        Save to project
      </button>

      {open && (
        <form
          onSubmit={handleSave}
          className="flex flex-col gap-2 p-3 w-64 rounded-lg border border-slate-700 shadow-xl"
          style={{ background: '#0f172a' }}
        >
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            Save composition to {activeSite.name}
          </span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[12px] text-slate-200 outline-none focus:border-slate-500"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12px] text-slate-400 hover:text-slate-200 px-2 py-1 cursor-pointer bg-transparent border-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-[12px] px-3 py-1 cursor-pointer border-0"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
