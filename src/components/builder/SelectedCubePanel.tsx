import React from 'react';
import { useBuilderStore } from '../../store/useBuilderStore';

export const SelectedCubePanel: React.FC = () => {
  const selectedCubeId = useBuilderStore(s => s.selectedCubeId);
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const handleDelete = useBuilderStore(s => s.handleDelete);

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
      width: 200,
    }}>
      <p style={{ color: 'white', fontSize: 14, marginBottom: 8 }}>Selected Cube</p>
      <p style={{ color: '#64748b', fontSize: 11, marginBottom: 12 }}>
        {selectedCube?.variationId}
      </p>
      <button
        onClick={handleDelete}
        style={{
          width: '100%', padding: 8, background: '#7f1d1d',
          border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 12,
        }}
      >
        Delete
      </button>
    </div>
  );
};
