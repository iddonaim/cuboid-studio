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
    <div style={{ borderTop: '1px solid #334155', paddingTop: 10, marginTop: 4 }}>
      <button
        onClick={() => { setExpanded(e => !e); setConfirmDeleteId(null); }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          padding: '0 0 6px',
        }}
      >
        <span>Saved States</span>
        <i
          className={`fas fa-chevron-${expanded ? 'up' : 'down'}`}
          style={{ fontSize: 9, color: '#475569' }}
        />
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>

          {/* Save row */}
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && hasCubes && handleSave()}
              placeholder={`Assembly ${states.length + 1}`}
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: 10,
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 4,
                color: '#94a3b8',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSave}
              disabled={!hasCubes}
              title={hasCubes ? 'Save current assembly' : 'No cubes to save'}
              style={{
                padding: '4px 8px',
                fontSize: 10,
                borderRadius: 4,
                border: 'none',
                background: hasCubes ? '#065f46' : '#0f172a',
                color: hasCubes ? '#6ee7b7' : '#475569',
                cursor: hasCubes ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
              }}
            >
              Save
            </button>
          </div>

          {/* State list */}
          {states.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 9, fontStyle: 'italic', paddingLeft: 2 }}>
              No saved states yet
            </div>
          ) : (
            states.map(state => (
              <div
                key={state.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 6px',
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 4,
                }}
              >
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{
                    color: '#94a3b8',
                    fontSize: 10,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {state.name}
                  </div>
                  <div style={{ color: '#475569', fontSize: 9 }}>
                    {state.cubeCount} cube{state.cubeCount !== 1 ? 's' : ''} · {fmtDate(state.savedAt)}
                  </div>
                </div>

                <button
                  onClick={() => handleLoad(state)}
                  title="Load this state into builder"
                  style={{
                    padding: '2px 6px',
                    fontSize: 9,
                    borderRadius: 3,
                    border: '1px solid #334155',
                    background: '#1e293b',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Load
                </button>

                <button
                  onClick={() => handleDelete(state.id)}
                  title={confirmDeleteId === state.id ? 'Click again to confirm delete' : 'Delete'}
                  style={{
                    padding: '2px 5px',
                    fontSize: 9,
                    borderRadius: 3,
                    border: 'none',
                    background: confirmDeleteId === state.id ? '#7f1d1d' : 'none',
                    color: confirmDeleteId === state.id ? '#fca5a5' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fas fa-trash" style={{ fontSize: 8 }} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
