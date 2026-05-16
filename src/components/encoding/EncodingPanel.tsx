import React, { useRef } from 'react';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useAppStore } from '../../store/useAppStore';
import { listSavedStates, SavedState } from '../../lib/savedStates';

export const EncodingPanel: React.FC = () => {
  const uploadedImage = useEncodingStore(s => s.uploadedImage);
  const setImage = useEncodingStore(s => s.setImage);
  const clearImage = useEncodingStore(s => s.clearImage);
  const isEncoding = useEncodingStore(s => s.isEncoding);
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const encodingReasoning = useEncodingStore(s => s.encodingReasoning);
  const lastError = useEncodingStore(s => s.lastError);
  const encode = useEncodingStore(s => s.encode);
  const loadIntoBuilder = useEncodingStore(s => s.loadIntoBuilder);
  const mode = useEncodingStore(s => s.mode);
  const setMode = useEncodingStore(s => s.setMode);
  const setSeedFromBuilder = useEncodingStore(s => s.setSeedFromBuilder);
  const setSeedFromSavedState = useEncodingStore(s => s.setSeedFromSavedState);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const setActiveMode = useAppStore(s => s.setActiveMode);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedStates, setSavedStates] = React.useState<SavedState[]>([]);
  const [selectedSeedId, setSelectedSeedId] = React.useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
      if (match) {
        setImage(dataUrl, match[2], match[1]);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLoadAndSwitch = (target: 'builder' | 'pataphysical') => {
    loadIntoBuilder();
    setActiveMode(target);
  };

  const handleModeSelect = (newMode: 'standalone' | 'merge' | 'remix') => {
    setMode(newMode);
    setSelectedSeedId(null);
    if (newMode === 'merge') {
      setSeedFromBuilder();
    }
    if (newMode === 'remix') {
      setSavedStates(listSavedStates());
    }
  };

  const handleSeedSelect = (s: SavedState) => {
    setSelectedSeedId(s.id);
    setSeedFromSavedState(s);
  };

  const encodeDisabled =
    isEncoding ||
    (mode === 'merge' && seedCubes.length === 0) ||
    (mode === 'remix' && seedCubes.length === 0);

  const handleEncode = () => {
    if (mode === 'merge') {
      setSeedFromBuilder();
    }
    encode();
  };

  const MODE_LABELS: { value: 'standalone' | 'merge' | 'remix'; label: string }[] = [
    { value: 'standalone', label: 'Standalone' },
    { value: 'merge', label: 'Merge' },
    { value: 'remix', label: 'Remix' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 4 }}>
        {MODE_LABELS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleModeSelect(value)}
            style={{
              flex: 1,
              padding: '6px 4px',
              background: mode === value ? '#1e3a5f' : '#1e293b',
              border: mode === value ? '1px solid #3b82f6' : '1px solid #334155',
              borderRadius: 6,
              color: mode === value ? '#93c5fd' : '#64748b',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: mode === value ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Merge notice */}
      {mode === 'merge' && (
        <div style={{
          padding: 8, background: '#1e293b', borderRadius: 4,
          border: '1px solid #334155', fontSize: 11,
        }}>
          {seedCubes.length > 0 ? (
            <span style={{ color: '#94a3b8' }}>
              Seed: {seedCubes.length} cube{seedCubes.length !== 1 ? 's' : ''} from current assembly
            </span>
          ) : (
            <span style={{ color: '#ef4444' }}>
              Builder is empty. Add cubes to the Builder first.
            </span>
          )}
        </div>
      )}

      {/* Remix seed picker */}
      {mode === 'remix' && !uploadedImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ color: '#64748b', fontSize: 10 }}>Select a seed assembly:</div>
          {savedStates.length === 0 ? (
            <div style={{
              padding: 8, background: '#1e293b', borderRadius: 4,
              color: '#64748b', fontSize: 11, fontStyle: 'italic',
            }}>
              No saved states — save an assembly first.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 140, overflowY: 'auto' }}>
              {savedStates.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSeedSelect(s)}
                  style={{
                    padding: '6px 8px',
                    background: selectedSeedId === s.id ? '#1e3a5f' : '#1e293b',
                    border: selectedSeedId === s.id ? '1px solid #3b82f6' : '1px solid #334155',
                    borderRadius: 4,
                    color: selectedSeedId === s.id ? '#93c5fd' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 10,
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ color: '#475569', fontSize: 9 }}>
                    {s.cubeCount}c · {new Date(s.savedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image upload area */}
      {!uploadedImage ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: 24,
            border: '2px dashed #334155',
            borderRadius: 8,
            cursor: 'pointer',
            textAlign: 'center',
            background: '#1e293b',
          }}
        >
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
            Upload or capture a photo
          </div>
          <div style={{ color: '#475569', fontSize: 10 }}>
            A street corner, a shop, an office, a room...
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <img
            src={uploadedImage}
            alt="Uploaded space"
            style={{
              width: '100%',
              borderRadius: 6,
              objectFit: 'contain',
              maxHeight: 160,
              background: '#0f172a',
            }}
          />
          <button
            onClick={clearImage}
            style={{
              position: 'absolute', top: 4, right: 4,
              background: '#0f172a', border: 'none', color: '#94a3b8',
              borderRadius: 4, cursor: 'pointer', fontSize: 14,
              padding: '2px 6px', lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Hidden file input — accept image/* with camera capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Separate buttons for gallery and camera on mobile */}
      {!uploadedImage && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute('capture');
                fileInputRef.current.click();
              }
            }}
            style={{
              flex: 1, padding: 8, background: '#1e293b',
              border: '1px solid #334155', borderRadius: 6,
              color: '#94a3b8', cursor: 'pointer', fontSize: 10,
            }}
          >
            Gallery
          </button>
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.setAttribute('capture', 'environment');
                fileInputRef.current.click();
              }
            }}
            style={{
              flex: 1, padding: 8, background: '#1e293b',
              border: '1px solid #334155', borderRadius: 6,
              color: '#94a3b8', cursor: 'pointer', fontSize: 10,
            }}
          >
            Camera
          </button>
        </div>
      )}

      {/* Encode button */}
      {uploadedImage && !encodedCubes && (
        <button
          onClick={handleEncode}
          disabled={encodeDisabled}
          title={
            mode === 'merge' && seedCubes.length === 0
              ? 'Add cubes to the Builder first'
              : mode === 'remix' && seedCubes.length === 0
              ? 'Select a seed assembly above'
              : undefined
          }
          style={{
            padding: 10,
            background: encodeDisabled ? '#334155' : '#1e3a5f',
            border: 'none', borderRadius: 6, color: encodeDisabled ? '#64748b' : 'white',
            cursor: encodeDisabled ? 'not-allowed' : isEncoding ? 'wait' : 'pointer',
            fontSize: 12, fontWeight: 600,
          }}
        >
          {isEncoding ? 'Encoding space...' : 'Encode'}
        </button>
      )}

      {/* Error display */}
      {lastError && (
        <div style={{
          padding: 8, background: '#7f1d1d', borderRadius: 4,
          color: '#fca5a5', fontSize: 11, lineHeight: 1.4,
        }}>
          {lastError}
        </div>
      )}

      {/* Result */}
      {encodedCubes && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* Reasoning */}
          {encodingReasoning && (
            <div style={{
              padding: 8, background: '#1e293b', borderRadius: 4,
              color: '#cbd5e1', fontSize: 11, lineHeight: 1.5,
              fontStyle: 'italic', border: '1px solid #334155',
            }}>
              {encodingReasoning}
            </div>
          )}

          {/* Stats */}
          <div style={{ color: '#94a3b8', fontSize: 11 }}>
            {encodedCubes.length} cubes encoded
            {' '}({new Set(encodedCubes.map(c => c.variationId)).size} unique variations)
          </div>

          {/* Variation list */}
          <div style={{
            maxHeight: 100, overflowY: 'auto',
            display: 'flex', flexWrap: 'wrap', gap: 4,
          }}>
            {encodedCubes.map((cube, i) => (
              <span key={i} style={{
                padding: '2px 6px', background: '#334155',
                borderRadius: 3, color: '#94a3b8', fontSize: 9,
              }}>
                {cube.variationId}
              </span>
            ))}
          </div>

          {/* Action buttons */}
          <button
            onClick={() => handleLoadAndSwitch('builder')}
            style={{
              padding: 10, background: '#065f46', border: 'none',
              borderRadius: 6, color: 'white', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
            }}
          >
            Load into Builder
          </button>
          <button
            onClick={() => handleLoadAndSwitch('pataphysical')}
            style={{
              padding: 10, background: '#7c2d12', border: 'none',
              borderRadius: 6, color: 'white', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
            }}
          >
            Load + Apply Memes
          </button>

          {/* Re-encode */}
          <button
            onClick={() => {
              useEncodingStore.setState({ encodedCubes: null, encodingReasoning: null });
            }}
            style={{
              padding: 6, background: 'transparent',
              border: '1px solid #334155', borderRadius: 6,
              color: '#64748b', cursor: 'pointer', fontSize: 10,
            }}
          >
            Re-encode
          </button>
        </div>
      )}
    </div>
  );
};
