import React, { useRef } from 'react';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useAppStore } from '../../store/useAppStore';

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
  const setActiveMode = useAppStore(s => s.setActiveMode);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Extract base64 and media type from data URL
      const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
      if (match) {
        setImage(dataUrl, match[2], match[1]);
      }
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleLoadAndSwitch = (mode: 'builder' | 'pataphysical') => {
    loadIntoBuilder();
    setActiveMode(mode);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
          onClick={encode}
          disabled={isEncoding}
          style={{
            padding: 10, background: isEncoding ? '#334155' : '#1e3a5f',
            border: 'none', borderRadius: 6, color: 'white',
            cursor: isEncoding ? 'wait' : 'pointer',
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
