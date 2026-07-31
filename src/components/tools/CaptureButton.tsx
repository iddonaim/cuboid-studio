import React, { useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { captureAndShare, captureForSave } from '../../lib/capture/screenshotCapture';
import { useAuthContext } from '../../contexts/AuthContext';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useToastStore } from '../../store/useToastStore';
import { uploadCapture } from '../../lib/projects/photoStorage';
import {
  appendCapture,
  createProject,
  createSite,
  createComposition,
} from '../../lib/projects/firestore';
import { captureComposition, persistCompositionPhotos } from '../../lib/projects/composition';
import { getActiveSiteContext } from '../../lib/storage/siteContext';
import { shortSiteName } from '../../lib/siteContext/siteName';
import type { CaptureForSave } from '../../lib/capture/screenshotCapture';
import type { CaptureRecord } from '../../lib/projects/types';

/** Per composition. Enough for a working session; short of a silent archive. */
const MAX_CAPTURES = 20;

function defaultCompositionName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Composition ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Floating camera button overlaid on the viewport.
 *
 * Two destinations. **Download** is the escape hatch and never touches the
 * cloud: it works signed out, with no project, exactly as it always has.
 * **Save to composition** puts the capture in the record instead, uploading
 * the full-resolution PNG and listing it under the composition in Projects.
 *
 * A capture is always *of* something, so saving one with nothing saved yet
 * offers to save the composition (creating the project/site around it in the
 * same step) rather than holding the image in limbo.
 */
export const CaptureButton: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** A capture waiting for a composition to be created for it. */
  const [pendingShot, setPendingShot] = useState<CaptureForSave | null>(null);
  const [newName, setNewName] = useState('');

  const { user } = useAuthContext();
  const activeProject = useProjectsStore(s => s.activeProject);
  const activeSite = useProjectsStore(s => s.activeSite);
  const activeComposition = useProjectsStore(s => s.activeComposition);
  const setActiveProject = useProjectsStore(s => s.setActiveProject);
  const setActiveSite = useProjectsStore(s => s.setActiveSite);
  const setActiveComposition = useProjectsStore(s => s.setActiveComposition);
  const showToast = useToastStore(s => s.showToast);

  /** Saving is only on offer when there's an account to save into. */
  const canSave = Boolean(user);

  const flashShutter = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  };

  const handleDownload = async () => {
    setMenuOpen(false);
    if (busy) return;
    setBusy(true);
    flashShutter();
    try {
      await captureAndShare();
    } finally {
      setBusy(false);
    }
  };

  /** Upload the image and attach its record to an already-saved composition. */
  const attachCapture = async (
    shot: CaptureForSave,
    projectId: string,
    siteId: string,
    composition: { id: string; data: { captures?: CaptureRecord[] } },
  ) => {
    const existing = composition.data.captures ?? [];
    if (existing.length >= MAX_CAPTURES) {
      showToast(`This composition already holds ${MAX_CAPTURES} captures`, 'error');
      return;
    }
    const path = await uploadCapture(user!.uid, shot.blob);
    if (!path) {
      showToast('Capture could not be saved — download it instead', 'error');
      return;
    }
    const record: CaptureRecord = {
      id: crypto.randomUUID(),
      storagePath: path,
      thumbnailDataUrl: shot.thumbnailDataUrl,
      createdAt: Date.now(),
      projection: shot.projection,
      section: shot.section,
    };
    await appendCapture(projectId, siteId, composition.id, existing, record);
    // Keep the in-memory composition honest so the panel doesn't need a refetch.
    const current = useProjectsStore.getState().activeComposition;
    if (current && current.id === composition.id) {
      setActiveComposition({
        ...current,
        data: { ...current.data, captures: [...existing, record] },
      });
    }
    showToast('Capture saved to composition', 'success');
  };

  const handleSave = async () => {
    setMenuOpen(false);
    if (busy) return;
    setBusy(true);
    flashShutter();
    try {
      const shot = await captureForSave();
      if (!shot) {
        showToast('Nothing to capture on this view', 'error');
        return;
      }
      if (activeProject && activeSite && activeComposition) {
        await attachCapture(shot, activeProject.id, activeSite.id, activeComposition);
        return;
      }
      // Nothing saved yet — hold the image only as long as the dialog is open.
      setNewName(defaultCompositionName());
      setPendingShot(shot);
    } catch (err) {
      console.error('Capture failed:', err);
      showToast('Capture failed — please try again', 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Create whatever is missing (project → site → composition), then attach. */
  const handleCreateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingShot || !user) return;
    setBusy(true);
    try {
      const siteContext = getActiveSiteContext();
      const derivedName = shortSiteName(siteContext);

      let project = activeProject;
      if (!project) {
        project = await createProject(user.uid, derivedName || 'Untitled project');
        setActiveProject(project);
      }
      let site = activeSite;
      if (!site) {
        site = await createSite(project.id, derivedName || 'Untitled site', siteContext);
        setActiveSite(site);
      }
      const data = await persistCompositionPhotos(user.uid, captureComposition());
      const composition = await createComposition(
        project.id, site.id, newName.trim() || defaultCompositionName(), data,
      );
      setActiveComposition(composition);
      await attachCapture(pendingShot, project.id, site.id, composition);
      setPendingShot(null);
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Save failed — please try again', 'error');
    } finally {
      setBusy(false);
    }
  };

  const willCreate = [
    !activeProject ? 'project' : null,
    !activeSite ? 'site' : null,
    'composition',
  ].filter(Boolean).join(' → ');
  const derivedName = shortSiteName(getActiveSiteContext());

  return (
    <>
      {/* Menu — only when there's somewhere to save. Signed out, the button
          stays a one-click download exactly as before. */}
      {menuOpen && canSave && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-[86px] right-3 z-20 w-[210px] rounded-md border border-ink-200 bg-card shadow-[0_8px_24px_rgba(35,33,24,0.14)] overflow-hidden">
            <button
              onClick={handleSave}
              className="w-full text-left px-2.5 py-2 text-[12px] font-semibold text-primary bg-transparent border-0 border-b border-ink-200 cursor-pointer hover:bg-ink-100"
            >
              Save to composition
            </button>
            <button
              onClick={handleDownload}
              className="w-full text-left px-2.5 py-2 text-[12px] text-ink-800 bg-transparent border-0 cursor-pointer hover:bg-ink-100"
            >
              Download PNG
            </button>
          </div>
        </>
      )}

      <button
        onClick={() => (canSave ? setMenuOpen(o => !o) : handleDownload())}
        disabled={busy}
        title={canSave ? 'Capture this view' : 'Capture hi-res diagram PNG (transparent background)'}
        data-tour="capture"
        className={`absolute bottom-10 right-3 z-10 w-9 h-9 rounded-full border border-ink-200 flex items-center justify-center text-sm shadow-[0_2px_8px_rgba(35,33,24,0.18)] transition-colors duration-100 ${
          flash ? 'bg-ink-200' : 'bg-ink-100'
        } ${busy ? 'text-ink-400 cursor-default' : 'text-ink-600 cursor-pointer'}`}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
      </button>

      {/* Nothing saved yet: create the record this capture belongs to. */}
      {pendingShot && (
        <>
          <div
            className="fixed inset-0 z-[90] bg-black/40"
            onClick={() => setPendingShot(null)}
          />
          <form
            onSubmit={handleCreateAndSave}
            className="fixed z-[91] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] max-w-[92vw] rounded-lg border border-ink-200 bg-card p-4 shadow-[0_12px_40px_rgba(35,33,24,0.2)]"
          >
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink-600 m-0 mb-1">
              Save this capture
            </p>
            <p className="text-[12px] text-ink-600 m-0 mb-3 leading-relaxed">
              A capture is kept with a composition, and nothing is saved yet.
              Saving now creates the {willCreate} to hold it.
            </p>

            <img
              src={pendingShot.thumbnailDataUrl}
              alt="The capture about to be saved"
              className="w-full h-[110px] object-contain bg-ink-50 border border-ink-200 rounded mb-3"
            />

            {(!activeProject || !activeSite) && (
              <p className="text-[11px] text-ink-500 m-0 mb-2">
                {derivedName
                  ? <>Named after the active site: <span className="text-ink-700">{derivedName}</span></>
                  : 'No site context set — you can rename these in Projects afterwards.'}
              </p>
            )}

            <label className="text-[12px] text-ink-600 block mb-1">Composition name</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
              className="w-full bg-ink-100 border border-ink-200 rounded px-2 py-1.5 text-[12px] text-ink-800 outline-none focus:border-ink-400 mb-3"
            />

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded bg-primary hover:bg-primary/85 disabled:opacity-50 text-white text-[12px] py-2 cursor-pointer border-0"
              >
                {busy ? 'Saving…' : 'Save & keep capture'}
              </button>
              <button
                type="button"
                onClick={() => { setPendingShot(null); void handleDownload(); }}
                className="rounded border border-ink-200 bg-transparent hover:bg-ink-100 text-ink-600 text-[12px] px-3 cursor-pointer"
              >
                Just download
              </button>
            </div>
          </form>
        </>
      )}
    </>
  );
};
