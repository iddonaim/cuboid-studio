/**
 * TranslationLexiconEditor — authoring surface for translation lexicons, the
 * "Level A" editable-prompt layer for Pataphysical / Evolution.
 *
 * Mirrors the Encode LexiconEditor (same primitives, library + draft flow,
 * owner-scoped Firestore). The vocabulary it edits is the words and reasoning
 * the translation prompt uses: rhetorical-move definitions, the move→operator
 * mapping, edge-type meanings, affect→geometry rules, decay guidance, and the
 * confidence-axis descriptions.
 *
 * Level A guarantee: the set of operator classes and edge types is FIXED. The
 * editor offers them as closed dropdowns, so a custom lexicon can never map to a
 * token the API validator would reject. Editing changes how the model reasons,
 * not which tokens exist.
 *
 * Functional and lightly styled — matches LexiconEditor's bar: all fields
 * editable, persist on save, library browsable. Requires sign-in.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useTranslationLexiconStore } from '../../store/useTranslationLexiconStore';
import {
  DEFAULT_TRANSLATION_LEXICON,
  DEFAULT_TRANSLATION_DESCRIPTIONS,
  OPERATOR_IDS,
  EDGE_TYPE_IDS,
  type TranslationLexicon,
  type RhetoricalMoveEntry,
  type EdgeTypeEntry,
  type AffectGeometryEntry,
} from '../../prompts/translationLexicon.default';
import type { OperatorClassV2, EdgeType } from '../../lib/operators/types';
import type { TranslationLexiconDoc } from '../../lib/projects/translationLexiconFirestore';

// ---------------------------------------------------------------------------
// Helpers

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

interface EditorDraft {
  name: string;
  tags: string[];
  descriptions: Record<string, string>;
  lexicon: TranslationLexicon;
}

// ---------------------------------------------------------------------------
// Field primitives (same look as LexiconEditor)

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-ink-500 uppercase tracking-wide">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-ink-50 border border-ink-200 rounded px-1.5 py-1 text-[11px] text-ink-800 outline-none focus:border-ink-400 w-full"
      />
    </div>
  );
}

function SelectField<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-ink-500 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="bg-ink-50 border border-ink-200 rounded px-1.5 py-1 text-[11px] text-ink-800 outline-none focus:border-ink-400 w-full"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function HintField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={3}
      className="bg-ink-100 border border-ink-200 rounded px-1.5 py-1 text-[10px] text-ink-500 italic outline-none focus:border-ink-300 resize-y w-full"
    />
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-ink-500 uppercase tracking-wide">Tags</span>
      <div className="flex flex-wrap gap-1 mb-0.5">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-ink-200 rounded text-[10px] text-ink-700">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))}
              className="text-ink-500 hover:text-destructive bg-transparent border-0 cursor-pointer p-0 leading-none">×</button>
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
          className="flex-1 bg-ink-50 border border-ink-200 rounded px-1.5 py-1 text-[11px] text-ink-800 outline-none focus:border-ink-400"
        />
        <button type="button" onClick={add} className="px-1.5 text-[10px] text-sky-500 hover:text-sky-300 bg-transparent border-0 cursor-pointer p-0">Add</button>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <span className="text-[10px] text-ink-700 font-semibold uppercase tracking-wide">{title}</span>;
}

function RemoveRow({ index, label, onRemove }: { index: number; label: string; onRemove: () => void }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-ink-400">{label} {index + 1}</span>
      <button type="button" onClick={onRemove} className="text-[10px] text-destructive hover:text-destructive bg-transparent border-0 cursor-pointer p-0">remove</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section list editors

function MoveList({ moves, onChange }: { moves: RhetoricalMoveEntry[]; onChange: (m: RhetoricalMoveEntry[]) => void }) {
  const patch = (i: number, p: Partial<RhetoricalMoveEntry>) =>
    onChange(moves.map((m, j) => j === i ? { ...m, ...p } : m));
  return (
    <div className="flex flex-col gap-1">
      {moves.map((m, i) => (
        <div key={i} className="flex flex-col gap-0.5 p-1.5 bg-ink-50 rounded border border-ink-200">
          <RemoveRow index={i} label="Move" onRemove={() => onChange(moves.filter((_, j) => j !== i))} />
          <Field label="label (e.g. Irony)" value={m.label} onChange={v => patch(i, { label: v })} />
          <Field label="definition (Pass 1: how it's recognised)" value={m.definition} onChange={v => patch(i, { definition: v })} />
          <SelectField<OperatorClassV2> label="maps to operator" value={m.operator} options={OPERATOR_IDS} onChange={v => patch(i, { operator: v })} />
          <Field label="mapping note (text after the operator)" value={m.mapping_note} onChange={v => patch(i, { mapping_note: v })} />
        </div>
      ))}
      <button type="button"
        onClick={() => onChange([...moves, { label: '', definition: '', operator: OPERATOR_IDS[0], mapping_note: '' }])}
        className="self-start text-[10px] text-sky-600 hover:text-sky-400 bg-transparent border-0 cursor-pointer p-0">+ add move</button>
    </div>
  );
}

function EdgeList({ edges, onChange }: { edges: EdgeTypeEntry[]; onChange: (e: EdgeTypeEntry[]) => void }) {
  const patch = (i: number, p: Partial<EdgeTypeEntry>) =>
    onChange(edges.map((e, j) => j === i ? { ...e, ...p } : e));
  return (
    <div className="flex flex-col gap-1">
      {edges.map((e, i) => (
        <div key={i} className="flex flex-col gap-0.5 p-1.5 bg-ink-50 rounded border border-ink-200">
          <RemoveRow index={i} label="Edge" onRemove={() => onChange(edges.filter((_, j) => j !== i))} />
          <SelectField<EdgeType> label="edge type (fixed set)" value={e.id} options={EDGE_TYPE_IDS} onChange={v => patch(i, { id: v })} />
          <Field label="definition" value={e.definition} onChange={v => patch(i, { definition: v })} />
        </div>
      ))}
      <button type="button"
        onClick={() => onChange([...edges, { id: EDGE_TYPE_IDS[0], definition: '' }])}
        className="self-start text-[10px] text-sky-600 hover:text-sky-400 bg-transparent border-0 cursor-pointer p-0">+ add edge type</button>
    </div>
  );
}

function AffectList({ affects, onChange }: { affects: AffectGeometryEntry[]; onChange: (a: AffectGeometryEntry[]) => void }) {
  const patch = (i: number, p: Partial<AffectGeometryEntry>) =>
    onChange(affects.map((a, j) => j === i ? { ...a, ...p } : a));
  return (
    <div className="flex flex-col gap-1">
      {affects.map((a, i) => (
        <div key={i} className="flex flex-col gap-0.5 p-1.5 bg-ink-50 rounded border border-ink-200">
          <RemoveRow index={i} label="Rule" onRemove={() => onChange(affects.filter((_, j) => j !== i))} />
          <Field label="trigger (geometric tendency)" value={a.trigger} onChange={v => patch(i, { trigger: v })} />
          <Field label="example affects" value={a.examples} onChange={v => patch(i, { examples: v })} />
          <Field label="cutter implication" value={a.implication} onChange={v => patch(i, { implication: v })} />
        </div>
      ))}
      <button type="button"
        onClick={() => onChange([...affects, { trigger: '', examples: '', implication: '' }])}
        className="self-start text-[10px] text-sky-600 hover:text-sky-400 bg-transparent border-0 cursor-pointer p-0">+ add rule</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor form

function EditorForm({
  draft, sourceId, onChangeDraft, onSaveAsNew, onUpdate, onClose, saving, error,
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
  const patchLexicon = (p: Partial<TranslationLexicon>) =>
    onChangeDraft({ ...draft, lexicon: { ...draft.lexicon, ...p } });
  const patchHint = (k: string, v: string) =>
    onChangeDraft({ ...draft, descriptions: { ...draft.descriptions, [k]: v } });

  const hint = (k: string) => draft.descriptions[k] ?? DEFAULT_TRANSLATION_DESCRIPTIONS[k] ?? '';

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-ink-200 mt-1">
      <Field label="name" value={draft.name} onChange={v => onChangeDraft({ ...draft, name: v })} />
      <TagInput tags={draft.tags} onChange={t => onChangeDraft({ ...draft, tags: t })} />

      {/* Rhetorical moves */}
      <div className="flex flex-col gap-1">
        <SectionHeader title="Rhetorical moves → operators" />
        <HintField value={hint('rhetorical_moves')} onChange={v => patchHint('rhetorical_moves', v)} />
        <MoveList moves={draft.lexicon.rhetorical_moves} onChange={m => patchLexicon({ rhetorical_moves: m })} />
      </div>

      {/* Edge types */}
      <div className="flex flex-col gap-1">
        <SectionHeader title="Edge types (operator targets)" />
        <HintField value={hint('edge_types')} onChange={v => patchHint('edge_types', v)} />
        <EdgeList edges={draft.lexicon.edge_types} onChange={e => patchLexicon({ edge_types: e })} />
      </div>

      {/* Affect → geometry */}
      <div className="flex flex-col gap-1">
        <SectionHeader title="Affect → cutter geometry" />
        <HintField value={hint('affect_geometry')} onChange={v => patchHint('affect_geometry', v)} />
        <AffectList affects={draft.lexicon.affect_geometry} onChange={a => patchLexicon({ affect_geometry: a })} />
      </div>

      {/* Decay */}
      <div className="flex flex-col gap-1">
        <SectionHeader title="Decay" />
        <HintField value={hint('decay')} onChange={v => patchHint('decay', v)} />
        <Field label="viral / widely shared" value={draft.lexicon.decay.viral} onChange={v => patchLexicon({ decay: { ...draft.lexicon.decay, viral: v } })} />
        <Field label="niche / fleeting" value={draft.lexicon.decay.niche} onChange={v => patchLexicon({ decay: { ...draft.lexicon.decay, niche: v } })} />
        <Field label="no temporal info (default)" value={draft.lexicon.decay.default} onChange={v => patchLexicon({ decay: { ...draft.lexicon.decay, default: v } })} />
      </div>

      {/* Confidence axes — four fixed axes, descriptions editable */}
      <div className="flex flex-col gap-1">
        <SectionHeader title="Confidence vector axes" />
        <HintField value={hint('confidence_axes')} onChange={v => patchHint('confidence_axes', v)} />
        {draft.lexicon.confidence_axes.map((ax, i) => (
          <div key={ax.key} className="flex flex-col gap-0.5 p-1.5 bg-ink-50 rounded border border-ink-200">
            <span className="text-[10px] text-ink-400">{ax.key}</span>
            <Field label="label" value={ax.label} onChange={v => patchLexicon({ confidence_axes: draft.lexicon.confidence_axes.map((a, j) => j === i ? { ...a, label: v } : a) })} />
            <Field label="abbr" value={ax.abbr} onChange={v => patchLexicon({ confidence_axes: draft.lexicon.confidence_axes.map((a, j) => j === i ? { ...a, abbr: v } : a) })} />
            <Field label="description" value={ax.description} onChange={v => patchLexicon({ confidence_axes: draft.lexicon.confidence_axes.map((a, j) => j === i ? { ...a, description: v } : a) })} />
          </div>
        ))}
      </div>

      {/* Reset */}
      <button type="button"
        onClick={() => onChangeDraft({ ...draft, lexicon: deepClone(DEFAULT_TRANSLATION_LEXICON), descriptions: { ...DEFAULT_TRANSLATION_DESCRIPTIONS } })}
        className="self-start text-[10px] text-ink-400 hover:text-ink-600 bg-transparent border-0 cursor-pointer p-0">
        Reset vocabulary to default values
      </button>

      {error && <span className="text-[10px] text-destructive">{error}</span>}

      {/* Save actions */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {sourceId && (
          <button type="button" onClick={onUpdate} disabled={saving || !draft.name.trim()}
            className="px-2 py-1 text-[11px] bg-ink-200 hover:bg-ink-300 text-ink-800 rounded border-0 cursor-pointer disabled:opacity-50">
            {saving ? 'Saving…' : `Update "${draft.name || '…'}"`}
          </button>
        )}
        <button type="button" onClick={onSaveAsNew} disabled={saving || !draft.name.trim()}
          className="px-2 py-1 text-[11px] bg-primary/10 hover:bg-primary/20 text-primary rounded border-0 cursor-pointer disabled:opacity-50">
          {saving ? 'Saving…' : 'Save as new'}
        </button>
        <button type="button" onClick={onClose}
          className="px-2 py-1 text-[11px] text-ink-500 hover:text-ink-700 bg-transparent border-0 cursor-pointer p-0">
          Close editor
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library

function LibraryPanel({
  lexicons, activeLexiconId, tagFilter, onTagFilterChange,
  onActivate, onEdit, onRename, onDuplicate, onDelete, onNewFromDefault,
}: {
  lexicons: TranslationLexiconDoc[];
  activeLexiconId: string | null;
  tagFilter: string;
  onTagFilterChange: (v: string) => void;
  onActivate: (id: string | null) => void;
  onEdit: (doc: TranslationLexiconDoc) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onNewFromDefault: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const filtered = tagFilter.trim()
    ? lexicons.filter(l => (l.tags ?? []).some(t => t.toLowerCase().includes(tagFilter.trim().toLowerCase())))
    : lexicons;

  const startRename = (l: TranslationLexiconDoc) => { setRenamingId(l.id); setRenameValue(l.name); };
  const commitRename = (id: string) => { if (renameValue.trim()) onRename(id, renameValue.trim()); setRenamingId(null); };

  return (
    <div className="flex flex-col gap-1.5 pt-1 border-t border-ink-200 mt-1">
      <div className="flex gap-1 items-center">
        <input type="text" value={tagFilter} onChange={e => onTagFilterChange(e.target.value)} placeholder="filter by tag…"
          className="flex-1 bg-ink-50 border border-ink-200 rounded px-1.5 py-1 text-[11px] text-ink-700 outline-none focus:border-ink-400" />
        {tagFilter && (
          <button type="button" onClick={() => onTagFilterChange('')} className="text-[10px] text-ink-400 hover:text-ink-600 bg-transparent border-0 cursor-pointer p-0">clear</button>
        )}
      </div>

      {/* Default row */}
      <div className={`flex items-center justify-between gap-1 px-1.5 py-1 rounded border ${activeLexiconId === null ? 'border-sky-700 bg-ink-50' : 'border-ink-200'}`}>
        <span className="text-[11px] text-ink-800">Default (built-in)</span>
        {activeLexiconId === null ? (
          <span className="text-[10px] text-sky-400 shrink-0">Active</span>
        ) : (
          <button type="button" onClick={() => onActivate(null)} className="text-[10px] text-sky-500 hover:text-sky-300 bg-transparent border-0 cursor-pointer p-0">Activate</button>
        )}
      </div>

      {filtered.map(l => (
        <div key={l.id} className={`flex flex-col gap-1 px-1.5 py-1 rounded border ${activeLexiconId === l.id ? 'border-sky-700 bg-ink-50' : 'border-ink-200'}`}>
          <div className="flex items-center justify-between gap-1">
            {renamingId === l.id ? (
              <input autoFocus type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(l.id)}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(l.id); if (e.key === 'Escape') setRenamingId(null); }}
                className="flex-1 bg-ink-100 border border-ink-300 rounded px-1 py-0.5 text-[11px] text-ink-800 outline-none" />
            ) : (
              <span className="text-[11px] text-ink-800 truncate flex-1">{l.name}</span>
            )}
            {activeLexiconId === l.id && <span className="text-[10px] text-sky-400 shrink-0">Active</span>}
          </div>

          {(l.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-0.5">
              {(l.tags ?? []).map(t => <span key={t} className="px-1 py-0.5 bg-ink-200 rounded text-[9px] text-ink-600">{t}</span>)}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {activeLexiconId !== l.id && (
              <button type="button" onClick={() => onActivate(l.id)} className="text-[10px] text-sky-500 hover:text-sky-300 bg-transparent border-0 cursor-pointer p-0">Activate</button>
            )}
            <button type="button" onClick={() => onEdit(l)} className="text-[10px] text-ink-600 hover:text-ink-800 bg-transparent border-0 cursor-pointer p-0">Edit</button>
            <button type="button" onClick={() => startRename(l)} className="text-[10px] text-ink-600 hover:text-ink-800 bg-transparent border-0 cursor-pointer p-0">Rename</button>
            <button type="button" onClick={() => onDuplicate(l.id)} className="text-[10px] text-ink-600 hover:text-ink-800 bg-transparent border-0 cursor-pointer p-0">Duplicate</button>
            <button type="button" onClick={() => onDelete(l.id, l.name)} className="text-[10px] text-destructive hover:text-destructive bg-transparent border-0 cursor-pointer p-0">Delete</button>
          </div>
        </div>
      ))}

      <button type="button" onClick={onNewFromDefault} className="self-start text-[10px] text-green-700 hover:text-green-600 bg-transparent border-0 cursor-pointer p-0 mt-0.5">
        + New translation lexicon from default
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level component

export const TranslationLexiconEditor: React.FC = () => {
  const { user } = useAuthContext();

  const lexicons = useTranslationLexiconStore(s => s.lexicons);
  const loading = useTranslationLexiconStore(s => s.loading);
  const activeLexiconId = useTranslationLexiconStore(s => s.activeLexiconId);
  const loadLexicons = useTranslationLexiconStore(s => s.loadLexicons);
  const createLexicon = useTranslationLexiconStore(s => s.createLexicon);
  const updateLexicon = useTranslationLexiconStore(s => s.updateLexicon);
  const deleteLexicon = useTranslationLexiconStore(s => s.deleteLexicon);
  const duplicateLexicon = useTranslationLexiconStore(s => s.duplicateLexicon);
  const setActiveLexiconId = useTranslationLexiconStore(s => s.setActiveLexiconId);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadLexicons(user.uid);
  }, [user, loadLexicons]);

  const draftFromDoc = useCallback((doc: TranslationLexiconDoc): EditorDraft => ({
    name: doc.name,
    tags: doc.tags ? [...doc.tags] : [],
    descriptions: { ...DEFAULT_TRANSLATION_DESCRIPTIONS, ...(doc.descriptions ?? {}) },
    lexicon: deepClone(doc.lexicon),
  }), []);

  const openEditor = useCallback((doc: TranslationLexiconDoc) => {
    setDraft(draftFromDoc(doc));
    setEditingSourceId(doc.id);
    setError(null);
    setEditorOpen(true);
    setLibraryOpen(false);
  }, [draftFromDoc]);

  const draftFromDefault = (): EditorDraft => ({
    name: '',
    tags: [],
    descriptions: { ...DEFAULT_TRANSLATION_DESCRIPTIONS },
    lexicon: deepClone(DEFAULT_TRANSLATION_LEXICON),
  });

  const openEditorForActive = useCallback(() => {
    const activeDoc = activeLexiconId ? lexicons.find(l => l.id === activeLexiconId) : null;
    if (activeDoc) {
      openEditor(activeDoc);
    } else {
      setDraft(draftFromDefault());
      setEditingSourceId(null);
      setError(null);
      setEditorOpen(true);
      setLibraryOpen(false);
    }
  }, [activeLexiconId, lexicons, openEditor]);

  const openNewFromDefault = useCallback(() => {
    setDraft(draftFromDefault());
    setEditingSourceId(null);
    setError(null);
    setEditorOpen(true);
    setLibraryOpen(false);
  }, []);

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

  const handleRename = async (id: string, name: string) => {
    try { await updateLexicon(id, { name }); } catch { /* inline field reverts on next render */ }
  };

  const handleDuplicate = async (id: string) => {
    if (!user) return;
    try { await duplicateLexicon(id, user.uid); } catch { /* no-op */ }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete translation lexicon "${name}"?`)) return;
    try {
      await deleteLexicon(id);
      if (editingSourceId === id) setEditorOpen(false);
    } catch { /* no-op */ }
  };

  if (!user) {
    return (
      <div className="text-ink-400 text-[11px] italic px-1">
        Sign in to create and use custom translation lexicons.
      </div>
    );
  }

  const activeName = activeLexiconId
    ? (lexicons.find(l => l.id === activeLexiconId)?.name ?? 'Unknown')
    : 'Default';

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-ink-100 border border-ink-200 rounded">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-ink-600 font-medium">
          Translation vocabulary:&nbsp;
          <span className="text-ink-800">{loading ? '…' : activeName}</span>
        </span>
        <div className="flex gap-2">
          <button type="button"
            onClick={() => { setLibraryOpen(v => !v); if (editorOpen) setEditorOpen(false); }}
            className="text-[10px] text-ink-500 hover:text-ink-700 bg-transparent border-0 cursor-pointer underline p-0">
            {libraryOpen ? 'Close library' : 'Library'}
          </button>
          <button type="button"
            onClick={() => { openEditorForActive(); setLibraryOpen(false); }}
            className="text-[10px] text-ink-500 hover:text-ink-700 bg-transparent border-0 cursor-pointer underline p-0">
            {editorOpen ? 'Close editor' : 'Edit'}
          </button>
        </div>
      </div>

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
