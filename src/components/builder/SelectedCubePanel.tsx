import React from 'react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useIsMobile, useIsTouch } from '../../hooks/useIsMobile';

export const SelectedCubePanel: React.FC = () => {
  const selectedCubeId = useBuilderStore(s => s.selectedCubeId);
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const handleDelete = useBuilderStore(s => s.handleDelete);
  const rotateSelectedCube = useBuilderStore(s => s.rotateSelectedCube);
  const isMobile = useIsMobile();
  const isTouch = useIsTouch();

  if (!selectedCubeId) return null;

  const selectedCube = placedCubes.find(c => c.id === selectedCubeId);

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      right: 16,
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: 8,
      padding: 16,
      width: isMobile ? 160 : 200,
    }}>
      <p style={{ color: 'white', fontSize: 14, marginBottom: 4 }}>Selected Cube</p>
      <p style={{ color: '#64748b', fontSize: 11, marginBottom: 12 }}>
        {selectedCube?.variationId}
      </p>

      {/* Show rotation buttons on any touch device (phone or tablet) */}
      {isTouch && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button
            onClick={() => rotateSelectedCube('y')}
            title="Rotate around Y axis"
            style={{
              flex: 1,
              padding: '10px 0',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ↻
          </button>
          <button
            onClick={() => rotateSelectedCube('x')}
            title="Tip around X axis"
            style={{
              flex: 1,
              padding: '10px 0',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ↺
          </button>
        </div>
      )}

      <button
        onClick={handleDelete}
        style={{
          width: '100%',
          padding: isMobile ? 12 : 8,
          background: '#7f1d1d',
          border: 'none',
          borderRadius: 6,
          color: 'white',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        Delete
      </button>
    </div>
  );
};
