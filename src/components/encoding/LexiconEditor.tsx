/**
 * LexiconEditor — minimal throwaway test surface for L3 backstage.
 *
 * This is deliberately undesigned: functional enough to verify the consequential
 * loop (edit a value → active → encode differs) and nothing more. The designed
 * authoring UI with hints, layout, tagging, and library browsing rides the
 * overhaul; this component will be replaced entirely.
 *
 * Requires the user to be signed in (lexicons are persisted per-user in
 * Firestore). Shows a "sign in to use lexicons" note when not authenticated.
 */
import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useLexiconStore } from '../../store/useLexiconStore';
import { DEFAULT_LEXICON, type SpatialLexicon, type RhythmOption, type PlacementOption } from '../../prompts/lexicon.default';

// ---------------------------------------------------------------------------
// Helpers

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// Small labelled text input for throwaway form fields.
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-slate-200 outline-none focus:border-slate-500"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component

export const LexiconEditor: React.FC = () => {
  const { user } = useAuthContext();

  const lexicons = useLexiconStore(s => s.lexicons);
  const loading = useLexiconStore(s => s.loading);
  const activeLexiconId = useLexiconStore(s => s.activeLexiconId);
  const getActiveLexicon = useLexiconStore(s => s.getActiveLexicon);
  const loadLexicons = useLexiconStore(s => s.loadLexicons);
  const createLexicon = useLexiconStore(s => s.createLexicon);
  const updateLexicon = useLexiconStore(s => s.updateLexicon);
  const deleteLexicon = useLexiconStore(s => s.deleteLexicon);
  const setActiveLexiconId = useLexiconStore(s => s.setActiveLexiconId);

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<SpatialLexicon | null>(null);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load lexicons whenever the authenticated user changes.
  useEffect(() => {
    if (user) loadLexicons(user.uid);
  }, [user, loadLexicons]);

  if (!user) {
    return (
      <div className="text-slate-600 text-[10px] italic px-1">
        Sign in to create and use custom lexicons.
      </div>
    );
  }

  const activeName =
    activeLexiconId
      ? (lexicons.find(l => l.id === activeLexiconId)?.name ?? 'Unknown')
      : 'Default';

  // Open / close the editor. On open, snapshot the active lexicon into a draft.
  const handleToggleEditor = () => {
    if (!editorOpen) {
      const current = getActiveLexicon();
      setDraft(deepClone(current));
      const currentDoc = lexicons.find(l => l.id === activeLexiconId);
      setDraftName(currentDoc?.name ?? 'My lexicon');
      setError(null);
    }
    setEditorOpen(v => !v);
  };

  // Patch helpers for deep draft updates.
  const patchDraft = (partial: Partial<SpatialLexicon>) =>
    setDraft(d => d ? { ...d, ...partial } : d);

  const patchAtmosphere = (k: keyof SpatialLexicon['atmosphere'], v: string) =>
    patchDraft({ atmosphere: { ...draft!.atmosphere, [k]: v } });

  const patchLight = (k: keyof SpatialLexicon['light'], v: string) =>
    patchDraft({ light: { ...draft!.light, [k]: v } });

  const patchLightTrigger = (k: keyof SpatialLexicon['light']['triggers'], v: string) =>
    patchDraft({ light: { ...draft!.light, triggers: { ...draft!.light.triggers, [k]: v } } });

  const patchEmotion = (k: keyof SpatialLexicon['emotion'], v: string) =>
    patchDraft({ emotion: { ...draft!.emotion, [k]: v } });

  const setRhythmOptions = (opts: RhythmOption[]) =>
    patchDraft({ rhythm: { options: opts } });

  const setPlacementOptions = (opts: PlacementOption[]) =>
    patchDraft({ placement: { options: opts } });

  // Save the draft as a new named lexicon and make it active.
  const handleSaveAsNew = async () => {
    if (!draft || !draftName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const doc = await createLexicon(user.uid, draftName.trim(), draft);
      setActiveLexiconId(doc.id);
      setEditorOpen(false);
    } catch {
      setError('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // Update the currently active saved lexicon in place.
  const handleUpdate = async () => {
    if (!draft || !activeLexiconId) return;
    setSaving(true);
    setError(null);
    try {
      await updateLexicon(activeLexiconId, { name: draftName.trim() || activeName, lexicon: draft });
      setEditorOpen(false);
    } catch {
      setError('Update failed.');
    } finally {
      setSaving(false);
    }
  };

  // Delete the currently active saved lexicon (reverts to default).
  const handleDelete = async () => {
    if (!activeLexiconId) return;
    if (!confirm(`Delete lexicon "${activeName}"?`)) return;
    try {
      await deleteLexicon(activeLexiconId);
    } catch {
      setError('Delete failed.');
    }
  };

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-slate-800 border border-slate-700 rounded">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400 font-medium">
          Lexicon:&nbsp;
          <span className="text-slate-200">{activeName}</span>
        </span>
        <button
          type="button"
          onClick={handleToggleEditor}
          className="text-[9px] text-slate-500 hover:text-slate-300 bg-transparent border-0 cursor-pointer underline p-0"
        >
          {editorOpen ? 'Close' : 'Edit'}
        </button>
      </div>

      {/* Lexicon selector */}
      {loading ? (
        <span className="text-[9px] text-slate-600">Loading…</span>
      ) : (
        <select
          value={activeLexiconId ?? ''}
          onChange={e => setActiveLexiconId(e.target.value || null)}
          className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-slate-300 outline-none"
        >
          <option value="">Default</option>
          {lexicons.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}

      {/* Delete button (only for saved lexicons) */}
      {activeLexiconId && !editorOpen && (
        <button
          type="button"
          onClick={handleDelete}
          className="self-start text-[9px] text-red-600 hover:text-red-400 bg-transparent border-0 cursor-pointer p-0"
        >
          Delete lexicon
        </button>
      )}

      {/* Editor */}
      {editorOpen && draft && (
        <div className="flex flex-col gap-3 pt-1 border-t border-slate-700 mt-1">

          {/* Name */}
          <Field label="Name" value={draftName} onChange={setDraftName} />

          {/* Atmosphere */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-400 font-medium">Atmosphere</span>
            <Field label="pole low" value={draft.atmosphere.pole_low} onChange={v => patchAtmosphere('pole_low', v)} />
            <Field label="pole mid" value={draft.atmosphere.pole_mid} onChange={v => patchAtmosphere('pole_mid', v)} />
            <Field label="pole high" value={draft.atmosphere.pole_high} onChange={v => patchAtmosphere('pole_high', v)} />
          </div>

          {/* Light */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-400 font-medium">Light</span>
            <Field label="pole low" value={draft.light.pole_low} onChange={v => patchLight('pole_low', v)} />
            <Field label="pole high" value={draft.light.pole_high} onChange={v => patchLight('pole_high', v)} />
            <Field label="trigger: uniform" value={draft.light.triggers.uniform} onChange={v => patchLightTrigger('uniform', v)} />
            <Field label="trigger: varied" value={draft.light.triggers.varied} onChange={v => patchLightTrigger('varied', v)} />
            <Field label="trigger: rich" value={draft.light.triggers.rich} onChange={v => patchLightTrigger('rich', v)} />
            <Field label="trigger: austere" value={draft.light.triggers.austere} onChange={v => patchLightTrigger('austere', v)} />
          </div>

          {/* Emotion */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-400 font-medium">Emotion</span>
            <Field label="pole low" value={draft.emotion.pole_low} onChange={v => patchEmotion('pole_low', v)} />
            <Field label="pole high" value={draft.emotion.pole_high} onChange={v => patchEmotion('pole_high', v)} />
            <Field label="melancholic override" value={draft.emotion.melancholic} onChange={v => patchEmotion('melancholic', v)} />
          </div>

          {/* Rhythm options */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-400 font-medium">Rhythm options</span>
            {draft.rhythm.options.map((opt, i) => (
              <div key={i} className="flex flex-col gap-0.5 p-1.5 bg-slate-900 rounded border border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] text-slate-600">Option {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => setRhythmOptions(draft.rhythm.options.filter((_, j) => j !== i))}
                    className="text-[9px] text-red-700 hover:text-red-500 bg-transparent border-0 cursor-pointer p-0"
                  >
                    remove
                  </button>
                </div>
                <Field label="id" value={opt.id} onChange={v => setRhythmOptions(draft.rhythm.options.map((o, j) => j === i ? { ...o, id: v } : o))} />
                <Field label="trigger" value={opt.trigger} onChange={v => setRhythmOptions(draft.rhythm.options.map((o, j) => j === i ? { ...o, trigger: v } : o))} />
                <Field label="label" value={opt.label} onChange={v => setRhythmOptions(draft.rhythm.options.map((o, j) => j === i ? { ...o, label: v } : o))} />
                <Field label="grid hint (optional)" value={opt.grid_hint ?? ''} onChange={v => setRhythmOptions(draft.rhythm.options.map((o, j) => j === i ? { ...o, grid_hint: v || undefined } : o))} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRhythmOptions([...draft.rhythm.options, { id: '', trigger: '', label: '' }])}
              className="self-start text-[9px] text-sky-600 hover:text-sky-400 bg-transparent border-0 cursor-pointer p-0"
            >
              + add option
            </button>
          </div>

          {/* Placement options */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-400 font-medium">Placement options</span>
            {draft.placement.options.map((opt, i) => (
              <div key={i} className="flex flex-col gap-0.5 p-1.5 bg-slate-900 rounded border border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] text-slate-600">Option {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => setPlacementOptions(draft.placement.options.filter((_, j) => j !== i))}
                    className="text-[9px] text-red-700 hover:text-red-500 bg-transparent border-0 cursor-pointer p-0"
                  >
                    remove
                  </button>
                </div>
                <Field label="id" value={opt.id} onChange={v => setPlacementOptions(draft.placement.options.map((o, j) => j === i ? { ...o, id: v } : o))} />
                <Field label="trigger" value={opt.trigger} onChange={v => setPlacementOptions(draft.placement.options.map((o, j) => j === i ? { ...o, trigger: v } : o))} />
                <Field label="label" value={opt.label} onChange={v => setPlacementOptions(draft.placement.options.map((o, j) => j === i ? { ...o, label: v } : o))} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPlacementOptions([...draft.placement.options, { id: '', trigger: '', label: '' }])}
              className="self-start text-[9px] text-sky-600 hover:text-sky-400 bg-transparent border-0 cursor-pointer p-0"
            >
              + add option
            </button>
          </div>

          {/* Reset to DEFAULT_LEXICON values */}
          <button
            type="button"
            onClick={() => { setDraft(deepClone(DEFAULT_LEXICON)); setDraftName(''); }}
            className="self-start text-[9px] text-slate-600 hover:text-slate-400 bg-transparent border-0 cursor-pointer p-0"
          >
            Reset draft to default values
          </button>

          {/* Error */}
          {error && (
            <span className="text-[9px] text-red-400">{error}</span>
          )}

          {/* Save actions */}
          <div className="flex gap-1.5 flex-wrap">
            {activeLexiconId && (
              <button
                type="button"
                onClick={handleUpdate}
                disabled={saving}
                className="px-2 py-1 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 rounded border-0 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving…' : `Update "${activeName}"`}
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveAsNew}
              disabled={saving || !draftName.trim()}
              className="px-2 py-1 text-[10px] bg-emerald-900 hover:bg-emerald-800 text-emerald-200 rounded border-0 cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save as new'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
