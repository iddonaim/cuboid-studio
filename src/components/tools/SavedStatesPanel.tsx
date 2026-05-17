import React, { useState, useEffect, useCallback } from 'react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import {
  listSavedStates,
  saveState,
  deleteSavedState,
  savedStateToPlacedCubes,
  SavedState,
} from '../../lib/savedStates';
import { Button } from '@/components/ui/button';

export const SavedStatesPanel: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const setPlacedCubes = useBuilderStore(s => s.setPlacedCubes);
  const cubeOperators = useMemeStore(s => s.cubeOperators);

  const [states, setStates] = useState<SavedState[]>([]);
  const [saveName, setSaveName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(() => setStates(listSavedStates()), []);

  useEffect(() => {
    if (expanded) refresh();
  }, [expanded, refresh]);

  const handleSave = () => {
    if (placedCubes.length === 0) return;
    saveState(saveName, placedCubes, cubeOperators);
    setSaveName('');
    refresh();
  };

  const handleLoad = (state: SavedState) => {
    const cubes = savedStateToPlacedCubes(state);
    setPlacedCubes(cubes);
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      deleteSavedState(id);
      setConfirmDeleteId(null);
      refresh();
    } else {
      setConfirmDeleteId(id);
    }
  };

  const hasCubes = placedCubes.length > 0;

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="border-t border-slate-700 pt-2.5 mt-1">
      <button
        onClick={() => { setExpanded(e => !e); setConfirmDeleteId(null); }}
        className="w-full flex items-center justify-between bg-transparent border-0 text-slate-400 text-[11px] font-semibold cursor-pointer pb-1.5"
      >
        <span>Saved States</span>
        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-[9px] text-slate-600`} />
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5">

          {/* Save row */}
          <div className="flex gap-1">
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && hasCubes && handleSave()}
              placeholder={`Assembly ${states.length + 1}`}
              className="flex-1 px-1.5 py-1 text-[10px] bg-slate-800 border border-slate-700 rounded text-slate-400 outline-none"
            />
            <Button
              onClick={handleSave}
              disabled={!hasCubes}
              title={hasCubes ? 'Save current assembly' : 'No cubes to save'}
              className={`h-auto py-1 px-2 text-[10px] border-0 whitespace-nowrap ${
                hasCubes
                  ? 'bg-emerald-900 hover:bg-emerald-800 text-emerald-300'
                  : 'bg-slate-950 text-slate-600 cursor-default'
              }`}
            >
              Save
            </Button>
          </div>

          {/* State list */}
          {states.length === 0 ? (
            <div className="text-slate-600 text-[9px] italic pl-0.5">No saved states yet</div>
          ) : (
            states.map(state => (
              <div
                key={state.id}
                className="flex items-center gap-1 py-1.5 px-1.5 bg-slate-950 border border-slate-800 rounded"
              >
                <div className="flex-1 overflow-hidden">
                  <div className="text-slate-400 text-[10px] truncate">{state.name}</div>
                  <div className="text-slate-600 text-[9px]">
                    {state.cubeCount} cube{state.cubeCount !== 1 ? 's' : ''} · {fmtDate(state.savedAt)}
                  </div>
                </div>

                <Button
                  onClick={() => handleLoad(state)}
                  title="Load this state into builder"
                  className="h-auto py-px px-1.5 text-[9px] border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 whitespace-nowrap"
                >
                  Load
                </Button>

                <button
                  onClick={() => handleDelete(state.id)}
                  title={confirmDeleteId === state.id ? 'Click again to confirm delete' : 'Delete'}
                  className={`py-px px-1.5 rounded border-0 cursor-pointer text-[9px] ${
                    confirmDeleteId === state.id
                      ? 'bg-red-900 text-red-300'
                      : 'bg-transparent text-slate-600 hover:text-red-400'
                  }`}
                >
                  <i className="fas fa-trash text-[8px]" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
