import React, { useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import { useDecodeStore } from '../../store/useDecodeStore';
import {
  listSavedStates,
  saveState,
  deleteSavedState,
  savedStateToPlacedCubes,
  savedStateToOperators,
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
  const [confirmLoadId, setConfirmLoadId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const refresh = useCallback(() => setStates(listSavedStates()), []);

  useEffect(() => {
    if (expanded) refresh();
  }, [expanded, refresh]);

  const handleSave = () => {
    if (placedCubes.length === 0) return;
    const decode = useDecodeStore.getState();
    saveState(saveName, placedCubes, cubeOperators, {
      canvasTiles: decode.canvasTiles,
      freestyle: decode.freestyle,
    });
    setSaveName('');
    refresh();
  };

  const handleLoad = async (state: SavedState) => {
    setConfirmLoadId(null);
    setLoadingId(state.id);
    const cubes = savedStateToPlacedCubes(state);
    setPlacedCubes(cubes);

    // A save carries the per-cube meme cuts alongside the cubes. Loading only
    // the cubes left those behind — the assembly came back uncut, and the
    // previous assembly's operator records stayed in the meme store keyed to
    // ids that no longer exist. Replace both, rebuilding the cut geometry the
    // same way a composition load does.
    const operators = savedStateToOperators(state);
    const variations: Record<string, string> = {};
    for (const cube of cubes) variations[cube.id] = cube.variationId;

    const { rebuildAssemblyGeometry } = await import('../../lib/projects/composition');
    const rebuilt = await rebuildAssemblyGeometry(variations, operators);
    useMemeStore.setState({
      cubeOperators: operators,
      cubeGeometryOverrides: rebuilt.cubeGeometryOverrides,
      cubeGeometryStacks: rebuilt.cubeGeometryStacks,
      cubeTranslations: rebuilt.cubeTranslations,
      targetCubeId: null,
    });

    // Restore the decode canvas layer when the save carries one; older saves
    // don't, and for those the current canvas is left untouched.
    if (state.decode) {
      useDecodeStore.setState({
        canvasTiles: state.decode.canvasTiles,
        freestyle: state.decode.freestyle,
        selectedTileId: null,
        pendingPlacementVariationId: null,
      });
    }
    setLoadingId(null);
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
    <div className="border-t border-ink-200 pt-2.5 mt-1">
      <button
        onClick={() => { setExpanded(e => !e); setConfirmDeleteId(null); }}
        className="w-full flex items-center justify-between bg-transparent border-0 text-ink-600 text-[12px] font-semibold cursor-pointer pb-1.5"
      >
        <span>Saved States</span>
        {expanded ? <ChevronUp size={11} className="text-ink-400" /> : <ChevronDown size={11} className="text-ink-400" />}
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
              className="flex-1 px-1.5 py-1 text-[11px] bg-ink-100 border border-ink-200 rounded text-ink-600 outline-none"
            />
            <Button
              onClick={handleSave}
              disabled={!hasCubes}
              title={hasCubes ? 'Save current assembly' : 'No cubes to save'}
              className={`h-auto py-1 px-2 text-[11px] border-0 whitespace-nowrap ${
                hasCubes
                  ? 'bg-primary/10 hover:bg-primary/20 text-primary'
                  : 'bg-ink-100 text-ink-400 cursor-default'
              }`}
            >
              Save
            </Button>
          </div>

          {/* State list */}
          {states.length === 0 ? (
            <div className="text-ink-400 text-[10px] italic pl-0.5">No saved states yet</div>
          ) : (
            states.map(state => (
              <div
                key={state.id}
                className="flex flex-col gap-1 py-1.5 px-1.5 bg-ink-100 border border-ink-200 rounded"
              >
                <div className="flex items-center gap-1">
                  <div className="flex-1 overflow-hidden">
                    <div className="text-ink-600 text-[11px] truncate">{state.name}</div>
                    <div className="text-ink-400 text-[10px]">
                      {state.cubeCount} cube{state.cubeCount !== 1 ? 's' : ''} · {fmtDate(state.savedAt)}
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      setConfirmDeleteId(null);
                      // Nothing to lose with an empty canvas — skip the confirm.
                      if (!hasCubes) { void handleLoad(state); return; }
                      setConfirmLoadId(id => (id === state.id ? null : state.id));
                    }}
                    disabled={loadingId !== null}
                    title="Replace the current assembly with this saved one"
                    className="h-auto py-px px-1.5 text-[10px] border border-ink-200 bg-ink-100 text-ink-600 hover:bg-ink-200 whitespace-nowrap"
                  >
                    {loadingId === state.id ? 'Loading…' : 'Load'}
                  </Button>

                  <button
                    onClick={() => { setConfirmLoadId(null); handleDelete(state.id); }}
                    title={confirmDeleteId === state.id ? 'Click again to confirm delete' : 'Delete'}
                    className={`py-px px-1.5 rounded border-0 cursor-pointer text-[10px] ${
                      confirmDeleteId === state.id
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-transparent text-ink-400 hover:text-destructive'
                    }`}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>

                {/* Loading is a full replacement, including the meme cuts — say
                    so before it wipes unsaved work. */}
                {confirmLoadId === state.id && (
                  <div className="flex flex-col gap-1 pt-1 border-t border-ink-200">
                    <div className="text-ink-500 text-[10px] leading-relaxed">
                      Replaces your current {placedCubes.length}-cube assembly and its
                      cuts. Save it first if you want to keep it.
                    </div>
                    <div className="flex gap-1">
                      <Button
                        onClick={() => void handleLoad(state)}
                        className="flex-1 h-auto py-1 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary border-0"
                      >
                        Replace
                      </Button>
                      <Button
                        onClick={() => setConfirmLoadId(null)}
                        className="flex-1 h-auto py-1 text-[10px] bg-transparent hover:bg-ink-200 text-ink-500 border border-ink-200"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
