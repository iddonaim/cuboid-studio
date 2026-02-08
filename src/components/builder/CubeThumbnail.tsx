import React from 'react';
import { CubeVariation } from '../../lib/cube/specifications';

interface CubeThumbnailProps {
  variation: CubeVariation;
  selected: boolean;
  onClick: () => void;
}

export const CubeThumbnail: React.FC<CubeThumbnailProps> = ({ variation, selected, onClick }) => {
  return (
    <div
      onClick={onClick}
      style={{
        width: 70,
        height: 70,
        borderRadius: 6,
        cursor: 'pointer',
        border: selected ? '2px solid #818cf8' : '2px solid transparent',
        background: selected ? '#4f46e5' : '#1e293b',
        overflow: 'hidden',
      }}
    >
      <img
        src={`/thumbnails/${variation.id}.png`}
        alt={variation.id}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>
  );
};
