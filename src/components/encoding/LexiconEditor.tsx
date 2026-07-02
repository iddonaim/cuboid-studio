/**
 * LexiconEditor — real authoring surface for lexicons (L3 Phase 2).
 *
 * Replaces the Phase 1 throwaway test surface. Functional and unstyled:
 * no layout investment, no visual polish — that rides the later overhaul.
 * The bar is: all fields editable, persist on save, library browsable.
 *
 * Structure:
 *   1. Active indicator + library toggle
 *   2. Library — list of saved lexicons with tag-filter, activate/rename/
 *      duplicate/delete actions, and a "New from default" button
 *   3. Editor — full authoring form for a draft lexicon (the active one by
 *      default, or any one opened from the library)
 *
 * Requires the user to be signed in (Firestore is owner-scoped).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useLexiconStore, DEFAULT_DESCRIPTIONS } from '../../store/useLexiconStore';
import {
  DEFAULT_LEXICON,
  type SpatialLexicon,
  type RhythmOption,
  type PlacementOption,
} from '../../prompts/lexicon.default';
import type { LexiconDoc } from '../../lib/projects/lexiconFirestore';

// ---------------------------------------------------------------------------
// Helpers

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---------------------------------------------------------------------------
// Tiny unstyled field primitives

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
      <span className="text-[9px] text-ink-500 uppercase tracking-wide">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-ink-50 border border-ink-200 rounded px-1.5 py-1 text-[10px] text-ink-800 outline-none focus:border-ink-400 w-full"
      />
    </div>
  );
}

function HintField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={3}
      className="bg-ink-100 border border-ink-200 rounded px-1.5 py-1 text-[9px] text-ink-500 italic outline-none focus:border-ink-300 resize-y w-full"
    />
  );
}

// ---------------------------------------------------------------------------
// Tag input — chips with add/remove

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-ink-500 uppercase tracking-wide">Tags</span>
      <div className="flex flex-wrap gap-1 mb-0.5">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-ink-200 rounded text-[9px] text-ink-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter(t => t !== tag))}
              className="text-ink-500 hover:text-destructive bg-transparent border-0 cursor-pointer p-0 leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="type a tag, press Enter"
          className="flex-1 bg-ink-50 border border-ink-200 rounded px-1.5 py-1 text-[10px] text-ink-800 outline-none focus:border-ink-400"
        />
        <button
          type="button"
          onClick={add}
          className="px-1.5 text-[9px] text-sky-500 hover:text-sky-300 bg-transparent border-0 cursor-pointer p-0"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rhythm option editor

function RhythmOptionList({
  options,
  onChange,
}: {
  options: RhythmOption[];
  onChange: (opts: RhythmOption[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((opt, i) => (
        <div key={i} className="flex flex-col gap-0.5 p-1.5 bg-ink-50 rounded border border-ink-200">
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-ink-400">Option {i + 1}</span>
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="text-[9px] text-destructive hover:text-destructive bg-transparent border-0 cursor-pointer p-0"
            >
              remove
            </button>
          </div>
          <Field
            label="id (machine name)"
            value={opt.id}
            onChange={v => onChange(options.map((o, j) => j === i ? { ...o, id: v } : o))}
          />
          <Field
            label="trigger (what fires this option)"
            value={opt.trigger}
            onChange={v => onChange(options.map((o, j) => j === i ? { ...o, trigger: v } : o))}
          />
          <Field
            label="label (word used in the reading)"
            value={opt.label}
            onChange={v => onChange(options.map((o, j) => j === i ? { ...o, label: v } : o))}
          />
          <Field
            label="grid hint (optional)"
            value={opt.grid_hint ?? ''}
            onChange={v =>
              onChange(options.map((o, j) => j === i ? { ...o, grid_hint: v || undefined } : o))
            }
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, { id: '', trigger: '', label: '' }])}
        className="self-start text-[9px] text-sky-600 hover:text-sky-400 bg-transparent border-0 cursor-pointer p-0"
      >
        + add option
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placement option editor

function PlacementOptionList({
  options,
  onChange,
}: {
  options: PlacementOption[];
  onChange: (opts: PlacementOption[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((opt, i) => (
        <div key={i} className="flex flex-col gap-0.5 p-1.5 bg-ink-50 rounded border border-ink-200">
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-ink-400">Option {i + 1}</span>
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="text-[9px] text-destructive hover:text-destructive bg-transparent border-0 cursor-pointer p-0"
            >
              remove
            </button>
          </div>
          <Field
            label="id (machine name)"
            value={opt.id}
            onChange={v => onChange(options.map((o, j) => j === i ? { ...o, id: v } : o))}
          />
          <Field
            label="trigger (what fires this option)"
            value={opt.trigger}
            onChange={v => onChange(options.map((o, j) => j === i ? { ...o, trigger: v } : o))}
          />
          <Field
            label="label (word used in the reading)"
            value={opt.label}
            onChange={v => onChange(options.map((o, j) => j === i ? { ...o, label: v } : o))}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, { id: '', trigger: '', label: '' }])}
        className="self-start text-[9px] text-sky-600 hover:text-sky-400 bg-transparent border-0 cursor-pointer p-0"
      >
        + add option
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full axis editor panel

interface EditorDraft {
  name: string;
  tags: string[];
  descriptions: Record<string, string>;
  lexicon: SpatialLexicon;
}

function EditorForm({
  draft,
  sourceId,
  onChangeDraft,
  onSaveAsNew,
  onUpdate,
  onClose,
  saving,
  error,
}: {
  draft: EditorDraft;
  sourceId: string | null;
  onChangeDraft: (d: EditorDraft) => void;
  onSaveAsNew: () => void;
  onUpdate: () => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}) {
  const patch = (partial: Partial<EditorDraft>) => onChangeDraft({ ...draft, ...partial });

  const patchLexicon = (partial: Partial<SpatialLexicon>) =>
    patch({ lexicon: { ...draft.lexicon, ...partial } });

  const patchHint = (axis: string, value: string) =>
    patch({ descriptions: { ...draft.descriptions, [axis]: value } });

  return (
    <div className="flex flex-col gap-3 pt-1 border-t border-ink-200 mt-1">

      {/* Name */}
      <Field label="Name" value={draft.name} onChange={v => patch({ name: v })} />

      {/* Tags */}
      <TagInput tags={draft.tags} onChange={tags => patch({ tags })} />

      {/* ─── Atmosphere ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-[9px] text-ink-700 font-semibold uppercase tracking-wide">Atmosphere</span>
        <HintField
          value={draft.descriptions['atmosphere'] ?? DEFAULT_DESCRIPTIONS['atmosphere']}
          onChange={v => patchHint('atmosphere', v)}
        />
        <Field
          label="pole low — dense end"
          value={draft.lexicon.atmosphere.pole_low}
          onChange={v => patchLexicon({ atmosphere: { ...draft.lexicon.atmosphere, pole_low: v } })}
        />
        <Field
          label="pole mid — airy middle"
          value={draft.lexicon.atmosphere.pole_mid}
          onChange={v => patchLexicon({ atmosphere: { ...draft.lexicon.atmosphere, pole_mid: v } })}
        />
        <Field
          label="pole high — chaotic end"
          value={draft.lexicon.atmosphere.pole_high}
          onChange={v => patchLexicon({ atmosphere: { ...draft.lexicon.atmosphere, pole_high: v } })}
        />
      </div>

      {/* ─── Light ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-[9px] text-ink-700 font-semibold uppercase tracking-wide">Light</span>
        <HintField
          value={draft.descriptions['light'] ?? DEFAULT_DESCRIPTIONS['light']}
          onChange={v => patchHint('light', v)}
        />
        <Field
          label="pole low — uniform/austere end"
          value={draft.lexicon.light.pole_low}
          onChange={v => patchLexicon({ light: { ...draft.lexicon.light, pole_low: v } })}
        />
        <Field
          label="pole high — varied/rich end"
          value={draft.lexicon.light.pole_high}
          onChange={v => patchLexicon({ light: { ...draft.lexicon.light, pole_high: v } })}
        />
        <div className="flex flex-col gap-0.5 p-1.5 bg-ink-50 rounded border border-ink-200 mt-0.5">
          <span className="text-[9px] text-ink-500 mb-0.5">Trigger labels (grammar mixing rules)</span>
          <Field
            label="uniform"
            value={draft.lexicon.light.triggers.uniform}
            onChange={v => patchLexicon({ light: { ...draft.lexicon.light, triggers: { ...draft.lexicon.light.triggers, uniform: v } } })}
          />
          <Field
            label="varied"
            value={draft.lexicon.light.triggers.varied}
            onChange={v => patchLexicon({ light: { ...draft.lexicon.light, triggers: { ...draft.lexicon.light.triggers, varied: v } } })}
          />
          <Field
            label="rich"
            value={draft.lexicon.light.triggers.rich}
            onChange={v => patchLexicon({ light: { ...draft.lexicon.light, triggers: { ...draft.lexicon.light.triggers, rich: v } } })}
          />
          <Field
            label="austere"
            value={draft.lexicon.light.triggers.austere}
            onChange={v => patchLexicon({ light: { ...draft.lexicon.light, triggers: { ...draft.lexicon.light.triggers, austere: v } } })}
          />
        </div>
      </div>

      {/* ─── Emotion ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-[9px] text-ink-700 font-semibold uppercase tracking-wide">Emotion</span>
        <HintField
          value={draft.descriptions['emotion'] ?? DEFAULT_DESCRIPTIONS['emotion']}
          onChange={v => patchHint('emotion', v)}
        />
        <Field
          label="pole low — calm end"
          value={draft.lexicon.emotion.pole_low}
          onChange={v => patchLexicon({ emotion: { ...draft.lexicon.emotion, pole_low: v } })}
        />
        <Field
          label="pole high — energetic end"
          value={draft.lexicon.emotion.pole_high}
          onChange={v => patchLexicon({ emotion: { ...draft.lexicon.emotion, pole_high: v } })}
        />
        <Field
          label="melancholic override (fires regardless of position)"
          value={draft.lexicon.emotion.melancholic}
          onChange={v => patchLexicon({ emotion: { ...draft.lexicon.emotion, melancholic: v } })}
        />
      </div>

      {/* ─── Rhythm ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-[9px] text-ink-700 font-semibold uppercase tracking-wide">Rhythm</span>
        <HintField
          value={draft.descriptions['rhythm'] ?? DEFAULT_DESCRIPTIONS['rhythm']}
          onChange={v => patchHint('rhythm', v)}
        />
        <RhythmOptionList
          options={draft.lexicon.rhythm.options}
          onChange={opts => patchLexicon({ rhythm: { options: opts } })}
        />
      </div>

      {/* ─── Placement ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-[9px] text-ink-700 font-semibold uppercase tracking-wide">Placement</span>
        <HintField
          value={draft.descriptions['placement'] ?? DEFAULT_DESCRIPTIONS['placement']}
          onChange={v => patchHint('placement', v)}
        />
        <PlacementOptionList
          options={draft.lexicon.placement.options}
          onChange={opts => patchLexicon({ placement: { options: opts } })}
        />
      </div>

      {/* Reset to DEFAULT_LEXICON values */}
      <button
        type="button"
        onClick={() =>
          onChangeDraft({
            ...draft,
            lexicon: deepClone(DEFAULT_LEXICON),
            descriptions: { ...DEFAULT_DESCRIPTIONS },
          })
        }
        className="self-start text-[9px] text-ink-400 hover:text-ink-600 bg-transparent border-0 cursor-pointer p-0"
      >
        Reset vocabulary to default values
      </button>

      {error && <span className="text-[9px] text-destructive">{error}</span>}

      {/* Save actions */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {sourceId && (
          <button
            type="button"
            onClick={onUpdate}
            disabled={saving || !draft.name.trim()}
            className="px-2 py-1 text-[10px] bg-ink-200 hover:bg-ink-300 text-ink-800 rounded border-0 cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Update "${draft.name || '…'}"`}
          </button>
        )}
        <button
          type="button"
          onClick={onSaveAsNew}
          disabled={saving || !draft.name.trim()}
          className="px-2 py-1 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary rounded border-0 cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save as new'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-[10px] text-ink-500 hover:text-ink-700 bg-transparent border-0 cursor-pointer p-0"
        >
          Close editor
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library — list of saved lexicons with tag filter

function LibraryPanel({
  lexicons,
  activeLexiconId,
  tagFilter,
  onTagFilterChange,
  onActivate,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  onNewFromDefault,
}: {
  lexicons: LexiconDoc[];
  activeLexiconId: string | null;
  tagFilter: string;
  onTagFilterChange: (v: string) => void;
  onActivate: (id: string | null) => void;
  onEdit: (doc: LexiconDoc) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onNewFromDefault: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const filtered = tagFilter.trim()
    ? lexicons.filter(l =>
        (l.tags ?? []).some(t =>
          t.toLowerCase().includes(tagFilter.trim().toLowerCase()),
        ),
      )
    : lexicons;

  const startRename = (l: LexiconDoc) => {
    setRenamingId(l.id);
    setRenameValue(l.name);
  };

  const commitRename = (id: string) => {
    if (renameValue.trim()) onRename(id, renameValue.trim());
    setRenamingId(null);
  };

  return (
    <div className="flex flex-col gap-1.5 pt-1 border-t border-ink-200 mt-1">
      {/* Tag filter */}
      <div className="flex gap-1 items-center">
        <input
          type="text"
          value={tagFilter}
          onChange={e => onTagFilterChange(e.target.value)}
          placeholder="filter by tag…"
          className="flex-1 bg-ink-50 border border-ink-200 rounded px-1.5 py-1 text-[10px] text-ink-700 outline-none focus:border-ink-400"
        />
        {tagFilter && (
          <button
            type="button"
            onClick={() => onTagFilterChange('')}
            className="text-[9px] text-ink-400 hover:text-ink-600 bg-transparent border-0 cursor-pointer p-0"
          >
            clear
          </button>
        )}
      </div>

      {/* Activate default */}
      <div
        className={`flex items-center justify-between gap-1 px-1.5 py-1 rounded border ${
          activeLexiconId === null
            ? 'border-sky-600 bg-sky-950'
            : 'border-ink-200'
        }`}
      >
        <span className="text-[10px] text-ink-700">Default (built-in)</span>
        {activeLexiconId !== null && (
          <button
            type="button"
            onClick={() => onActivate(null)}
            className="text-[9px] text-sky-500 hover:text-sky-300 bg-transparent border-0 cursor-pointer p-0"
          >
            Activate
          </button>
        )}
        {activeLexiconId === null && (
          <span className="text-[9px] text-sky-400">Active</span>
        )}
      </div>

      {/* Saved lexicons */}
      {filtered.length === 0 && (
        <span className="text-[9px] text-ink-400 italic px-1">
          {lexicons.length === 0 ? 'No saved lexicons yet.' : 'No lexicons match that tag.'}
        </span>
      )}
      {filtered.map(l => (
        <div
          key={l.id}
          className={`flex flex-col gap-1 px-1.5 py-1 rounded border ${
            activeLexiconId === l.id
              ? 'border-sky-600 bg-sky-950'
              : 'border-ink-200'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            {renamingId === l.id ? (
              <input
                autoFocus
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(l.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(l.id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="flex-1 bg-ink-100 border border-ink-300 rounded px-1 py-0.5 text-[10px] text-ink-800 outline-none"
              />
            ) : (
              <span className="text-[10px] text-ink-800 truncate flex-1">{l.name}</span>
            )}
            {activeLexiconId === l.id && (
              <span className="text-[9px] text-sky-400 shrink-0">Active</span>
            )}
          </div>

          {/* Tags */}
          {(l.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-0.5">
              {(l.tags ?? []).map(t => (
                <span
                  key={t}
                  className="px-1 py-0.5 bg-ink-200 rounded text-[8px] text-ink-600"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {activeLexiconId !== l.id && (
              <button
                type="button"
                onClick={() => onActivate(l.id)}
                className="text-[9px] text-sky-500 hover:text-sky-300 bg-transparent border-0 cursor-pointer p-0"
              >
                Activate
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit(l)}
              className="text-[9px] text-ink-600 hover:text-ink-800 bg-transparent border-0 cursor-pointer p-0"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => startRename(l)}
              className="text-[9px] text-ink-600 hover:text-ink-800 bg-transparent border-0 cursor-pointer p-0"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onDuplicate(l.id)}
              className="text-[9px] text-ink-600 hover:text-ink-800 bg-transparent border-0 cursor-pointer p-0"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => onDelete(l.id, l.name)}
              className="text-[9px] text-destructive hover:text-destructive bg-transparent border-0 cursor-pointer p-0"
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onNewFromDefault}
        className="self-start text-[9px] text-green-700 hover:text-green-600 bg-transparent border-0 cursor-pointer p-0 mt-0.5"
      >
        + New lexicon from default
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level component

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
  const duplicateLexicon = useLexiconStore(s => s.duplicateLexicon);
  const setActiveLexiconId = useLexiconStore(s => s.setActiveLexiconId);

  // Library open/close state
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Tag filter for the library
  const [tagFilter, setTagFilter] = useState('');

  // Editor draft state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load lexicons whenever the authenticated user changes.
  useEffect(() => {
    if (user) loadLexicons(user.uid);
  }, [user, loadLexicons]);

  // Helper: build a draft from a LexiconDoc.
  const draftFromDoc = useCallback((doc: LexiconDoc): EditorDraft => ({
    name: doc.name,
    tags: doc.tags ? [...doc.tags] : [],
    descriptions: { ...DEFAULT_DESCRIPTIONS, ...(doc.descriptions ?? {}) },
    lexicon: deepClone(doc.lexicon),
  }), []);

  // Helper: open the editor for a specific doc.
  const openEditor = useCallback((doc: LexiconDoc) => {
    setDraft(draftFromDoc(doc));
    setEditingSourceId(doc.id);
    setError(null);
    setEditorOpen(true);
    setLibraryOpen(false);
  }, [draftFromDoc]);

  // Open editor pre-loaded with the active lexicon (or default).
  const openEditorForActive = useCallback(() => {
    const activeDoc = activeLexiconId
      ? lexicons.find(l => l.id === activeLexiconId)
      : null;

    if (activeDoc) {
      openEditor(activeDoc);
    } else {
      // Editing the default — will always "Save as new" (no update path).
      setDraft({
        name: '',
        tags: [],
        descriptions: { ...DEFAULT_DESCRIPTIONS },
        lexicon: deepClone(DEFAULT_LEXICON),
      });
      setEditingSourceId(null);
      setError(null);
      setEditorOpen(true);
      setLibraryOpen(false);
    }
  }, [activeLexiconId, lexicons, openEditor]);

  // Open a blank draft from default.
  const openNewFromDefault = useCallback(() => {
    setDraft({
      name: '',
      tags: [],
      descriptions: { ...DEFAULT_DESCRIPTIONS },
      lexicon: deepClone(DEFAULT_LEXICON),
    });
    setEditingSourceId(null);
    setError(null);
    setEditorOpen(true);
    setLibraryOpen(false);
  }, []);

  // Save as new lexicon, activate it.
  const handleSaveAsNew = async () => {
    if (!draft || !draft.name.trim() || !user) return;
    setSaving(true);
    setError(null);
    try {
      const doc = await createLexicon(user.uid, draft.name.trim(), draft.lexicon, {
        tags: draft.tags,
        descriptions: draft.descriptions,
      });
      setActiveLexiconId(doc.id);
      setEditorOpen(false);
    } catch {
      setError('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // Update an existing lexicon in place.
  const handleUpdate = async () => {
    if (!draft || !editingSourceId) return;
    setSaving(true);
    setError(null);
    try {
      await updateLexicon(editingSourceId, {
        name: draft.name.trim() || draft.name,
        lexicon: draft.lexicon,
        tags: draft.tags,
        descriptions: draft.descriptions,
      });
      setEditorOpen(false);
    } catch {
      setError('Update failed.');
    } finally {
      setSaving(false);
    }
  };

  // Rename from library (name-only, no editor open).
  const handleRename = async (id: string, name: string) => {
    try {
      await updateLexicon(id, { name });
    } catch {
      // Silent — the inline field will still show the old name on next render.
    }
  };

  // Duplicate from library.
  const handleDuplicate = async (id: string) => {
    if (!user) return;
    try {
      await duplicateLexicon(id, user.uid);
    } catch {
      // No-op for now — would need a toast for production.
    }
  };

  // Delete from library.
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete lexicon "${name}"?`)) return;
    try {
      await deleteLexicon(id);
      // If we were editing this one, close the editor.
      if (editingSourceId === id) setEditorOpen(false);
    } catch {
      // No-op
    }
  };

  // ── Unauthenticated state ──────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="text-ink-400 text-[10px] italic px-1">
        Sign in to create and use custom lexicons.
      </div>
    );
  }

  const activeName = activeLexiconId
    ? (lexicons.find(l => l.id === activeLexiconId)?.name ?? 'Unknown')
    : 'Default';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-1.5 p-2 bg-ink-100 border border-ink-200 rounded">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] text-ink-600 font-medium">
          Lexicon:&nbsp;
          <span className="text-ink-800">{loading ? '…' : activeName}</span>
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setLibraryOpen(v => !v); if (editorOpen) setEditorOpen(false); }}
            className="text-[9px] text-ink-500 hover:text-ink-700 bg-transparent border-0 cursor-pointer underline p-0"
          >
            {libraryOpen ? 'Close library' : 'Library'}
          </button>
          <button
            type="button"
            onClick={() => { openEditorForActive(); setLibraryOpen(false); }}
            className="text-[9px] text-ink-500 hover:text-ink-700 bg-transparent border-0 cursor-pointer underline p-0"
          >
            {editorOpen ? 'Close editor' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Library panel */}
      {libraryOpen && (
        <LibraryPanel
          lexicons={lexicons}
          activeLexiconId={activeLexiconId}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          onActivate={setActiveLexiconId}
          onEdit={openEditor}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onNewFromDefault={openNewFromDefault}
        />
      )}

      {/* Editor panel */}
      {editorOpen && draft && (
        <EditorForm
          draft={draft}
          sourceId={editingSourceId}
          onChangeDraft={setDraft}
          onSaveAsNew={handleSaveAsNew}
          onUpdate={handleUpdate}
          onClose={() => setEditorOpen(false)}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
};
